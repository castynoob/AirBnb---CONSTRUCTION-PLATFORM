// =============================================================================
// Job Invites — PM directly invites an entrepreneur to bid on their job.
// =============================================================================
//
// Endpoints (mounted at /api/invites):
//
//   POST   /             — PM creates an invite  { job_id, entrepreneur_user_id, message? }
//   GET    /mine         — contractor lists their own invites (newest first)
//   GET    /job/:jobId   — PM lists everyone they invited on one of their jobs
//   PATCH  /:id/respond  — contractor accepts/declines (status: 'accepted' | 'declined')
//
// Notes:
//   - The invite is anchored to a job that the PM owns. `authorizeRoles`
//     restricts the surface; ownership is re-verified in SQL because URL
//     params can lie.
//   - A single invite per (job, contractor) pair — enforced by a UNIQUE index
//     (migration 017). The controller catches unique_violation and returns
//     409 with a friendlier body.
//   - Notifications fire post-persist, fire-and-forget. If the bell notification
//     ever fails to insert we still return 201 — the invite exists, worst case
//     the contractor hears about it out-of-band.
// =============================================================================

import pool from "../config/db.js";
import { createNotification } from "./notificationController.js";
import { getIO } from "../config/socketSetup.js";

// Small helper — the notification content string. Kept in one place so a copy
// change doesn't hunt across files.
const inviteContent = (pmName, jobTitle) =>
  `${pmName || "A property manager"} invited you to bid on "${jobTitle}".`;

