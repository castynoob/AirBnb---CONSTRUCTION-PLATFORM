// =============================================================================
// Referrals — user-owned promo codes with attribution tracking.
//
// Reuses the existing `promo_codes` infrastructure for the actual discount
// delivery. This controller adds:
//   1. A short shareable code that identifies a user (not the same as a
//      promo code — a referral code is a persistent ID, promo codes are the
//      one-off rewards issued when a referral converts).
//   2. Attribution rows so we know who referred whom, when they signed up,
//      and when they became a paying customer.
//   3. Admin-editable settings (discount percentages + on/off switch).
//
// Reward lifecycle:
//   • Signup with a referral code → row inserted into `referrals`, plus a
//     `promo_codes` row auto-issued to the REFEREE (their signup discount).
//   • Referee's first paid subscription clears → `referrals.converted_at`
//     stamped, plus a `promo_codes` row issued to the REFERRER. This second
//     step is deferred (needs Stripe webhook wiring) — for now we leave
//     `converted_at` null so the admin dashboard can highlight pending
//     rewards.
// =============================================================================

import pool from "../config/db.js";
import PromoCode from "../models/promoCodeModel.js";
import stripe from "../config/stripe.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// Short, human-readable, non-confusing codes. Skips 0/O/1/I/L to avoid the
// classic "did you say oh or zero" phone-support problem.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const randomCode = (len = 8) => {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
};

// Get-or-create a user's referral code. Called from `my-info` and from the
// user's profile page's first render. Race-safe via the UNIQUE index on
// user_id — a duplicate insert falls back to a SELECT.
export const getOrCreateReferralCode = async (userId) => {
  const existing = await pool.query(
    `SELECT code FROM public.referral_codes WHERE user_id = $1`,
    [userId]
  );
  if (existing.rows[0]) return existing.rows[0].code;

  // Try a few times to avoid the (statistically negligible) chance of a
  // code collision. UNIQUE(code) enforces this at the DB level.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomCode(8);
    try {
      const inserted = await pool.query(
        `INSERT INTO public.referral_codes (user_id, code) VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING code`,
        [userId, candidate]
      );
      if (inserted.rows[0]) return inserted.rows[0].code;
      // Row already existed (race). Re-read.
      const reread = await pool.query(
        `SELECT code FROM public.referral_codes WHERE user_id = $1`,
        [userId]
      );
      if (reread.rows[0]) return reread.rows[0].code;
    } catch (err) {
      // 23505 = unique violation on `code` (collision with another user).
      // Retry with a fresh random. Any other error bubbles.
      if (err.code !== "23505") throw err;
    }
  }
  throw new Error("Failed to generate a unique referral code after 5 attempts.");
};

const getSettings = async () => {
  const { rows } = await pool.query(
    `SELECT active, referrer_discount_percent, referee_discount_percent
       FROM public.referral_settings WHERE id = 1`
  );
  return rows[0] || {
    active: true, referrer_discount_percent: 20, referee_discount_percent: 20,
  };
};

// Normalise contact info for anti-abuse dedup. Case-insensitive email + phone
// digits only. Handles gmail's dot-tolerance so a.b@gmail == ab@gmail.
const normalizeEmail = (e) => {
  if (!e) return "";
  const trimmed = String(e).trim().toLowerCase();
  const [local, domain] = trimmed.split("@");
  if (!domain) return trimmed;
  // Gmail treats dots as insignificant; strip them so tricks like
  // silver.dave@gmail vs silverdave@gmail don't slip past the dedup.
  const cleanLocal = domain === "gmail.com" || domain === "googlemail.com"
    ? local.replace(/\./g, "")
    : local;
  return `${cleanLocal}@${domain}`;
};
const normalizePhone = (p) => (p ? String(p).replace(/\D/g, "") : "");

// -----------------------------------------------------------------------------
// Registration integration — called from the entrepreneur + PM signup flows.
//
// If the new user provided a referral_code that resolves to another user AND
// the referral programme is active, and the two accounts don't share obvious
// identity signals (email / phone), we record a PENDING referral row.
//
// Reward issuance happens later, in markReferralConverted, when the referee's
// first paid subscription clears via the Stripe webhook. Nothing is created
// or promised at signup — that's the anti-abuse posture.
//
// All failures are swallowed and logged — a failed referral must NEVER block
// a signup. The caller passes { newUserId, referralCodeInput }.
// -----------------------------------------------------------------------------
// Rate-limit window: reject if the same referrer already had a signup from
// the same IP inside this many hours. 24h is long enough to catch same-day
// farming, short enough to allow legitimate household referrals over time.
const IP_RATE_LIMIT_HOURS = 24;

