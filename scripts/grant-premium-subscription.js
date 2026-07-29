// =============================================================================
// Grant a premium subscription to an entrepreneur, bypassing Stripe.
//
// Mirrors the canonical Subscription.upsert flow from paymentController.js so
// the entrepreneur_profiles.subscription_plan column stays in sync with the
// subscriptions row.
//
// Usage:
//   node scripts/grant-premium-subscription.js <user_id>
//
// Period: 30 days from now, status='active'. No Stripe IDs since this is a
// comp/manual grant.
// =============================================================================

import Subscription from "../src/models/subscriptionModel.js";
import pool from "../src/config/db.js";

const USER_ID = process.argv[2];
if (!USER_ID) {
  console.error("Usage: node scripts/grant-premium-subscription.js <user_id>");
  process.exit(1);
}

const PLAN_TYPE = "premium";
const STATUS = "active";

(async () => {
  try {
    // 1) Resolve the entrepreneur profile for this user. Required for the
    //    entrepreneur_profile_id FK on the subscriptions row.
    const { rows: profileRows } = await pool.query(
      `SELECT ep.id, ep.company_name, u.email, u.first_name, u.last_name
       FROM entrepreneur_profiles ep
       JOIN users u ON u.id = ep.user_id
       WHERE ep.user_id = $1`,
      [USER_ID]
    );
    if (profileRows.length === 0) {
      throw new Error(
        `No entrepreneur_profiles row for user_id=${USER_ID}. ` +
        `Is this user actually an entrepreneur?`
      );
    }
    const profile = profileRows[0];
    console.log(`👤 Target: ${profile.first_name} ${profile.last_name} <${profile.email}>`);
    console.log(`   entrepreneur_profile_id=${profile.id}  company="${profile.company_name}"`);

    // 2) If they already have a non-cancelled premium subscription, just log.
    const existing = await Subscription.findByUserId(USER_ID);
    if (existing) {
      console.log(
        `ℹ️  Existing subscription: plan=${existing.plan_type} status=${existing.status} ` +
        `period_end=${existing.current_period_end}`
      );
      console.log("    Upserting will overwrite plan/status/period.");
    }

    // 3) 30-day active premium period starting now.
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const result = await Subscription.upsert({
      user_id: USER_ID,
      entrepreneur_profile_id: profile.id,
      stripe_customer_id: null,    // comp/manual grant — no Stripe
      stripe_subscription_id: null,
      plan_type: PLAN_TYPE,
      status: STATUS,
      trial_end: null,
      current_period_start: now,
      current_period_end: periodEnd,
    });

    console.log(`✅ subscriptions row upserted: id=${result.id}`);
    console.log(`   plan=${result.plan_type}  status=${result.status}`);
    console.log(`   period: ${result.current_period_start.toISOString()} → ${result.current_period_end.toISOString()}`);
    console.log(`✅ entrepreneur_profiles.subscription_plan also synced to "${PLAN_TYPE}".`);
  } catch (e) {
    console.error("❌ Failed:", e.message);
    if (e.detail) console.error("   detail:", e.detail);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