export const createInvite = async (req, res) => {
  try {
    const pmUserId = req.user.id;
    const { job_id, entrepreneur_user_id, message } = req.body || {};

    if (!job_id || !entrepreneur_user_id) {
      return res.status(400).json({
        message: "job_id and entrepreneur_user_id are required.",
      });
    }

    // Verify the PM owns this job. manager_profiles.user_id links to users.id,
    // and jobs.manager_id references manager_profiles.id — one JOIN gets us
    // both the ownership check AND the job title we need for the notification.
    const jobCheck = await pool.query(
      `SELECT j.id, j.title, j.status, j.is_archived, mp.user_id AS pm_user_id
         FROM public.jobs j
         JOIN public.manager_profiles mp ON mp.id = j.manager_id
        WHERE j.id = $1`,
      [job_id]
    );
    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ message: "Job not found." });
    }
    const job = jobCheck.rows[0];
    if (job.pm_user_id !== pmUserId) {
      return res.status(403).json({ message: "You don't own this job." });
    }
    if (job.is_archived) {
      return res.status(400).json({ message: "This job is archived." });
    }
    // Guardrail — only jobs still in the bidding phase should accept invites.
    // The schema uses title-case statuses ("Open", "In Progress", "Completed").
    const status = (job.status || "").toLowerCase();
    if (!["open", "bidding"].includes(status)) {
      return res.status(400).json({
        message: "This job is no longer accepting bids.",
      });
    }

    // Verify the invitee is actually an entrepreneur (not a PM or resident).
    const userCheck = await pool.query(
      `SELECT id, role, first_name, last_name FROM public.users WHERE id = $1`,
      [entrepreneur_user_id]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: "Contractor not found." });
    }
    if (userCheck.rows[0].role !== "entrepreneur") {
      return res.status(400).json({ message: "That user isn't a contractor." });
    }

    // Sender name for the notification — PM's own row on users.
    const pmRow = await pool.query(
      `SELECT first_name, last_name FROM public.users WHERE id = $1`,
      [pmUserId]
    );
    const pmName =
      `${pmRow.rows[0]?.first_name || ""} ${pmRow.rows[0]?.last_name || ""}`.trim();

    let insertResult;
    try {
      insertResult = await pool.query(
        `INSERT INTO public.job_invites (job_id, entrepreneur_user_id, pm_user_id, message)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [job_id, entrepreneur_user_id, pmUserId, message || null]
      );
    } catch (err) {
      if (err.code === "23505") {
        // Unique violation — already invited. Return 409 so the frontend can
        // show a friendly "already invited" state instead of a scary 500.
        return res.status(409).json({
          code: "already_invited",
          message: "You've already invited this contractor to this job.",
        });
      }
      throw err;
    }

    const invite = insertResult.rows[0];

    // Real-time push — users auto-join a room named after their user_id on
    // socket connect (socketSetup.js:87). Emit `job_invite` so the contractor's
    // NotificationBell can pop the badge + toast without waiting for a poll.
    const io = getIO();
    if (io) {
      io.to(entrepreneur_user_id.toString()).emit("job_invite", {
        inviteId: invite.id,
        jobId: job.id,
        jobTitle: job.title,
        senderId: pmUserId,
        senderName: pmName || "Property Manager",
        content: inviteContent(pmName, job.title),
      });
    }

    // Persist for the bell dropdown / offline case. Fire-and-forget; the
    // invite is already stored.
    createNotification({
      userId: entrepreneur_user_id,
      type: "job_invite",
      senderId: pmUserId,
      senderName: pmName || "Property Manager",
      content: inviteContent(pmName, job.title),
      jobId: job.id,
      jobTitle: job.title,
    }).catch((err) =>
      console.error("⚠️ job invite notification failed:", err.message)
    );

    return res.status(201).json({ invite });
  } catch (err) {
    console.error("❌ createInvite:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /mine — invites addressed to the logged-in contractor.
// Enriched with enough job/property context that the frontend can render a
// card without a second round-trip per row.
export const listMyInvites = async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT
          ji.id, ji.job_id, ji.status, ji.message,
          ji.created_at, ji.responded_at,
          j.title           AS job_title,
          j.category        AS job_category,
          j.urgency         AS job_urgency,
          j.status          AS job_status,
          j.budget_min, j.budget_max, j.is_budget_hidden,
          p.building_name   AS property_name,
          p.city            AS property_city,
          u.first_name      AS pm_first_name,
          u.last_name       AS pm_last_name
        FROM public.job_invites ji
        JOIN public.jobs j             ON j.id = ji.job_id
        LEFT JOIN public.properties p  ON p.id = j.property_id
        LEFT JOIN public.users u       ON u.id = ji.pm_user_id
       WHERE ji.entrepreneur_user_id = $1
       ORDER BY ji.created_at DESC`,
      [userId]
    );
    return res.status(200).json({ invites: rows });
  } catch (err) {
    console.error("❌ listMyInvites:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /job/:jobId — invites the PM has sent for one of their jobs.
export const listInvitesForJob = async (req, res) => {
  try {
    const pmUserId = req.user.id;
    const { jobId } = req.params;

    const ownershipCheck = await pool.query(
      `SELECT mp.user_id
         FROM public.jobs j
         JOIN public.manager_profiles mp ON mp.id = j.manager_id
        WHERE j.id = $1`,
      [jobId]
    );
    if (ownershipCheck.rows.length === 0) {
      return res.status(404).json({ message: "Job not found." });
    }
    if (ownershipCheck.rows[0].user_id !== pmUserId) {
      return res.status(403).json({ message: "You don't own this job." });
    }

    const { rows } = await pool.query(
      `SELECT
          ji.id, ji.entrepreneur_user_id, ji.status, ji.message,
          ji.created_at, ji.responded_at,
          u.first_name, u.last_name, u.profile_picture,
          ep.company_name
        FROM public.job_invites ji
        JOIN public.users u                     ON u.id = ji.entrepreneur_user_id
        LEFT JOIN public.entrepreneur_profiles ep ON ep.user_id = ji.entrepreneur_user_id
       WHERE ji.job_id = $1
       ORDER BY ji.created_at DESC`,
      [jobId]
    );
    return res.status(200).json({ invites: rows });
  } catch (err) {
    console.error("❌ listInvitesForJob:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// PATCH /:id/respond — contractor explicitly accepts or declines.
// (Bidding on a job auto-flips to 'accepted' in the bid controller; this
// endpoint is for the explicit UI action.)
export const respondToInvite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { status } = req.body || {};

    if (!["accepted", "declined"].includes(status)) {
      return res.status(400).json({
        message: "status must be 'accepted' or 'declined'.",
      });
    }

    const result = await pool.query(
      `UPDATE public.job_invites
          SET status = $1,
              responded_at = NOW()
        WHERE id = $2
          AND entrepreneur_user_id = $3
        RETURNING *`,
      [status, id, userId]
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Invite not found or not addressed to you." });
    }

    return res.status(200).json({ invite: result.rows[0] });
  } catch (err) {
    console.error("❌ respondToInvite:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