// Dev / test escape hatch. When `REFERRAL_ANTIABUSE_ENABLED=false` is set in
// the environment, the same-email / same-phone / same-IP / self-referral
// guards are skipped so a developer can test the reward flow end-to-end
// from a single machine with a single email. Role gates are still enforced
// so a PM can't accidentally referee themselves into a broken state.
//
// Default = ON (checks enforced). Anything other than the literal string
// "false" (case-insensitive) leaves the guards on — fail-safe.
const isAntiAbuseEnabled = () =>
  String(process.env.REFERRAL_ANTIABUSE_ENABLED ?? "true").toLowerCase() !== "false";

export const attemptReferralAttribution = async ({ newUserId, referralCodeInput, signupIp = null }) => {
  const code = (referralCodeInput || "").trim().toUpperCase();
  if (!code) return null;

  try {
    const settings = await getSettings();
    if (!settings.active) return null;

    // Resolve the code owner (the referrer) AND fetch the fresh signup's
    // contact info so we can run identity checks below.
    const [ownerRes, refereeRes] = await Promise.all([
      pool.query(
        `SELECT rc.user_id, u.first_name, u.last_name, u.email, u.phone, u.role
           FROM public.referral_codes rc
           JOIN public.users u ON u.id = rc.user_id
          WHERE rc.code = $1`,
        [code]
      ),
      pool.query(
        `SELECT email, phone, role FROM public.users WHERE id = $1`,
        [newUserId]
      ),
    ]);
    if (ownerRes.rows.length === 0)   return { blocked: "unknown_code" };
    if (refereeRes.rows.length === 0) return { blocked: "unknown_referee" };

    const owner   = ownerRes.rows[0];
    const referee = refereeRes.rows[0];

    // Role gate — the referral programme is contractor-only for now, because
    // the reward is a subscription discount and only entrepreneurs pay for
    // subscriptions on the platform. Enforced ALWAYS (not behind the anti-
    // abuse flag) since letting it slip through would silently break the
    // discount UX for the wrong role.
    if (owner.role !== "entrepreneur")   return { blocked: "referrer_not_contractor" };
    if (referee.role !== "entrepreneur") return { blocked: "referee_not_contractor" };

    // ── Identity-based anti-abuse guards ──────────────────────────────────
    // Wrapped behind the REFERRAL_ANTIABUSE_ENABLED env flag so a dev can
    // test the full reward flow from one machine. Turned OFF only in dev.
    if (isAntiAbuseEnabled()) {
      // Self-referral: same user id.
      if (owner.user_id === newUserId) return { blocked: "self_referral" };

      // Same-person guard — a bad actor with two accounts is the primary
      // gaming vector, and email + phone match are the cheapest defenses.
      // We compare NORMALIZED values so dot-tricks / formatting differences
      // don't slip past.
      if (normalizeEmail(owner.email) === normalizeEmail(referee.email)) {
        console.warn(`⚠️ referral blocked (email match) — referrer=${owner.user_id} referee=${newUserId}`);
        return { blocked: "duplicate_email" };
      }
      if (
        normalizePhone(owner.phone) &&
        normalizePhone(owner.phone) === normalizePhone(referee.phone)
      ) {
        console.warn(`⚠️ referral blocked (phone match) — referrer=${owner.user_id} referee=${newUserId}`);
        return { blocked: "duplicate_phone" };
      }

      // Same-IP rate limit — reject if this referrer already got a signup
      // from the same IP inside IP_RATE_LIMIT_HOURS. Skip the check if we
      // don't have an IP (e.g. tests / non-HTTP flows).
      if (signupIp) {
        const recent = await pool.query(
          `SELECT 1
             FROM public.referrals
            WHERE referrer_user_id = $1
              AND signup_ip = $2
              AND created_at > NOW() - INTERVAL '${IP_RATE_LIMIT_HOURS} hours'
            LIMIT 1`,
          [owner.user_id, signupIp]
        );
        if (recent.rowCount > 0) {
          console.warn(`⚠️ referral blocked (ip rate limit) — referrer=${owner.user_id} referee=${newUserId} ip=${signupIp}`);
          return { blocked: "ip_rate_limit" };
        }
      }
    } else {
      console.log(`ℹ️ referral anti-abuse checks SKIPPED (env flag off) — referrer=${owner.user_id} referee=${newUserId}`);
    }

    // Persist the attribution as PENDING. No promos are created yet — the
    // referee's discount is applied automatically at their first-subscription
    // checkout (see paymentController), and the referrer's promo fires from
    // markReferralConverted() when that first payment clears.
    await pool.query(
      `INSERT INTO public.referrals (referrer_user_id, referee_user_id, code_used, signup_ip)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (referee_user_id) DO NOTHING`,
      [owner.user_id, newUserId, code, signupIp]
    );

    return { pending: true, referrerUserId: owner.user_id };
  } catch (err) {
    // Log + swallow. Signup must succeed even if referral bookkeeping fails.
    console.error("⚠️ referral attribution failed (non-fatal):", err.message);
    return null;
  }
};

