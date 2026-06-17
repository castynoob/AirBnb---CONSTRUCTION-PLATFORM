// =============================================================================
// Admin user management
// =============================================================================
//
// Lets a super_admin (and optionally admin) create, list, update, and
// deactivate other admin accounts.
//
// Endpoints:
//   GET    /api/admin/admins         — list admin users
//   POST   /api/admin/admins         — create a new admin (email, password, name, role)
//   PATCH  /api/admin/admins/:id     — change role, name, status
//   DELETE /api/admin/admins/:id     — soft-delete (sets status='inactive')
//
// Gating is applied at the route layer (isSuperAdmin for create/delete,
// isAdminOrHigher for list/update). All actions are logged in audit_logs.
// =============================================================================

import bcrypt from "bcryptjs";
import pool from "../config/db.js";

const VALID_ROLES = ["super_admin", "admin", "moderator", "support"];
const VALID_STATUSES = ["active", "inactive", "suspended"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

// Light email validator — good enough for required-field rejection.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Fields returned to the client. Never includes password_hash.
const ADMIN_SAFE_COLUMNS = `
  id, email, name, role, status, avatar_url, last_login_at, created_at, updated_at
`;

async function logAuditEvent(req, action, targetId, details = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.admin?.id || null,
        action,
        "admin_user",
        targetId,
        JSON.stringify(details),
        req.ip || req.headers["x-forwarded-for"] || null,
        req.headers["user-agent"] || null,
      ]
    );
  } catch (e) {
    // Don't fail the request because audit log failed; just warn.
    console.warn("audit_logs insert failed:", e?.message);
  }
}

// -----------------------------------------------------------------------------
// GET /api/admin/admins
// -----------------------------------------------------------------------------
export const listAdmins = async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const params = [];
    const where = [];
    if (search?.trim()) {
      params.push(`%${search.trim()}%`);
      where.push(`(email ILIKE $${params.length} OR name ILIKE $${params.length})`);
    }
    if (role) {
      params.push(role);
      where.push(`role = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }

    const sql = `
      SELECT ${ADMIN_SAFE_COLUMNS}
      FROM admin_users
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY created_at DESC
      LIMIT 500
    `;
    const { rows } = await pool.query(sql, params);
    res.json({ admins: rows, total: rows.length });
  } catch (err) {
    console.error("❌ admin.listAdmins:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------------------------------
// POST /api/admin/admins
// Body: { email, password, name?, role? }
// Only super_admin should be able to call this (enforced in routes).
// -----------------------------------------------------------------------------
export const createAdmin = async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ message: "A valid email is required" });
    }
    if (!password || password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }
    const chosenRole = role || "admin";
    if (!VALID_ROLES.includes(chosenRole)) {
      return res
        .status(400)
        .json({ message: `Role must be one of: ${VALID_ROLES.join(", ")}` });
    }
    const displayName = (name || email.split("@")[0]).trim();

    // Check email uniqueness up-front for a nicer error than a UNIQUE violation.
    const existing = await pool.query(
      `SELECT id FROM admin_users WHERE email = $1`,
      [email.trim().toLowerCase()]
    );
    if (existing.rows[0]) {
      return res
        .status(409)
        .json({ message: "An admin with that email already exists." });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO admin_users (email, password_hash, name, role, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING ${ADMIN_SAFE_COLUMNS}`,
      [email.trim().toLowerCase(), password_hash, displayName, chosenRole]
    );

    await logAuditEvent(req, "admin_created", rows[0].id, {
      email: rows[0].email,
      role: rows[0].role,
    });

    res.status(201).json({
      message: "Admin created successfully.",
      admin: rows[0],
    });
  } catch (err) {
    console.error("❌ admin.createAdmin:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------------------------------
// PATCH /api/admin/admins/:id
// Body may include: name, role, status, password
// -----------------------------------------------------------------------------
export const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ message: "Invalid admin ID" });
    }

    const { name, role, status, password } = req.body;

    // Build dynamic SET clause.
    const setParts = [];
    const params = [];

    if (typeof name === "string" && name.trim()) {
      params.push(name.trim());
      setParts.push(`name = $${params.length}`);
    }
    if (role) {
      if (!VALID_ROLES.includes(role)) {
        return res
          .status(400)
          .json({ message: `Role must be one of: ${VALID_ROLES.join(", ")}` });
      }
      params.push(role);
      setParts.push(`role = $${params.length}`);
    }
    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res
          .status(400)
          .json({ message: `Status must be one of: ${VALID_STATUSES.join(", ")}` });
      }
      params.push(status);
      setParts.push(`status = $${params.length}`);
    }
    if (password) {
      if (password.length < 8) {
        return res
          .status(400)
          .json({ message: "Password must be at least 8 characters long" });
      }
      const hash = await bcrypt.hash(password, 10);
      params.push(hash);
      setParts.push(`password_hash = $${params.length}`);
    }

    if (!setParts.length) {
      return res.status(400).json({ message: "No editable fields supplied" });
    }

    // Append updated_at then the WHERE id
    setParts.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `
      UPDATE admin_users
      SET ${setParts.join(", ")}
      WHERE id = $${params.length}
      RETURNING ${ADMIN_SAFE_COLUMNS}
    `;
    const { rows } = await pool.query(sql, params);
    if (!rows[0]) return res.status(404).json({ message: "Admin not found" });

    await logAuditEvent(req, "admin_updated", id, {
      changed: { name: !!name, role: !!role, status: !!status, password: !!password },
    });

    res.json({ message: "Admin updated.", admin: rows[0] });
  } catch (err) {
    console.error("❌ admin.updateAdmin:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------------------------------
// DELETE /api/admin/admins/:id
// Soft-delete: sets status to "inactive" so the audit trail survives. A real
// DELETE would orphan the audit_logs.admin_id FK.
// -----------------------------------------------------------------------------
export const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ message: "Invalid admin ID" });
    }

    // Prevent an admin from deactivating themselves — would lock them out.
    if (req.admin?.id === id) {
      return res
        .status(400)
        .json({ message: "You cannot deactivate your own account." });
    }

    const { rows } = await pool.query(
      `UPDATE admin_users
       SET status = 'inactive', updated_at = NOW()
       WHERE id = $1
       RETURNING ${ADMIN_SAFE_COLUMNS}`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ message: "Admin not found" });

    await logAuditEvent(req, "admin_deactivated", id, { email: rows[0].email });

    res.json({ message: "Admin deactivated.", admin: rows[0] });
  } catch (err) {
    console.error("❌ admin.deleteAdmin:", err);
    res.status(500).json({ message: "Server error" });
  }
};
