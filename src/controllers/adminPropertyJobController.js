// =============================================================================
// Admin-side property & job management
// =============================================================================
//
// These endpoints let an admin (or super_admin) act on behalf of any property
// manager — creating, editing, and deleting properties and jobs in that
// manager's portfolio. The created data is owned by the target manager, not
// the admin, so it appears in the manager's regular dashboard as if they had
// created it themselves.
//
// All actions are recorded in user_activity_logs with the admin's identity and
// the affected manager's user id, so the audit trail is preserved.
//
// Gating: routes must be wired with `authenticateAdmin + isAdminOrHigher`.
// Moderators stay view-only (they keep flag/notes/close on the original
// /api/admin/{jobs,properties}/:id/* endpoints).
// =============================================================================

import pool from "../config/db.js";
import * as Property from "../models/propertyModel.js";
import * as Job from "../models/jobModel.js";
import {
  createUserActivityLog,
  ActivityActions,
  EntityTypes,
} from "../models/userActivityModel.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

// -----------------------------------------------------------------------------
// GET /api/admin/managers
// Lightweight list of all property managers for the admin "act on behalf of"
// dropdown. Returns user_id (the FK we use to look up manager_profiles), the
// manager_profile id, display name, company, email, and property count.
// -----------------------------------------------------------------------------
export const listManagers = async (req, res) => {
  try {
    const { search } = req.query;
    const params = [];
    let where = "";
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      where = `WHERE (
        u.first_name ILIKE $1 OR u.last_name ILIKE $1 OR u.email ILIKE $1
        OR mp.company_name ILIKE $1
      )`;
    }

    const sql = `
      SELECT
        u.id          AS user_id,
        mp.id         AS manager_profile_id,
        u.first_name,
        u.last_name,
        u.email,
        mp.company_name,
        (
          SELECT COUNT(*)::int FROM properties p
          WHERE p.manager_id = mp.id
        ) AS property_count
      FROM users u
      INNER JOIN manager_profiles mp ON mp.user_id = u.id
      ${where}
      ORDER BY mp.company_name NULLS LAST, u.last_name, u.first_name
      LIMIT 200
    `;
    const { rows } = await pool.query(sql, params);
    res.json({ managers: rows });
  } catch (err) {
    console.error("❌ admin.listManagers:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------------------------------
// Helper: resolve a manager_profile.id from a target user_id (the field the
// admin sends in the request body) and guard against missing/invalid values.
// Returns { manager_profile_id, manager_user_id } or sends a 400 and returns null.
// -----------------------------------------------------------------------------
async function resolveManagerProfile(req, res) {
  const managerUserId = req.body.manager_user_id;
  if (!isUuid(managerUserId)) {
    res.status(400).json({
      message:
        "manager_user_id is required and must be a valid user UUID. Pick a property manager to act on behalf of.",
    });
    return null;
  }
  const { rows } = await pool.query(
    `SELECT id FROM manager_profiles WHERE user_id = $1`,
    [managerUserId]
  );
  if (!rows[0]) {
    res.status(404).json({
      message: "The selected user does not have a property manager profile.",
    });
    return null;
  }
  return { manager_profile_id: rows[0].id, manager_user_id: managerUserId };
}

// -----------------------------------------------------------------------------
// Resolves ownership for create endpoints:
//   - If manager_user_id is provided → "act on behalf of" mode, returns
//     { mode: 'manager', manager_profile_id, manager_user_id }
//   - Otherwise → admin self-owns, returns
//     { mode: 'admin', admin_owner_id }
//   - Returns null and sends a 4xx on invalid input.
// -----------------------------------------------------------------------------
async function resolveOwner(req, res) {
  // Honor an explicit ownership choice if the client sends one.
  const ownership = req.body.ownership; // "admin" | "manager" | undefined
  const managerUserId = req.body.manager_user_id;

  if (ownership === "admin" || (!managerUserId && !ownership)) {
    if (!req.admin?.id) {
      res.status(401).json({ message: "Admin identity missing on request." });
      return null;
    }
    return { mode: "admin", admin_owner_id: req.admin.id };
  }

  // Manager mode (explicit or implied by manager_user_id being present)
  const resolved = await resolveManagerProfile(req, res);
  if (!resolved) return null;
  return { mode: "manager", ...resolved };
}

// =============================================================================
// PROPERTIES
// =============================================================================

// POST /api/admin/properties
// Two modes:
//   - ownership === "manager" (or manager_user_id provided) → acts on behalf of that PM
//   - ownership === "admin" (or no manager_user_id) → admin self-owns the property
export const adminCreateProperty = async (req, res) => {
  try {
    const owner = await resolveOwner(req, res);
    if (!owner) return;

    const {
      address,
      city,
      province,
      postal_code,
      num_units,
      building_type,
      building_name,
      latitude,
      longitude,
    } = req.body;

    if (!address || !city) {
      return res.status(400).json({ message: "Address and city are required" });
    }

    const parsedNumUnits = parseInt(num_units, 10) || 0;
    if (parsedNumUnits < 0) {
      return res.status(400).json({ message: "Number of units cannot be negative" });
    }

    const newProperty = await Property.createProperty({
      manager_id: owner.mode === "manager" ? owner.manager_profile_id : null,
      admin_owner_id: owner.mode === "admin" ? owner.admin_owner_id : null,
      address,
      city,
      province: province || null,
      postal_code: postal_code || null,
      num_units: parsedNumUnits,
      building_type: building_type || "Apartment",
      building_name: building_name || null,
      latitude: latitude || null,
      longitude: longitude || null,
    });

    // Mirror PM flow only when the property is manager-owned: auto-create
    // the building group chat, with the OWNING manager added as the admin
    // member so the chat lives in their account naturally. Admin-owned
    // properties skip the group chat — they aren't "buildings with residents".
    if (owner.mode === "manager") {
      try {
        const chatName = building_name || `${address} Community`;
        const existingChat = await pool.query(
          `SELECT id FROM group_chats WHERE property_id = $1`,
          [newProperty.id]
        );
        if (existingChat.rows.length === 0) {
          const newChat = await pool.query(
            `INSERT INTO group_chats (name, description, property_id, building_name, chat_type, created_by, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, TRUE)
             RETURNING *`,
            [
              chatName,
              "Community chat for all building residents",
              newProperty.id,
              building_name || null,
              "building",
              owner.manager_user_id,
            ]
          );
          await pool.query(
            `INSERT INTO group_chat_members (group_chat_id, user_id, is_admin)
             VALUES ($1, $2, TRUE)
             ON CONFLICT (group_chat_id, user_id) DO NOTHING`,
            [newChat.rows[0].id, owner.manager_user_id]
          );
        }
      } catch (chatErr) {
        console.error("⚠️ admin property: group chat creation failed:", chatErr);
      }
    }

    // Audit log — credit the ADMIN as the actor, with the manager id and the
    // property id in metadata so the trail is clear.
    try {
      await createUserActivityLog(
        req.admin?.id || req.user?.id || null,
        ActivityActions.PROPERTY_ADDED,
        EntityTypes.PROPERTY,
        newProperty.id,
        {
          via: "admin",
          ownership: owner.mode,
          on_behalf_of_user_id: owner.manager_user_id || null,
          manager_profile_id: owner.manager_profile_id || null,
          admin_owner_id: owner.admin_owner_id || null,
          address,
          city,
        },
        req.ip || req.headers["x-forwarded-for"] || null,
        req.headers["user-agent"] || null
      );
    } catch (e) {
      console.warn("admin property: activity log failed", e?.message);
    }

    res.status(201).json({
      message:
        owner.mode === "admin"
          ? "Property created (owned by admin)."
          : "Property created on behalf of the selected manager.",
      property: newProperty,
    });
  } catch (err) {
    console.error("❌ admin.adminCreateProperty:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// PUT /api/admin/properties/:id
// Unlike the manager endpoint, this does NOT check ownership — admin can edit
// any property. If the request body includes `manager_user_id`, the property
// is reassigned to that manager (handy for transferring ownership).
export const adminUpdateProperty = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ message: "Invalid property ID format" });
    }

    const property = await Property.getPropertyById(id);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    const updateFields = { ...(req.body || {}) };

    // Strip immutable / dangerous fields the model shouldn't touch directly.
    delete updateFields.id;
    delete updateFields.created_at;
    delete updateFields.manager_id; // can only be changed via manager_user_id below

    // Optional reassignment to a different manager.
    if (updateFields.manager_user_id) {
      if (!isUuid(updateFields.manager_user_id)) {
        return res.status(400).json({ message: "manager_user_id must be a valid UUID" });
      }
      const { rows } = await pool.query(
        `SELECT id FROM manager_profiles WHERE user_id = $1`,
        [updateFields.manager_user_id]
      );
      if (!rows[0]) {
        return res
          .status(404)
          .json({ message: "The selected user does not have a property manager profile." });
      }
      updateFields.manager_id = rows[0].id;
      delete updateFields.manager_user_id;
    }

    if (updateFields.num_units !== undefined) {
      const parsed = parseInt(updateFields.num_units, 10) || 0;
      if (parsed < 0) {
        return res.status(400).json({ message: "Number of units cannot be negative" });
      }
      updateFields.num_units = parsed;
    }

    const updated = await Property.updateProperty(id, updateFields);

    try {
      await createUserActivityLog(
        req.admin?.id || req.user?.id || null,
        ActivityActions.PROPERTY_UPDATED,
        EntityTypes.PROPERTY,
        id,
        { via: "admin", changed_fields: Object.keys(updateFields) },
        req.ip || null,
        req.headers["user-agent"] || null
      );
    } catch (e) {
      console.warn("admin property update: activity log failed", e?.message);
    }

    res.json({ message: "Property updated successfully (as admin).", property: updated });
  } catch (err) {
    console.error("❌ admin.adminUpdateProperty:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE /api/admin/properties/:id
// Admin can delete any property. The DB cascade rules (post-migration 008)
// handle the downstream effects: resident_profiles.property_id is SET NULL,
// announcements/group_chats/jobs cascade as defined.
export const adminDeleteProperty = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ message: "Invalid property ID format" });
    }

    const property = await Property.getPropertyById(id);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    await Property.deleteProperty(id);

    try {
      // No PROPERTY_DELETED constant in current enum — pass the raw action string.
      await createUserActivityLog(
        req.admin?.id || req.user?.id || null,
        "property_deleted",
        EntityTypes.PROPERTY,
        id,
        {
          via: "admin",
          address: property.address,
          city: property.city,
          manager_id: property.manager_id,
        },
        req.ip || null,
        req.headers["user-agent"] || null
      );
    } catch (e) {
      console.warn("admin property delete: activity log failed", e?.message);
    }

    res.json({ message: "Property deleted successfully (as admin)." });
  } catch (err) {
    console.error("❌ admin.adminDeleteProperty:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// =============================================================================
// JOBS
// =============================================================================

// POST /api/admin/jobs
export const adminCreateJob = async (req, res) => {
  try {
    const owner = await resolveOwner(req, res);
    if (!owner) return;

    const { budget_min, budget_max, property_id } = req.body;

    if (budget_min == null || budget_max == null) {
      return res
        .status(400)
        .json({ message: "Budget minimum and maximum are required" });
    }
    if (parseFloat(budget_min) > parseFloat(budget_max)) {
      return res
        .status(400)
        .json({ message: "Budget maximum must be greater than minimum" });
    }
    if (!isUuid(property_id)) {
      return res.status(400).json({ message: "property_id is required and must be a UUID" });
    }

    // Verify the property's ownership matches the job ownership the admin chose.
    // - manager mode: property.manager_id must equal the selected manager.
    // - admin mode:  property.admin_owner_id must equal the requesting admin.
    const propCheck = await pool.query(
      `SELECT manager_id, admin_owner_id FROM properties WHERE id = $1`,
      [property_id]
    );
    if (!propCheck.rows[0]) {
      return res.status(404).json({ message: "Property not found" });
    }

    if (owner.mode === "manager") {
      if (propCheck.rows[0].manager_id !== owner.manager_profile_id) {
        return res.status(400).json({
          message:
            "Property does not belong to the selected manager. Pick a property owned by the same manager.",
        });
      }
    } else {
      // admin mode
      if (propCheck.rows[0].admin_owner_id !== owner.admin_owner_id) {
        return res.status(400).json({
          message:
            "Property is not owned by you. Pick one of your admin-owned properties, or switch to 'on behalf of' mode.",
        });
      }
    }

    const jobData = {
      ...req.body,
      manager_id: owner.mode === "manager" ? owner.manager_profile_id : null,
      admin_owner_id: owner.mode === "admin" ? owner.admin_owner_id : null,
    };
    delete jobData.manager_user_id;
    delete jobData.ownership;

    const newJob = await Job.createJob(jobData);

    try {
      await createUserActivityLog(
        req.admin?.id || req.user?.id || null,
        ActivityActions.JOB_CREATED,
        EntityTypes.JOB,
        newJob.id,
        {
          via: "admin",
          ownership: owner.mode,
          on_behalf_of_user_id: owner.manager_user_id || null,
          admin_owner_id: owner.admin_owner_id || null,
          property_id: newJob.property_id,
          title: newJob.title,
        },
        req.ip || null,
        req.headers["user-agent"] || null
      );
    } catch (e) {
      console.warn("admin job create: activity log failed", e?.message);
    }

    res.status(201).json({
      message:
        owner.mode === "admin"
          ? "Job created (owned by admin)."
          : "Job created on behalf of the selected manager.",
      job: newJob,
    });
  } catch (err) {
    console.error("❌ admin.adminCreateJob:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// PUT /api/admin/jobs/:id
// Mirror the PM editable-field allowlist but skip ownership checks.
const EDITABLE_JOB_FIELDS = new Set([
  "title", "description", "category", "urgency",
  "due_date", "estimated_duration_days",
  "budget_min", "budget_max", "is_budget_hidden", "is_emergency",
  "status", "location", "severity", "priority",
  "deadline", "bid_deadline", "entrepreneur_id",
  "property_id",
]);

export const adminUpdateJob = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ message: "Invalid job ID format" });
    }

    const updateFields = Object.fromEntries(
      Object.entries(req.body || {}).filter(([k]) => EDITABLE_JOB_FIELDS.has(k))
    );

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ message: "No editable fields supplied" });
    }

    // Optional reassignment to a different manager (and possibly property).
    if (req.body.manager_user_id) {
      if (!isUuid(req.body.manager_user_id)) {
        return res.status(400).json({ message: "manager_user_id must be a valid UUID" });
      }
      const { rows } = await pool.query(
        `SELECT id FROM manager_profiles WHERE user_id = $1`,
        [req.body.manager_user_id]
      );
      if (!rows[0]) {
        return res.status(404).json({
          message: "The selected user does not have a property manager profile.",
        });
      }
      updateFields.manager_id = rows[0].id;
    }

    if (updateFields.budget_min != null && updateFields.budget_max != null) {
      if (parseFloat(updateFields.budget_min) > parseFloat(updateFields.budget_max)) {
        return res
          .status(400)
          .json({ message: "Budget maximum must be greater than minimum" });
      }
    }

    const updated = await Job.updateJob(id, updateFields);
    if (!updated) {
      return res.status(404).json({ message: "Job not found" });
    }

    try {
      await createUserActivityLog(
        req.admin?.id || req.user?.id || null,
        ActivityActions.JOB_UPDATED,
        EntityTypes.JOB,
        id,
        { via: "admin", changed_fields: Object.keys(updateFields) },
        req.ip || null,
        req.headers["user-agent"] || null
      );
    } catch (e) {
      console.warn("admin job update: activity log failed", e?.message);
    }

    res.json({ message: "Job updated successfully (as admin).", job: updated });
  } catch (err) {
    console.error("❌ admin.adminUpdateJob:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE /api/admin/jobs/:id
export const adminDeleteJob = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ message: "Invalid job ID format" });
    }

    const existing = await Job.getJobById(id);
    if (!existing) {
      return res.status(404).json({ message: "Job not found" });
    }

    await Job.deleteJob(id);

    try {
      // Reuse JOB_CANCELLED for delete events — semantically nearest existing constant.
      await createUserActivityLog(
        req.admin?.id || req.user?.id || null,
        ActivityActions.JOB_CANCELLED,
        EntityTypes.JOB,
        id,
        { via: "admin", action: "deleted", title: existing.title, manager_id: existing.manager_id },
        req.ip || null,
        req.headers["user-agent"] || null
      );
    } catch (e) {
      console.warn("admin job delete: activity log failed", e?.message);
    }

    res.json({ message: "Job deleted successfully (as admin)." });
  } catch (err) {
    console.error("❌ admin.adminDeleteJob:", err);
    res.status(500).json({ message: "Server error" });
  }
};
