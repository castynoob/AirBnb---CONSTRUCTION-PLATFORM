// =============================================================================
// Resident Repair Requests (OdS) — controller
// =============================================================================
//
// Residents submit repair requests. Each request becomes a `jobs` row with:
//   status                  = 'draft'                (won't show in the
//                                                     contractor feed yet)
//   resident_request_status = 'pending_pm_approval'
//   raised_by_role          = 'resident'
//   raised_by_user_id       = the resident's user id
//   property_id             = resident's linked property
//   manager_id              = the property's PM (auto-resolved)
//
// The PM sees a queue of pending requests. Approve flips
// `resident_request_status='approved'` and `jobs.status='open'` — from there
// the row behaves like any manager-authored job (bidding, addenda, contract).
// Reject flips `resident_request_status='rejected'` and leaves the job as
// draft so it never leaks to contractors.
// =============================================================================

import pool from "../config/db.js";
import { createNotification } from "./notificationController.js";
import {
  emailRepairSubmittedToPM,
  emailRepairApprovedToResident,
  emailRepairRejectedToResident,
} from "../config/residentRepairEmail.js";
import { uploadToSupabase, getPublicUrl, generateUniqueFileName } from "../utils/supabaseHelpers.js";
import { BUCKETS } from "../config/supabase.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// Find the resident's linked property + its PM. Returns { property_id,
// manager_id, manager_user_id, property_name } — or null if the resident
// isn't linked to a property.
const resolveResidentContext = async (userId) => {
  const { rows } = await pool.query(
    `SELECT rp.property_id,
            p.building_name AS property_name,
            p.manager_id,
            mp.user_id AS manager_user_id
       FROM resident_profiles rp
       LEFT JOIN properties p ON p.id = rp.property_id
       LEFT JOIN manager_profiles mp ON mp.id = p.manager_id
      WHERE rp.user_id = $1`,
    [userId]
  );
  return rows[0] || null;
};

// Load a repair (jobs row) with joined resident + property info. Used by both
// residents (viewing their own) and PMs (reviewing a submission).
const loadRepair = async (jobId) => {
  const { rows } = await pool.query(
    `SELECT j.*,
            (ru.first_name || ' ' || ru.last_name) AS resident_name,
            ru.email  AS resident_email,
            p.building_name AS property_name,
            p.address AS property_address,
            mp.user_id AS manager_user_id
       FROM jobs j
       LEFT JOIN users ru ON ru.id = j.raised_by_user_id
       LEFT JOIN properties p ON p.id = j.property_id
       LEFT JOIN manager_profiles mp ON mp.id = j.manager_id
      WHERE j.id = $1`,
    [jobId]
  );
  return rows[0] || null;
};

// -----------------------------------------------------------------------------
// Resident endpoints
// -----------------------------------------------------------------------------