// -----------------------------------------------------------------------------
// Checkout-time hook — called from paymentController.createSubscription BEFORE
// the Stripe subscription is created. If the user has a pending referral
// AND hasn't manually supplied a promo code, we generate a single-use Stripe
// promotion code from the referee's discount percentage and hand back the
// Stripe promo ID. Caller attaches it to `subscriptionOptions.promotion_code`.
//
// This is what makes the discount instant instead of "for your next renewal":
// the referee sees their percent-off applied at Stripe checkout the moment
// they subscribe. The referrer's reward still waits for the first-invoice
// clearance (markReferralConverted).
// -----------------------------------------------------------------------------
export const applyReferralDiscountAtCheckout = async ({ userId }) => {
  try {
    // Cheap early-out: any referral at all?
    const { rows } = await pool.query(
      `SELECT id, referee_promo_id
         FROM public.referrals
        WHERE referee_user_id = $1 AND converted_at IS NULL
        LIMIT 1`,
      [userId]
    );
    if (rows.length === 0) return null;
    const referralId = rows[0].id;

    // If we already generated a promo for this referral (e.g. checkout was
    // retried), reuse it instead of creating a second Stripe coupon.
    if (rows[0].referee_promo_id) {
      const existing = await pool.query(
        `SELECT stripe_promo_code_id FROM public.promo_codes WHERE id = $1`,
        [rows[0].referee_promo_id]
      );
      const existingId = existing.rows[0]?.stripe_promo_code_id;
      if (existingId) return { stripePromoCodeId: existingId };
    }

    const settings = await getSettings();
    if (!settings.active) return null;

    // 1. Create the DB row.
    const promoCode = await PromoCode.create({
      description: `Referral welcome discount (applied at first-sub checkout)`,
      discount_percent: settings.referee_discount_percent,
      discount_duration: 1,
      max_uses: 1,
    });

    // 2. Mirror it in Stripe: coupon → promotion code. Percent-off, single
    //    invoice (`duration: once`), single redemption. If Stripe fails we
    //    log + return null so checkout still completes at full price.
    let stripePromoCodeId = null;
    try {
      const coupon = await stripe.coupons.create({
        percent_off: settings.referee_discount_percent,
        duration: "once",
        name: `Referral discount ${promoCode.code}`,
      });
      const promotion = await stripe.promotionCodes.create({
        coupon: coupon.id,
        code: promoCode.code,
        max_redemptions: 1,
      });
      await pool.query(
        `UPDATE public.promo_codes
            SET stripe_coupon_id     = $1,
                stripe_promo_code_id = $2
          WHERE id = $3`,
        [coupon.id, promotion.id, promoCode.id]
      );
      stripePromoCodeId = promotion.id;
    } catch (stripeErr) {
      console.error("⚠️ referral: Stripe coupon/promo creation failed:", stripeErr.message);
    }

    // 3. Stamp the referral row so we don't regenerate on retry.
    await pool.query(
      `UPDATE public.referrals SET referee_promo_id = $1 WHERE id = $2`,
      [promoCode.id, referralId]
    );

    return stripePromoCodeId ? { stripePromoCodeId } : null;
  } catch (err) {
    console.error("⚠️ applyReferralDiscountAtCheckout failed (non-fatal):", err.message);
    return null;
  }
};

