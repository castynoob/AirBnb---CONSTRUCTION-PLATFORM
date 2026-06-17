// =============================================================================
// Admin lifecycle controller
// Gives admin users full PM-parity on their own jobs:
//   - View bids submitted on admin-owned jobs
//   - Approve / decline / cancel-approval on bids
//   - Auto-create contract when approving (combines the two PM steps for
//     simplicity — admin doesn't need to call a separate /contracts/create)
//   - View admin-owned contracts in flight
//   - Approve completed work (manager-side approval in the mutual handshake)
//   - Confirm completion (final close-out)
//
// All endpoints are gated with `authenticateAdmin + isAdminOrHigher` at the
// route layer. Every action is scoped to jobs where
// `jobs.admin_owner_id = req.admin.id` — admin can't manage bids on platform
// jobs owned by other admins or by property managers.
// =============================================================================

import pool from "../config/db.js";
import * as Bid from "../models/bidModel.js";
import { createNotification } from "./notificationController.js";
import { getIO } from "../config/socketSetup.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

// -----------------------------------------------------------------------------
// Internal helper: load a bid + its job, asserting the job is admin-owned by
// the requesting admin. Returns { bid, job } or sends a 4xx and returns null.
// -----------------------------------------------------------------------------
async function loadBidForAdmin(req, res, bidId) {
  if (!isUuid(bidId)) {
    res.status(400).json({ message: "Invalid bid ID format" });
    return null;
  }
  const adminId = req.admin?.id;
  if (!adminId) {
    res.status(401).json({ message: "Not authenticated as admin" });
    return null;
  }

  const result = await pool.query(
    `SELECT b.*,
            j.id           AS job_id_check,
            j.title        AS job_title,
            j.admin_owner_id,
            p.building_name
     FROM bids b
     INNER JOIN jobs j        ON j.id = b.job_id
     LEFT  JOIN properties p  ON p.id = j.property_id
     WHERE b.id = $1`,
    [bidId]
  );
  if (!result.rows[0]) {
    res.status(404).json({ message: "Bid not found" });
    return null;
  }
  const row = result.rows[0];
  if (row.admin_owner_id !== adminId) {
    res
      .status(403)
      .json({ message: "You can only manage bids on jobs you own as admin." });
    return null;
  }
  return {
    bid: row,
    job: {
      id: row.job_id,
      title: row.job_title,
      building_name: row.building_name,
    },
  };
}