// POST /api/resident/repairs
// Body: { title, description, category, urgency }
export const submitRepair = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, description, category, urgency } = req.body || {};

    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ message: "Title and description are required." });
    }

    const ctx = await resolveResidentContext(userId);
    if (!ctx || !ctx.property_id) {
      return res.status(400).json({
        message:
          "Your account isn't linked to a property yet. Please contact your property manager.",
      });
    }
    if (!ctx.manager_id) {
      return res.status(400).json({
        message:
          "Your property doesn't have a property manager assigned. Please contact support.",
      });
    }

    // Draft status keeps this out of the contractor feed until the PM approves.
    const insert = await pool.query(
      `INSERT INTO jobs (
         property_id, manager_id, title, description, category, urgency,
         status, raised_by_user_id, raised_by_role, resident_request_status,
         created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, 'resident', 'pending_pm_approval', NOW(), NOW())
       RETURNING *`,
      [
        ctx.property_id,
        ctx.manager_id,
        title.trim(),
        description.trim(),
        category || 'other',
        urgency || 'Medium',
        userId,
      ]
    );
    const job = insert.rows[0];

    // Attach any uploaded images. Fire-and-log; a failed image upload does
    // NOT roll back the request — the resident's report is more valuable
    // than an attachment they can retry later. We surface the count so the
    // frontend can flag partial success.
    const files = req.files || (req.file ? [req.file] : []);
    const uploadedImages = [];
    const imageErrors = [];
    for (const file of files) {
      try {
        const uniqueFileName = generateUniqueFileName(file.originalname);
        const filePath = `jobs/${job.id}/${uniqueFileName}`;
        const uploadResult = await uploadToSupabase({
          fileBuffer: file.buffer,
          bucket: BUCKETS.JOB_IMAGES,
          filePath,
          contentType: file.mimetype,
          upsert: false,
        });
        if (!uploadResult.success) {
          imageErrors.push({ filename: file.originalname, error: uploadResult.error });
          continue;
        }
        const imageUrl = getPublicUrl(BUCKETS.JOB_IMAGES, uploadResult.data.path);
        const rowRes = await pool.query(
          `INSERT INTO images (job_id, image_url, uploaded_by, caption, created_at)
           VALUES ($1, $2, $3, $4, NOW())
           RETURNING *`,
          [job.id, imageUrl, userId, null]
        );
        uploadedImages.push(rowRes.rows[0]);
      } catch (imgErr) {
        console.error("⚠️ resident-repair image upload failed:", imgErr.message);
        imageErrors.push({ filename: file.originalname, error: imgErr.message });
      }
    }

    // Notify the PM. Fire-and-forget — persistence already succeeded.
    if (ctx.manager_user_id) {
      createNotification({
        userId: ctx.manager_user_id,
        type: "resident_repair_submitted",
        message: `New repair request from a resident at ${ctx.property_name || "your property"}: "${job.title}"`,
        entityId: job.id,
        entityType: "job",
      }).catch((err) =>
        console.error("⚠️ resident-repair PM notify failed:", err.message)
      );

      // Email the PM too — bell notification catches them in-app, this
      // catches them out-of-app.
      pool.query(
        `SELECT u.email, u.first_name, u.last_name
           FROM users u
           JOIN manager_profiles mp ON mp.user_id = u.id
          WHERE mp.id = $1`,
        [ctx.manager_id]
      ).then(async ({ rows }) => {
        const pm = rows[0];
        if (!pm) return;
        const residentRow = await pool.query(
          "SELECT first_name, last_name, email FROM users WHERE id = $1",
          [userId]
        );
        const r = residentRow.rows[0] || {};
        emailRepairSubmittedToPM({
          pmEmail: pm.email,
          resident: {
            name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || "A resident",
            email: r.email || "",
          },
          propertyName: ctx.property_name,
          title: job.title,
          description: job.description,
          repairId: job.id,
        });
      }).catch((err) =>
        console.error("⚠️ resident-repair PM email lookup failed:", err.message)
      );
    }

    res.status(201).json({
      message: "Request submitted for approval.",
      repair: job,
      images: uploadedImages,
      imageErrors: imageErrors.length > 0 ? imageErrors : undefined,
    });
  } catch (err) {
    console.error("❌ submitRepair:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/resident/repairs/mine
export const listMyRepairs = async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT j.id, j.title, j.description, j.category, j.urgency, j.status,
              j.resident_request_status, j.pm_review_note, j.pm_reviewed_at,
              j.created_at, j.updated_at,
              p.building_name AS property_name,
              p.address AS property_address
         FROM jobs j
         LEFT JOIN properties p ON p.id = j.property_id
        WHERE j.raised_by_user_id = $1 AND j.raised_by_role = 'resident'
        ORDER BY j.created_at DESC`,
      [userId]
    );
    res.json({ repairs: rows });
  } catch (err) {
    console.error("❌ listMyRepairs:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PATCH /api/resident/repairs/:id/withdraw
// Resident can withdraw while still pending PM review.
export const withdrawRepair = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const repair = await loadRepair(id);
    if (!repair) return res.status(404).json({ message: "Request not found." });
    if (repair.raised_by_user_id !== userId) {
      return res.status(403).json({ message: "You didn't raise this request." });
    }
    if (repair.resident_request_status !== "pending_pm_approval") {
      return res.status(400).json({
        message: "Only pending requests can be withdrawn.",
      });
    }

    const { rows } = await pool.query(
      `UPDATE jobs
          SET resident_request_status = 'withdrawn', status = 'draft', updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id]
    );
    res.json({ message: "Request withdrawn.", repair: rows[0] });
  } catch (err) {
    console.error("❌ withdrawRepair:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// -----------------------------------------------------------------------------
// Shared: fetch one repair (either party can read)
// -----------------------------------------------------------------------------
// GET /api/resident/repairs/:id
export const getRepair = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const repair = await loadRepair(id);
    if (!repair) return res.status(404).json({ message: "Request not found." });

    const isResidentOwner = repair.raised_by_user_id === userId;
    const isPM = repair.manager_user_id === userId;
    if (!isResidentOwner && !isPM) {
      return res.status(403).json({ message: "Not authorized." });
    }
    res.json({ repair });
  } catch (err) {
    console.error("❌ getRepair:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// -----------------------------------------------------------------------------
// PM endpoints
// -----------------------------------------------------------------------------

// GET /api/resident/repairs/pending — PM lists resident requests awaiting
// their review across all their properties.
export const listPendingForPM = async (req, res) => {
  try {
    const userId = req.user.id;
    const managerLookup = await pool.query(
      "SELECT id FROM manager_profiles WHERE user_id = $1",
      [userId]
    );
    if (!managerLookup.rows[0]) {
      return res.status(403).json({ message: "Not a property manager." });
    }
    const managerId = managerLookup.rows[0].id;

    const { rows } = await pool.query(
      `SELECT j.id, j.title, j.description, j.category, j.urgency,
              j.resident_request_status, j.created_at,
              (ru.first_name || ' ' || ru.last_name) AS resident_name,
              ru.email AS resident_email,
              p.building_name AS property_name,
              p.address AS property_address
         FROM jobs j
         LEFT JOIN users ru ON ru.id = j.raised_by_user_id
         LEFT JOIN properties p ON p.id = j.property_id
        WHERE j.manager_id = $1
          AND j.resident_request_status = 'pending_pm_approval'
        ORDER BY j.created_at ASC`,
      [managerId]
    );
    res.json({ repairs: rows, count: rows.length });
  } catch (err) {
    console.error("❌ listPendingForPM:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PATCH /api/resident/repairs/:id/approve
// Body: { budget_min?, budget_max?, note? } — PM can optionally set a budget
// range or leave a note. Approving flips the row into a normal open job.
export const approveRepair = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { budget_min, budget_max, note } = req.body || {};

    const managerLookup = await pool.query(
      "SELECT id FROM manager_profiles WHERE user_id = $1",
      [userId]
    );
    if (!managerLookup.rows[0]) return res.status(403).json({ message: "Not a PM." });
    const managerId = managerLookup.rows[0].id;

    const repair = await loadRepair(id);
    if (!repair) return res.status(404).json({ message: "Not found." });
    if (repair.manager_id !== managerId) {
      return res.status(403).json({ message: "This request isn't on your property." });
    }
    if (repair.resident_request_status !== "pending_pm_approval") {
      return res.status(400).json({
        message: "Only pending requests can be approved.",
      });
    }

    const nullIfBlank = (v) => (v === "" || v === undefined ? null : v);
    const { rows } = await pool.query(
      `UPDATE jobs
          SET status = 'open',
              resident_request_status = 'approved',
              pm_reviewed_by = $1,
              pm_reviewed_at = NOW(),
              pm_review_note = $2,
              budget_min = COALESCE($3, budget_min),
              budget_max = COALESCE($4, budget_max),
              updated_at = NOW()
        WHERE id = $5
        RETURNING *`,
      [managerId, note || null, nullIfBlank(budget_min), nullIfBlank(budget_max), id]
    );

    // Notify the resident (bell + email).
    if (repair.raised_by_user_id) {
      createNotification({
        userId: repair.raised_by_user_id,
        type: "resident_repair_approved",
        message: `Your repair request "${repair.title}" was approved and is now open for bids.`,
        entityId: id,
        entityType: "job",
      }).catch((err) =>
        console.error("⚠️ resident-repair approve notify failed:", err.message)
      );
      emailRepairApprovedToResident({
        residentEmail: repair.resident_email,
        title: repair.title,
        note: note || null,
        repairId: id,
      });
    }

    res.json({ message: "Approved. Job is now open for bids.", repair: rows[0] });
  } catch (err) {
    console.error("❌ approveRepair:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PATCH /api/resident/repairs/:id/reject
// Body: { note } — a rejection note is required so the resident understands.
export const rejectRepair = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { note } = req.body || {};

    if (!note?.trim()) {
      return res.status(400).json({ message: "Please include a note explaining the rejection." });
    }

    const managerLookup = await pool.query(
      "SELECT id FROM manager_profiles WHERE user_id = $1",
      [userId]
    );
    if (!managerLookup.rows[0]) return res.status(403).json({ message: "Not a PM." });
    const managerId = managerLookup.rows[0].id;

    const repair = await loadRepair(id);
    if (!repair) return res.status(404).json({ message: "Not found." });
    if (repair.manager_id !== managerId) {
      return res.status(403).json({ message: "This request isn't on your property." });
    }
    if (repair.resident_request_status !== "pending_pm_approval") {
      return res.status(400).json({ message: "Only pending requests can be rejected." });
    }

    const { rows } = await pool.query(
      `UPDATE jobs
          SET resident_request_status = 'rejected',
              pm_reviewed_by = $1,
              pm_reviewed_at = NOW(),
              pm_review_note = $2,
              status = 'draft',
              updated_at = NOW()
        WHERE id = $3
        RETURNING *`,
      [managerId, note.trim(), id]
    );

    if (repair.raised_by_user_id) {
      createNotification({
        userId: repair.raised_by_user_id,
        type: "resident_repair_rejected",
        message: `Your repair request "${repair.title}" was declined. Reason: ${note.trim()}`,
        entityId: id,
        entityType: "job",
      }).catch((err) =>
        console.error("⚠️ resident-repair reject notify failed:", err.message)
      );
      emailRepairRejectedToResident({
        residentEmail: repair.resident_email,
        title: repair.title,
        note: note.trim(),
        repairId: id,
      });
    }

    res.json({ message: "Request declined.", repair: rows[0] });
  } catch (err) {
    console.error("❌ rejectRepair:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