// -----------------------------------------------------------------------------
// Conversion — the referee's first paid subscription cleared, so the referrer
// earns their reward. Called from the Stripe `invoice.payment_succeeded`
// webhook. Idempotent: safe to call repeatedly (converted_at is only set
// once; subsequent calls short-circuit and no duplicate promos are issued).
//
// Note: the referee already received their discount at checkout via
// applyReferralDiscountAtCheckout — this helper only issues the REFERRER's
// promo. If checkout somehow didn't run (e.g. the referral row was created
// but the discount fetch failed and the user paid full price), we still
// issue the referrer's promo since the conversion clearly happened.
// -----------------------------------------------------------------------------
export const markReferralConverted = async ({ refereeUserId }) => {
  if (!refereeUserId) return null;

  try {
    // Find the pending referral for this user. If already converted, or if
    // there's no referral at all, this is a no-op.
    const { rows } = await pool.query(
      `SELECT id, referrer_user_id
         FROM public.referrals
        WHERE referee_user_id = $1 AND converted_at IS NULL
        LIMIT 1`,
      [refereeUserId]
    );
    if (rows.length === 0) return null;

    const referralId       = rows[0].id;
    const referrerUserId   = rows[0].referrer_user_id;
    const settings         = await getSettings();

    // Issue only the referrer's promo — the referee's discount was already
    // applied at checkout. If Stripe integration fails here we still stamp
    // converted_at so we don't reprocess forever; admin can re-issue.
    const referrerPromo = await PromoCode.create({
      description: `Referral reward — referrer's advocate discount`,
      discount_percent: settings.referrer_discount_percent,
      discount_duration: 1,
      max_uses: 1,
    }).catch((err) => { console.error("⚠️ referrer promo failed:", err.message); return null; });

    // Best-effort Stripe mirror so the referrer can actually redeem the code
    // at their next checkout / subscription update. Failure logged, not fatal.
    if (referrerPromo) {
      try {
        const coupon = await stripe.coupons.create({
          percent_off: settings.referrer_discount_percent,
          duration: "once",
          name: `Referral reward ${referrerPromo.code}`,
        });
        const promotion = await stripe.promotionCodes.create({
          coupon: coupon.id,
          code: referrerPromo.code,
          max_redemptions: 1,
        });
        await pool.query(
          `UPDATE public.promo_codes
              SET stripe_coupon_id     = $1,
                  stripe_promo_code_id = $2
            WHERE id = $3`,
          [coupon.id, promotion.id, referrerPromo.id]
        );
      } catch (stripeErr) {
        console.error("⚠️ referrer Stripe coupon failed:", stripeErr.message);
      }
    }

    await pool.query(
      `UPDATE public.referrals
          SET converted_at      = NOW(),
              referrer_promo_id = COALESCE($1, referrer_promo_id)
        WHERE id = $2`,
      [referrerPromo?.id || null, referralId]
    );

    console.log(`🎉 referral converted — referrer=${referrerUserId} referee=${refereeUserId}`);
    return { referrerUserId, referrerPromo };
  } catch (err) {
    console.error("⚠️ markReferralConverted failed (non-fatal):", err.message);
    return null;
  }
};

// -----------------------------------------------------------------------------
// User endpoints
// -----------------------------------------------------------------------------

// GET /api/referrals/my-pending-discount
// Returns { pending: bool, discount_percent, referred_by } so the checkout
// screen can preview the discount that will auto-apply when the subscription
// is created. Public shape: no promo codes leaked; just the metadata the UI
// needs.
export const getMyPendingDiscount = async (req, res) => {
  try {
    const userId = req.user.id;
    const settings = await getSettings();
    if (!settings.active) return res.json({ pending: false });

    const { rows } = await pool.query(
      `SELECT r.id,
              u.first_name AS referrer_first_name,
              u.last_name  AS referrer_last_name
         FROM public.referrals r
         JOIN public.users u ON u.id = r.referrer_user_id
        WHERE r.referee_user_id = $1 AND r.converted_at IS NULL
        LIMIT 1`,
      [userId]
    );
    if (rows.length === 0) return res.json({ pending: false });

    const referrer = `${rows[0].referrer_first_name || ""} ${rows[0].referrer_last_name || ""}`.trim() || "a contractor";
    return res.json({
      pending: true,
      discount_percent: settings.referee_discount_percent,
      referred_by: referrer,
    });
  } catch (err) {
    console.error("❌ getMyPendingDiscount:", err);
    res.status(500).json({ pending: false });
  }
};


