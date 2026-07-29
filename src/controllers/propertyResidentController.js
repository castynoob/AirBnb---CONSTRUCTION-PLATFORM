// =============================================================================
// Property → Resident roster management.
//
// PM-facing endpoints (mounted under /api/properties/:propertyId/residents):
//   GET    /              → current residents + pending invites for this property
//   POST   /invite        → invite a resident by email (both paths, see below)
//   DELETE /:userId       → unlink a resident from this property (does not
//                           delete their user account)
//   DELETE /invites/:id   → cancel a pending invite
//
// Resident-facing (mounted at /api/residents/invites):
//   GET    /mine          → invites addressed to my email
//   POST   /:id/accept    → accept, set property_id + unit on my profile
//   POST   /:id/decline   → decline, invite becomes 'declined'
//
// Invite paths:
//   • If invited_email already has a resident account → `kind = 'link_existing'`
//     and a bell notification (+ optional email) tells them to accept in-app.
//   • Otherwise → `kind = 'signup'` with a `signup_token`. The invite email
//     contains a link like /?resident_invite=<token>. The resident signs up
//     via the normal flow with that token; the token is consumed and the
//     property/unit are auto-applied. (Consumption logic is a follow-up —
//     for MVP the token just travels in the email.)
//
// Ownership: every PM-side endpoint verifies that req.user.id is the manager
// of the property in question. This is defense-in-depth on top of the
// role middleware.
// =============================================================================

import pool from "../config/db.js";
import { createNotification } from "./notificationController.js";
import { getIO } from "../config/socketSetup.js";

const normalizeEmail = (e) => (e ? String(e).trim().toLowerCase() : "");