// -----------------------------------------------------------------------------
// GET /api/admin/my-jobs/:jobId/bids
// List every bid on a specific admin-owned job, joined with the bidder's
// profile info so the UI can render contractor cards.
// -----------------------------------------------------------------------------
export const listBidsOnMyJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!isUuid(jobId)) {
      return res.status(400).json({ message: "Invalid job ID format" });
    }
    const adminId = req.admin?.id;
    if (!adminId) return res.status(401).json({ message: "Not authenticated" });

    // Verify ownership before listing — keeps the audit clean even if no bids
    // exist yet (a 403 here is more informative than an empty list).
    const job = await pool.query(
      `SELECT id, title FROM jobs WHERE id = $1 AND admin_owner_id = $2`,
      [jobId, adminId]
    );
    if (!job.rows[0]) {
      return res
        .status(404)
        .json({ message: "Job not found or you don't own it." });
    }

    const { rows } = await pool.query(
      `
      SELECT
        b.id, b.amount, b.proposal,
        b.timeline_days        AS estimated_duration_days,
        b.message,
        b.status, b.created_at, b.updated_at,
        ep.id                  AS entrepreneur_profile_id,
        ep.company_name,
        ep.license_number,
        ep.years_experience,
        ep.image               AS profile_picture,
        u.id                   AS entrepreneur_user_id,
        u.first_name, u.last_name, u.email,
        (
          SELECT AVG(r.rating)::numeric(3,2) FROM reviews r
          WHERE r.reviewed_user_id = u.id
        )                      AS avg_rating,
        (
          SELECT COUNT(*)::int FROM reviews r
          WHERE r.reviewed_user_id = u.id
        )                      AS review_count
      FROM bids b
      INNER JOIN entrepreneur_profiles ep ON ep.id = b.entrepreneur_id
      INNER JOIN users u                  ON u.id = ep.user_id
      WHERE b.job_id = $1
      ORDER BY
        CASE b.status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
        b.created_at DESC
      `,
      [jobId]
    );

    res.json({ bids: rows, job: job.rows[0], total: rows.length });
  } catch (err) {
    console.error("❌ admin.listBidsOnMyJob:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------------------------------
// PATCH /api/admin/bids/:id/approve
// Approves the bid AND atomically creates the contract (so admin doesn't need
// a second click). Other pending bids on the same job are auto-declined,
// matching the PM behavior. Notifications go to all affected entrepreneurs.
// -----------------------------------------------------------------------------
export const approveBidAsAdmin = async (req, res) => {
  const client = await pool.connect();
  try {
    const loaded = await loadBidForAdmin(req, res, req.params.id);
    if (!loaded) return;
    const { bid, job } = loaded;

    if (bid.status === "approved") {
      return res.status(400).json({ message: "Bid is already approved" });
    }

    await client.query("BEGIN");

    // 1) Flip the bid to approved
    await client.query(
      `UPDATE bids SET status = 'approved', updated_at = NOW() WHERE id = $1`,
      [bid.id]
    );

    // 2) Auto-decline other pending bids on the same job
    const otherDeclined = await client.query(
      `UPDATE bids SET status = 'declined', updated_at = NOW()
       WHERE job_id = $1 AND id != $2 AND status = 'pending'
       RETURNING *`,
      [bid.job_id, bid.id]
    );

    // 3) Create the contract — admin-owned (no manager_id set)
    // First check no contract already exists, in case someone double-clicks.
    const existingContract = await client.query(
      `SELECT id FROM contracts WHERE job_id = $1`,
      [bid.job_id]
    );
    let contract;
    if (existingContract.rows[0]) {
      contract = existingContract.rows[0];
    } else {
      const result = await client.query(
        `INSERT INTO contracts
          (job_id, bid_id, manager_id, admin_owner_id, entrepreneur_id,
           contract_amount, status)
         VALUES ($1, $2, NULL, $3, $4, $5, 'active')
         RETURNING *`,
        [
          bid.job_id,
          bid.id,
          req.admin.id,
          bid.entrepreneur_id,
          parseFloat(bid.amount),
        ]
      );
      contract = result.rows[0];
    }

    // 4) Flip the job to "accepted" and store the contractor's user id, so
    //    the entrepreneur app can list it under their active projects.
    const epRes = await client.query(
      `SELECT u.id AS user_id FROM entrepreneur_profiles ep
       JOIN users u ON u.id = ep.user_id WHERE ep.id = $1`,
      [bid.entrepreneur_id]
    );
    const entrepreneurUserId = epRes.rows[0]?.user_id || null;

    await client.query(
      `UPDATE jobs SET
         has_contract    = true,
         contract_status = 'active',
         entrepreneur_id = $2,
         status          = 'accepted',
         updated_at      = NOW()
       WHERE id = $1`,
      [bid.job_id, entrepreneurUserId]
    );

    // 5) Log a contract_events row (actor_user_id is nullable — leave NULL
    //    for admin-driven events, with role='admin' for clarity).
    await client.query(
      `INSERT INTO contract_events
        (contract_id, event_type, actor_user_id, actor_role, event_data)
       VALUES ($1, 'contract_created', NULL, 'admin', $2)`,
      [
        contract.id,
        JSON.stringify({
          bid_id: bid.id,
          contract_amount: parseFloat(bid.amount),
          admin_id: req.admin.id,
          entrepreneur_user_id: entrepreneurUserId,
        }),
      ]
    );

    await client.query("COMMIT");

    // 6) Notifications (best-effort, outside the transaction).
    try {
      const io = getIO();
      if (entrepreneurUserId) {
        await createNotification({
          userId: entrepreneurUserId,
          type: "bid_approved",
          jobId: bid.job_id,
          jobTitle: job.title,
          propertyName: job.building_name || "",
          bidAmount: bid.amount,
          content: `Your bid of $${Number(bid.amount).toLocaleString()} for "${job.title}" has been approved!`,
        });
        await createNotification({
          userId: entrepreneurUserId,
          type: "contract_created",
          jobId: bid.job_id,
          jobTitle: job.title,
          content: `Contract created for "${job.title}". You can now start the work!`,
        });
        if (io) {
          io.to(entrepreneurUserId.toString()).emit("bid_approved", {
            bidId: bid.id, jobId: bid.job_id, jobTitle: job.title,
            propertyName: job.building_name || "", bidAmount: bid.amount,
          });
          io.to(entrepreneurUserId.toString()).emit("contract_created", {
            contractId: contract.id, jobId: bid.job_id, jobTitle: job.title,
          });
        }
      }
      // Notify auto-declined contractors
      for (const d of otherDeclined.rows) {
        const r = await pool.query(
          `SELECT u.id AS user_id FROM entrepreneur_profiles ep
           JOIN users u ON u.id = ep.user_id WHERE ep.id = $1`,
          [d.entrepreneur_id]
        );
        const declinedUid = r.rows[0]?.user_id;
        if (!declinedUid) continue;
        await createNotification({
          userId: declinedUid,
          type: "bid_declined",
          jobId: bid.job_id,
          jobTitle: job.title,
          bidAmount: d.amount,
          content: `Your bid for "${job.title}" was not selected. Another contractor was chosen.`,
        });
        if (io) {
          io.to(declinedUid.toString()).emit("bid_declined", {
            bidId: d.id, jobId: bid.job_id, jobTitle: job.title,
            bidAmount: d.amount, reason: "another_accepted",
          });
        }
      }
    } catch (notifyErr) {
      console.warn("admin.approveBidAsAdmin: notify failed", notifyErr?.message);
    }

    res.json({
      message: "Bid approved. Contract created and other bids auto-declined.",
      contract,
      declined_bids: otherDeclined.rowCount,
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("❌ admin.approveBidAsAdmin:", err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};

// -----------------------------------------------------------------------------
// PATCH /api/admin/bids/:id/decline
// -----------------------------------------------------------------------------
export const declineBidAsAdmin = async (req, res) => {
  try {
    const loaded = await loadBidForAdmin(req, res, req.params.id);
    if (!loaded) return;
    const { bid, job } = loaded;

    if (bid.status === "declined") {
      return res.status(400).json({ message: "Bid is already declined" });
    }
    if (bid.status === "approved") {
      return res
        .status(400)
        .json({ message: "Cancel the approval first before declining this bid." });
    }

    const updated = await Bid.updateBidStatus(bid.id, "declined");

    // Notify the entrepreneur
    try {
      const ep = await pool.query(
        `SELECT u.id AS user_id FROM entrepreneur_profiles ep
         JOIN users u ON u.id = ep.user_id WHERE ep.id = $1`,
        [bid.entrepreneur_id]
      );
      const uid = ep.rows[0]?.user_id;
      if (uid) {
        await createNotification({
          userId: uid,
          type: "bid_declined",
          jobId: bid.job_id,
          jobTitle: job.title,
          bidAmount: bid.amount,
          content: `Your bid for "${job.title}" was not selected.`,
        });
        const io = getIO();
        if (io) {
          io.to(uid.toString()).emit("bid_declined", {
            bidId: bid.id, jobId: bid.job_id, jobTitle: job.title,
            bidAmount: bid.amount, reason: "declined",
          });
        }
      }
    } catch (e) {
      console.warn("admin.declineBidAsAdmin: notify failed", e?.message);
    }

    res.json({ message: "Bid declined.", bid: updated });
  } catch (err) {
    console.error("❌ admin.declineBidAsAdmin:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------------------------------
// PATCH /api/admin/bids/:id/cancel-approval
// Undoes a previous approval: contract is voided (if no work has started),
// bid status returns to pending, other auto-declined bids on the same job
// are restored to pending so the admin can reconsider.
// -----------------------------------------------------------------------------
export const cancelBidApprovalAsAdmin = async (req, res) => {
  const client = await pool.connect();
  try {
    const loaded = await loadBidForAdmin(req, res, req.params.id);
    if (!loaded) return;
    const { bid, job } = loaded;

    if (bid.status !== "approved") {
      return res.status(400).json({
        message: "This bid is not currently approved, so there's nothing to cancel.",
      });
    }

    // Refuse if any work has been started or the invoice has been submitted —
    // at that point cancellation is a dispute, not a simple undo.
    const ctr = await client.query(
      `SELECT id, status, work_started_at, invoice_submitted_at
       FROM contracts WHERE job_id = $1`,
      [bid.job_id]
    );
    const contract = ctr.rows[0];
    if (contract && (contract.work_started_at || contract.invoice_submitted_at)) {
      return res.status(400).json({
        message:
          "Cannot cancel — the contractor has already started work or submitted an invoice. Open a dispute instead.",
      });
    }

    await client.query("BEGIN");

    // 1) Bid → pending
    await client.query(
      `UPDATE bids SET status = 'pending', updated_at = NOW() WHERE id = $1`,
      [bid.id]
    );

    // 2) Restore auto-declined bids on the same job (only the ones the system
    //    auto-declined — we don't have a "system_declined" flag, so we restore
    //    all declined bids that share a created_at < approved_at signal.)
    //    Simpler heuristic: restore every declined bid on this job. Acceptable
    //    because cancelling an approval is rare and admin will re-review them.
    const restored = await client.query(
      `UPDATE bids SET status = 'pending', updated_at = NOW()
       WHERE job_id = $1 AND id != $2 AND status = 'declined'
       RETURNING id`,
      [bid.job_id, bid.id]
    );

    // 3) Delete the contract row (no work started, no invoice).
    if (contract) {
      await client.query(`DELETE FROM contracts WHERE id = $1`, [contract.id]);
    }

    // 4) Reset job back to open.
    await client.query(
      `UPDATE jobs SET
         has_contract    = false,
         contract_status = NULL,
         entrepreneur_id = NULL,
         status          = 'open',
         updated_at      = NOW()
       WHERE id = $1`,
      [bid.job_id]
    );

    await client.query("COMMIT");

    // Notify the previously-approved entrepreneur out-of-band.
    try {
      const ep = await pool.query(
        `SELECT u.id AS user_id FROM entrepreneur_profiles ep
         JOIN users u ON u.id = ep.user_id WHERE ep.id = $1`,
        [bid.entrepreneur_id]
      );
      const uid = ep.rows[0]?.user_id;
      if (uid) {
        await createNotification({
          userId: uid,
          type: "bid_cancelled",
          jobId: bid.job_id,
          jobTitle: job.title,
          content: `Your approved bid for "${job.title}" was cancelled by the platform admin.`,
        });
      }
    } catch (e) {
      console.warn("admin.cancelBidApprovalAsAdmin: notify failed", e?.message);
    }

    res.json({
      message: "Bid approval cancelled. Job re-opened for bidding.",
      restored_count: restored.rowCount,
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("❌ admin.cancelBidApprovalAsAdmin:", err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};

// =============================================================================
// CONTRACTS — admin side
// =============================================================================

// -----------------------------------------------------------------------------
// GET /api/admin/my-contracts
// Returns contracts owned by the requesting admin, with job + property + bidder.
// -----------------------------------------------------------------------------
export const listMyContracts = async (req, res) => {
  try {
    const adminId = req.admin?.id;
    if (!adminId) return res.status(401).json({ message: "Not authenticated" });

    const { rows } = await pool.query(
      `
      SELECT
        c.id, c.status, c.contract_amount,
        c.work_started_at, c.work_completed_at,
        c.invoice_submitted_at, c.invoice_total,
        c.manager_completion_confirmed, c.contractor_completion_confirmed,
        c.mutual_confirmation_completed_at,
        c.created_at,
        c.job_id,
        c.bid_id,
        c.entrepreneur_id,
        j.title         AS job_title,
        j.status        AS job_status,
        p.building_name AS property_name,
        p.address       AS property_address,
        p.city          AS property_city,
        u.id            AS entrepreneur_user_id,
        u.first_name, u.last_name, u.email,
        ep.company_name
      FROM contracts c
      INNER JOIN jobs j                   ON j.id = c.job_id
      LEFT  JOIN properties p             ON p.id = j.property_id
      LEFT  JOIN entrepreneur_profiles ep ON ep.id = c.entrepreneur_id
      LEFT  JOIN users u                  ON u.id = ep.user_id
      WHERE c.admin_owner_id = $1
      ORDER BY c.created_at DESC
      `,
      [adminId]
    );

    res.json({ contracts: rows, total: rows.length });
  } catch (err) {
    console.error("❌ admin.listMyContracts:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------------------------------
// POST /api/admin/contracts/:id/confirm-completion
// Marks the manager-side of the mutual completion handshake. If the contractor
// has already confirmed, the contract auto-closes (mutual_confirmation_completed_at).
// -----------------------------------------------------------------------------
export const confirmContractCompletionAsAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ message: "Invalid contract ID format" });
    }
    const adminId = req.admin?.id;
    if (!adminId) return res.status(401).json({ message: "Not authenticated" });

    const { manager_completion_note } = req.body;

    // Load contract + ownership check.
    const ctr = await pool.query(
      `SELECT c.*, j.title AS job_title
       FROM contracts c
       INNER JOIN jobs j ON j.id = c.job_id
       WHERE c.id = $1`,
      [id]
    );
    if (!ctr.rows[0]) {
      return res.status(404).json({ message: "Contract not found" });
    }
    const contract = ctr.rows[0];
    if (contract.admin_owner_id !== adminId) {
      return res
        .status(403)
        .json({ message: "You can only confirm contracts you own as admin." });
    }
    if (contract.manager_completion_confirmed) {
      return res
        .status(400)
        .json({ message: "You've already confirmed this contract." });
    }

    // Mark manager side confirmed.
    const updated = await pool.query(
      `UPDATE contracts SET
         manager_completion_confirmed = TRUE,
         manager_confirmed_at         = NOW(),
         manager_completion_note      = COALESCE($2, manager_completion_note),
         updated_at                   = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, manager_completion_note || null]
    );
    let c = updated.rows[0];

    // If both sides have confirmed, close out the contract and mark the job
    // completed.
    if (c.contractor_completion_confirmed) {
      const closed = await pool.query(
        `UPDATE contracts SET
           status                            = 'completed',
           work_completed_at                 = COALESCE(work_completed_at, NOW()),
           mutual_confirmation_completed_at  = NOW(),
           updated_at                        = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );
      c = closed.rows[0];
      await pool.query(
        `UPDATE jobs SET
           status          = 'completed',
           contract_status = 'completed',
           updated_at      = NOW()
         WHERE id = $1`,
        [c.job_id]
      );
    }

    // Audit the event.
    await pool.query(
      `INSERT INTO contract_events
        (contract_id, event_type, actor_user_id, actor_role, event_data)
       VALUES ($1, $2, NULL, 'admin', $3)`,
      [
        id,
        c.mutual_confirmation_completed_at
          ? "contract_completed"
          : "manager_confirmation",
        JSON.stringify({ admin_id: adminId }),
      ]
    );

    // Notify the entrepreneur.
    try {
      const ep = await pool.query(
        `SELECT u.id AS user_id FROM entrepreneur_profiles ep
         JOIN users u ON u.id = ep.user_id WHERE ep.id = $1`,
        [contract.entrepreneur_id]
      );
      const uid = ep.rows[0]?.user_id;
      if (uid) {
        await createNotification({
          userId: uid,
          type: c.mutual_confirmation_completed_at
            ? "contract_completed"
            : "completion_confirmed",
          jobId: contract.job_id,
          jobTitle: contract.job_title,
          content: c.mutual_confirmation_completed_at
            ? `The job "${contract.job_title}" is fully complete. Thanks for your work!`
            : `The platform admin confirmed completion of "${contract.job_title}". Awaiting your confirmation.`,
        });
      }
    } catch (e) {
      console.warn("admin.confirmContractCompletion: notify failed", e?.message);
    }

    res.json({
      message: c.mutual_confirmation_completed_at
        ? "Completion confirmed — contract closed."
        : "Your confirmation recorded. Waiting on the contractor.",
      contract: c,
    });
  } catch (err) {
    console.error("❌ admin.confirmContractCompletionAsAdmin:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// =============================================================================
// PROGRESS — admin validates a stage uploaded by the entrepreneur
// =============================================================================

// PUT /api/admin/progress/stage/:stageId/validate
export const validateProgressStageAsAdmin = async (req, res) => {
  try {
    const { stageId } = req.params;
    if (!isUuid(stageId)) {
      return res.status(400).json({ message: "Invalid stage ID format" });
    }
    const adminId = req.admin?.id;
    if (!adminId) return res.status(401).json({ message: "Not authenticated" });

    // Verify the stage belongs to a job owned by this admin.
    const stage = await pool.query(
      `SELECT jps.*, j.admin_owner_id
       FROM job_progress_stages jps
       INNER JOIN jobs j ON j.id = jps.job_id
       WHERE jps.id = $1`,
      [stageId]
    );
    if (!stage.rows[0]) {
      return res.status(404).json({ message: "Progress stage not found" });
    }
    if (stage.rows[0].admin_owner_id !== adminId) {
      return res
        .status(403)
        .json({ message: "You can only validate stages on jobs you own." });
    }

    const updated = await pool.query(
      `UPDATE job_progress_stages
       SET validated_by = NULL,
           validated_at = NOW(),
           status       = COALESCE($2, status),
           updated_at   = NOW()
       WHERE id = $1
       RETURNING *`,
      [stageId, req.body?.status || null]
    );

    res.json({ message: "Stage validated.", stage: updated.rows[0] });
  } catch (err) {
    console.error("❌ admin.validateProgressStageAsAdmin:", err);
    res.status(500).json({ message: "Server error" });
  }
};