// GET /api/referrals/my-info
export const getMyReferralInfo = async (req, res) => {
  try {
    const userId = req.user.id;

    // Contractors-only gate. Prevents non-contractor tabs from spawning a
    // code that could never be redeemed anywhere (the reward is a paid-sub
    // discount, and only entrepreneurs subscribe). 403 lets the frontend
    // silently hide the Refer & Earn card.
    const { rows } = await pool.query(
      `SELECT role FROM public.users WHERE id = $1`,
      [userId]
    );
    if (rows[0]?.role !== "entrepreneur") {
      return res.status(403).json({ message: "Referrals are contractor-only." });
    }

    const code = await getOrCreateReferralCode(userId);

    const stats = await pool.query(
      `SELECT
          COUNT(*)::int                                                   AS total,
          COUNT(*) FILTER (WHERE converted_at IS NOT NULL)::int           AS converted,
          COUNT(*) FILTER (WHERE converted_at IS NULL)::int               AS pending
        FROM public.referrals
       WHERE referrer_user_id = $1`,
      [userId]
    );

    const settings = await getSettings();

    res.json({
      code,
      stats: stats.rows[0] || { total: 0, converted: 0, pending: 0 },
      settings: {
        active: settings.active,
        referee_discount_percent: settings.referee_discount_percent,
        referrer_discount_percent: settings.referrer_discount_percent,
      },
    });
  } catch (err) {
    console.error("❌ getMyReferralInfo:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/referrals/settings  (public — used by the signup form to know if
// the referral field should render + what the discount will be)
export const getPublicSettings = async (_req, res) => {
  try {
    const s = await getSettings();
    res.json({
      active: s.active,
      referee_discount_percent: s.referee_discount_percent,
      referrer_discount_percent: s.referrer_discount_percent,
    });
  } catch (err) {
    console.error("❌ getPublicSettings:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /api/referrals/validate  (public — validates a code entered on the
// signup form so the UI can show "You'll get 20% off" AND warn early when
// anti-abuse would block the attribution at submit time.)
//
// Body (all optional except code):
//   { code, email, phone }
// The server picks up the IP from headers automatically. GET is also accepted
// for backwards compatibility with clients that only pass `?code=`.
export const validateCode = async (req, res) => {
  try {
    // Accept both POST body and GET query so existing callers still work.
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const raw = (src.code || "").toString().trim().toUpperCase();
    if (!raw) return res.status(400).json({ valid: false, message: "Missing code." });

    const settings = await getSettings();
    if (!settings.active) return res.json({ valid: false, message: "Referrals are disabled." });

    // Include email + phone so we can pre-flight the anti-abuse checks.
    const { rows } = await pool.query(
      `SELECT rc.user_id, u.first_name, u.last_name, u.role, u.email, u.phone
         FROM public.referral_codes rc
         JOIN public.users u ON u.id = rc.user_id
        WHERE rc.code = $1`,
      [raw]
    );
    if (rows.length === 0) return res.json({ valid: false, message: "Unknown code." });
    const owner = rows[0];
    if (owner.role !== "entrepreneur") {
      return res.json({ valid: false, message: "This code isn't eligible for the referral programme." });
    }

    // ─── Pre-flight anti-abuse checks ────────────────────────────────
    // The real attribution at signup runs the same checks and silently
    // rejects on failure — this endpoint returns the reason so the UI
    // can WARN before the user hits submit. Skipped entirely when the
    // REFERRAL_ANTIABUSE_ENABLED flag is off (dev/test).
    let warning = null;
    let blockReason = null;

    if (isAntiAbuseEnabled()) {
      const forwarded = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim();
      const signupIp = forwarded || req.ip || null;

      if (src.email && normalizeEmail(src.email) === normalizeEmail(owner.email)) {
        blockReason = "duplicate_email";
        warning = "This code was generated by the account you're signing up with — you can't refer yourself.";
      } else if (
        src.phone &&
        normalizePhone(owner.phone) &&
        normalizePhone(src.phone) === normalizePhone(owner.phone)
      ) {
        blockReason = "duplicate_phone";
        warning = "Your phone number matches the account that owns this code. The discount can't apply.";
      } else if (signupIp) {
        const recent = await pool.query(
          `SELECT 1
             FROM public.referrals
            WHERE referrer_user_id = $1
              AND signup_ip = $2
              AND created_at > NOW() - INTERVAL '${IP_RATE_LIMIT_HOURS} hours'
            LIMIT 1`,
          [owner.user_id, signupIp]
        );
        if (recent.rowCount > 0) {
          blockReason = "ip_rate_limit";
          warning = "This code was recently used from your current network. The discount won't apply this time.";
        }
      }
    }

    res.json({
      valid: true,
      referred_by: `${owner.first_name || ""} ${owner.last_name || ""}`.trim() || "a friend",
      referee_discount_percent: settings.referee_discount_percent,
      // When set, the UI should render a yellow warning instead of the
      // green success line. `block_reason` is a stable enum for i18n.
      warning,
      block_reason: blockReason,
    });
  } catch (err) {
    console.error("❌ validateCode:", err);
    res.status(500).json({ valid: false, message: "Server error" });
  }
};

// -----------------------------------------------------------------------------
// Admin endpoints
// -----------------------------------------------------------------------------

// GET /api/admin/referral-settings
export const getAdminSettings = async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT active, referrer_discount_percent, referee_discount_percent, updated_at
         FROM public.referral_settings WHERE id = 1`
    );
    res.json({ settings: rows[0] });
  } catch (err) {
    console.error("❌ getAdminSettings:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/admin/referral-settings/list
// All referral rows, newest first, with referrer + referee names + emails so
// the admin table can render without a per-row round-trip. Basic offset
// pagination — the volume is expected to be small.
export const listAllReferrals = async (req, res) => {
  try {
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit, 10)  || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const status = (req.query.status || "").toString().toLowerCase(); // "" | "pending" | "converted"

    const whereClauses = [];
    if (status === "pending")   whereClauses.push("r.converted_at IS NULL");
    if (status === "converted") whereClauses.push("r.converted_at IS NOT NULL");
    const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const { rows: totalRows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM public.referrals r ${where}`
    );
    const total = totalRows[0]?.n || 0;

    const { rows } = await pool.query(
      `SELECT
          r.id, r.code_used, r.created_at, r.converted_at,
          r.referee_promo_id, r.referrer_promo_id,
          referrer.id           AS referrer_id,
          referrer.first_name   AS referrer_first_name,
          referrer.last_name    AS referrer_last_name,
          referrer.email        AS referrer_email,
          referrer.role         AS referrer_role,
          referee.id            AS referee_id,
          referee.first_name    AS referee_first_name,
          referee.last_name     AS referee_last_name,
          referee.email         AS referee_email,
          referee.role          AS referee_role
        FROM public.referrals r
        JOIN public.users referrer ON referrer.id = r.referrer_user_id
        JOIN public.users referee  ON referee.id  = r.referee_user_id
        ${where}
        ORDER BY r.created_at DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Aggregate stats — cheap side query so the header can show "N total,
    // M converted" without the caller doing arithmetic.
    const { rows: statRows } = await pool.query(
      `SELECT
          COUNT(*)::int                                          AS total,
          COUNT(*) FILTER (WHERE converted_at IS NOT NULL)::int  AS converted,
          COUNT(*) FILTER (WHERE converted_at IS NULL)::int      AS pending,
          COUNT(DISTINCT referrer_user_id)::int                  AS unique_referrers
        FROM public.referrals`
    );

    res.json({
      referrals: rows,
      total,
      stats: statRows[0] || { total: 0, converted: 0, pending: 0, unique_referrers: 0 },
    });
  } catch (err) {
    console.error("❌ listAllReferrals:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// PUT /api/admin/referral-settings
// Body: { active, referrer_discount_percent, referee_discount_percent }
export const updateAdminSettings = async (req, res) => {
  try {
    const { active, referrer_discount_percent, referee_discount_percent } = req.body || {};

    const clamp = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return Math.max(0, Math.min(100, Math.round(n)));
    };
    const refPct = clamp(referrer_discount_percent);
    const refePct = clamp(referee_discount_percent);
    if (refPct === null || refePct === null) {
      return res.status(400).json({
        message: "Both discount percentages must be numbers between 0 and 100.",
      });
    }

    const { rows } = await pool.query(
      `UPDATE public.referral_settings
          SET active = COALESCE($1, active),
              referrer_discount_percent = $2,
              referee_discount_percent  = $3,
              updated_at = NOW()
        WHERE id = 1
        RETURNING active, referrer_discount_percent, referee_discount_percent, updated_at`,
      [typeof active === "boolean" ? active : null, refPct, refePct]
    );
    res.json({ settings: rows[0] });
  } catch (err) {
    console.error("❌ updateAdminSettings:", err);
    res.status(500).json({ message: "Server error" });
  }
};