// Verify the PM owns the property. Returns { ok: true, managerProfileId }
// on success or { ok: false, status, message } on failure. Reused by every
// PM-scoped endpoint.
const assertPropertyOwner = async (userId, propertyId) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.manager_id, p.building_name, mp.user_id AS pm_user_id
       FROM public.properties p
       JOIN public.manager_profiles mp ON mp.id = p.manager_id
      WHERE p.id = $1`,
    [propertyId]
  );
  if (rows.length === 0) return { ok: false, status: 404, message: "Property not found." };
  if (rows[0].pm_user_id !== userId) return { ok: false, status: 403, message: "You don't manage this property." };
  return { ok: true, propertyName: rows[0].building_name, managerProfileId: rows[0].manager_id };
};

// -----------------------------------------------------------------------------
// PM: GET current residents + pending invites on a property.
// -----------------------------------------------------------------------------
export const listResidents = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const own = await assertPropertyOwner(req.user.id, propertyId);
    if (!own.ok) return res.status(own.status).json({ message: own.message });

    const [residents, invites] = await Promise.all([
      pool.query(
        `SELECT rp.id AS resident_profile_id,
                rp.user_id, rp.unit_id, rp.unit_number, rp.move_in_date,
                u.first_name, u.last_name, u.email, u.phone, u.profile_picture
           FROM public.resident_profiles rp
           JOIN public.users u ON u.id = rp.user_id
          WHERE rp.property_id = $1
          ORDER BY u.last_name NULLS LAST, u.first_name NULLS LAST`,
        [propertyId]
      ),
      pool.query(
        `SELECT id, invited_email, invited_unit_number, kind, status,
                created_at, resolved_resident_user_id
           FROM public.property_resident_invites
          WHERE property_id = $1 AND status = 'pending'
          ORDER BY created_at DESC`,
        [propertyId]
      ),
    ]);

    res.json({
      residents: residents.rows,
      pending_invites: invites.rows,
    });
  } catch (err) {
    console.error("❌ listResidents:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------------------------------
// PM: search for a resident to invite. Autocomplete for the invite modal.
//
// GET /api/residents/search?q=<query>&exclude_property=<propertyId>
//
// Matches on first_name / last_name / email (ILIKE, case-insensitive). Only
// residents (role='resident'). Excludes anyone already on `exclude_property`
// so the picker doesn't offer people the PM would immediately have to reject.
// Small hard cap on results — this is a picker, not a directory.
// -----------------------------------------------------------------------------
export const searchResidents = async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    const excludeProperty = (req.query.exclude_property || "").toString().trim();
    if (q.length < 2) return res.json({ residents: [] });

    // Simple ILIKE against name/email. On a big deployment a trigram index
    // would help; MVP volume doesn't warrant it.
    const like = `%${q}%`;
    const params = [like];
    let excludeClause = "";
    if (excludeProperty) {
      params.push(excludeProperty);
      excludeClause = `
        AND NOT EXISTS (
          SELECT 1 FROM public.resident_profiles rp2
           WHERE rp2.user_id = u.id AND rp2.property_id = $${params.length}
        )
      `;
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.profile_picture,
              rp.property_id AS current_property_id
         FROM public.users u
         LEFT JOIN public.resident_profiles rp ON rp.user_id = u.id
        WHERE u.role = 'resident'
          AND (
            u.first_name ILIKE $1
            OR u.last_name  ILIKE $1
            OR u.email      ILIKE $1
          )
          ${excludeClause}
        ORDER BY u.last_name NULLS LAST, u.first_name NULLS LAST
        LIMIT 10`,
      params
    );
    res.json({ residents: rows });
  } catch (err) {
    console.error("❌ searchResidents:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------------------------------
// PM: invite an existing resident to the property.
// Body: { resident_user_id, unit_number?, message? }
//
// In-app only — no email path. The PM picks a resident from the search
// autocomplete on the frontend, so we always receive a real user_id.
// -----------------------------------------------------------------------------
export const inviteResident = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { resident_user_id, unit_number, message } = req.body || {};
    if (!resident_user_id) {
      return res.status(400).json({ message: "Pick a resident from the list." });
    }

    const own = await assertPropertyOwner(req.user.id, propertyId);
    if (!own.ok) return res.status(own.status).json({ message: own.message });

    // Resolve the resident — must exist AND be role=resident.
    const residentRes = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, rp.property_id
         FROM public.users u
         LEFT JOIN public.resident_profiles rp ON rp.user_id = u.id
        WHERE u.id = $1 AND u.role = 'resident'
        LIMIT 1`,
      [resident_user_id]
    );
    if (residentRes.rows.length === 0) {
      return res.status(404).json({ message: "Resident not found." });
    }
    const resident = residentRes.rows[0];

    if (resident.property_id === propertyId) {
      return res.status(409).json({
        code: "already_on_property",
        message: `${resident.first_name || "This resident"} is already on this property.`,
      });
    }
    if (resident.property_id) {
      return res.status(409).json({
        code: "on_other_property",
        message: `${resident.first_name || "This resident"} is currently linked to another property — they'll need to leave it first.`,
      });
    }

    // Persist as link_existing (only path we support now). invited_email is
    // stored for audit + the UNIQUE constraint; nothing is ever emailed.
    let insertRes;
    try {
      insertRes = await pool.query(
        `INSERT INTO public.property_resident_invites
           (property_id, pm_user_id, invited_email, invited_unit_number,
            kind, resolved_resident_user_id, message)
         VALUES ($1, $2, $3, $4, 'link_existing', $5, $6)
         RETURNING *`,
        [
          propertyId, req.user.id, normalizeEmail(resident.email), unit_number || null,
          resident.id, message || null,
        ]
      );
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({
          code: "already_invited",
          message: `${resident.first_name || "This resident"} already has a pending invite to this property.`,
        });
      }
      throw err;
    }

    const invite = insertRes.rows[0];

    // Bell + socket notification. This is now the ONLY delivery mechanism.
    const pmRow = await pool.query(
      `SELECT first_name, last_name FROM public.users WHERE id = $1`,
      [req.user.id]
    );
    const pmName = `${pmRow.rows[0]?.first_name || ""} ${pmRow.rows[0]?.last_name || ""}`.trim() || "A property manager";
    const content = `${pmName} invited you to join ${own.propertyName || "their property"}${unit_number ? `, unit ${unit_number}` : ""}.`;

    const io = getIO();
    if (io) {
      io.to(resident.id.toString()).emit("resident_invite", {
        inviteId: invite.id,
        propertyId,
        propertyName: own.propertyName,
        unitNumber: unit_number || null,
        senderId: req.user.id,
        senderName: pmName,
        content,
      });
    }
    createNotification({
      userId: resident.id,
      type: "resident_invite",
      senderId: req.user.id,
      senderName: pmName,
      content,
      propertyName: own.propertyName,
    }).catch((err) =>
      console.error("⚠️ resident invite notification failed:", err.message)
    );

    res.status(201).json({ invite, resident: {
      id: resident.id,
      first_name: resident.first_name,
      last_name: resident.last_name,
    } });
  } catch (err) {
    console.error("❌ inviteResident:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------------------------------
// PM: cancel a pending invite (before the resident responds).
// -----------------------------------------------------------------------------
export const cancelInvite = async (req, res) => {
  try {
    const { propertyId, inviteId } = req.params;
    const own = await assertPropertyOwner(req.user.id, propertyId);
    if (!own.ok) return res.status(own.status).json({ message: own.message });

    const { rows } = await pool.query(
      `UPDATE public.property_resident_invites
          SET status = 'cancelled', responded_at = NOW()
        WHERE id = $1 AND property_id = $2 AND status = 'pending'
        RETURNING id`,
      [inviteId, propertyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Pending invite not found." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ cancelInvite:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------------------------------
// PM: remove a resident from the property. Detaches only — the resident's
// user account and profile stay intact so they can be re-added or move to a
// different property later.
// -----------------------------------------------------------------------------
export const removeResident = async (req, res) => {
  try {
    const { propertyId, userId } = req.params;
    const own = await assertPropertyOwner(req.user.id, propertyId);
    if (!own.ok) return res.status(own.status).json({ message: own.message });

    const { rows } = await pool.query(
      `UPDATE public.resident_profiles
          SET property_id = NULL,
              unit_id     = NULL,
              unit_number = NULL,
              updated_at  = NOW()
        WHERE user_id = $1 AND property_id = $2
        RETURNING id`,
      [userId, propertyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Resident isn't on this property." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ removeResident:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------------------------------
// Resident: list invites addressed to my email.
// -----------------------------------------------------------------------------
export const listMyInvites = async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT i.id, i.property_id, i.invited_unit_number, i.message,
              i.created_at, i.kind,
              p.building_name, p.address, p.city,
              u.first_name AS pm_first_name, u.last_name AS pm_last_name
         FROM public.property_resident_invites i
         JOIN public.properties p ON p.id = i.property_id
         JOIN public.users u ON u.id = i.pm_user_id
         JOIN public.users me ON LOWER(me.email) = LOWER(i.invited_email)
        WHERE me.id = $1 AND i.status = 'pending'
        ORDER BY i.created_at DESC`,
      [userId]
    );
    res.json({ invites: rows });
  } catch (err) {
    console.error("❌ listMyInvites (residents):", err);
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------------------------------
// Resident: accept an invite → set property_id + unit_number on my profile.
// Rejects if I'm already on a different property.
// -----------------------------------------------------------------------------
export const acceptInvite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { inviteId } = req.params;

    // Ensure the invite is really addressed to me AND still pending.
    const inviteRes = await pool.query(
      `SELECT i.id, i.property_id, i.invited_unit_number
         FROM public.property_resident_invites i
         JOIN public.users me ON LOWER(me.email) = LOWER(i.invited_email)
        WHERE i.id = $1 AND me.id = $2 AND i.status = 'pending'
        LIMIT 1`,
      [inviteId, userId]
    );
    if (inviteRes.rows.length === 0) {
      return res.status(404).json({ message: "Invite not found or already handled." });
    }
    const invite = inviteRes.rows[0];

    // Already on a different property?
    const cur = await pool.query(
      `SELECT property_id FROM public.resident_profiles WHERE user_id = $1`,
      [userId]
    );
    if (cur.rows[0]?.property_id && cur.rows[0].property_id !== invite.property_id) {
      return res.status(409).json({
        code: "on_other_property",
        message: "You're already linked to a different property. Leave it first, then accept this invite.",
      });
    }

    // Upsert resident_profiles row + set the property/unit fields.
    await pool.query(
      `INSERT INTO public.resident_profiles (user_id, property_id, unit_number)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET property_id = EXCLUDED.property_id,
             unit_number = EXCLUDED.unit_number,
             updated_at  = NOW()`,
      [userId, invite.property_id, invite.invited_unit_number || null]
    );
    await pool.query(
      `UPDATE public.property_resident_invites
          SET status = 'accepted',
              resolved_resident_user_id = $1,
              responded_at = NOW()
        WHERE id = $2`,
      [userId, inviteId]
    );
    res.json({ ok: true, property_id: invite.property_id });
  } catch (err) {
    console.error("❌ acceptInvite (resident):", err);
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------------------------------
// Resident: decline an invite. No side effects on the profile.
// -----------------------------------------------------------------------------
export const declineInvite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { inviteId } = req.params;
    const { rows } = await pool.query(
      `UPDATE public.property_resident_invites i
          SET status = 'declined', responded_at = NOW()
        FROM public.users me
        WHERE i.id = $1 AND LOWER(me.email) = LOWER(i.invited_email)
          AND me.id = $2 AND i.status = 'pending'
        RETURNING i.id`,
      [inviteId, userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Invite not found or already handled." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ declineInvite (resident):", err);
    res.status(500).json({ message: "Server error" });
  }
};
