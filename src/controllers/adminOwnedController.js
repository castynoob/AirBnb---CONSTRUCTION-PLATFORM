// =============================================================================
// Admin-owned properties & jobs — listing endpoints
// =============================================================================
//
// Returns properties / jobs where admin_owner_id matches the current admin.
// Used by the new "My Properties" and "My Jobs" pages in the admin app.
//
// Distinct from /api/admin/properties and /api/admin/jobs (the all-platform
// moderation list) — those keep showing every property and job regardless of
// ownership, while these scope to the current admin's own portfolio.
// =============================================================================

import pool from "../config/db.js";

// GET /api/admin/my-properties
export const listMyProperties = async (req, res) => {
  try {
    const adminId = req.admin?.id;
    if (!adminId) return res.status(401).json({ message: "Not authenticated" });

    const { search, city, buildingType } = req.query;
    const params = [adminId];
    let where = "p.admin_owner_id = $1";
    if (search?.trim()) {
      params.push(`%${search.trim()}%`);
      where += ` AND (
        p.address ILIKE $${params.length}
        OR p.city ILIKE $${params.length}
        OR p.building_name ILIKE $${params.length}
        OR p.postal_code ILIKE $${params.length}
      )`;
    }
    if (city) {
      params.push(city);
      where += ` AND p.city = $${params.length}`;
    }
    if (buildingType) {
      params.push(buildingType);
      where += ` AND p.building_type = $${params.length}`;
    }

    const { rows } = await pool.query(
      `
      SELECT
        p.*,
        (SELECT COUNT(*)::int FROM jobs j
          WHERE j.property_id = p.id
            AND (j.is_archived = false OR j.is_archived IS NULL)
        ) AS job_count
      FROM properties p
      WHERE ${where}
      ORDER BY p.created_at DESC
      `,
      params
    );

    res.json({ properties: rows, total: rows.length });
  } catch (err) {
    console.error("❌ admin.listMyProperties:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/admin/my-jobs
export const listMyJobs = async (req, res) => {
  try {
    const adminId = req.admin?.id;
    if (!adminId) return res.status(401).json({ message: "Not authenticated" });

    const { search, status, category } = req.query;
    const params = [adminId];
    let where = "j.admin_owner_id = $1";
    if (search?.trim()) {
      params.push(`%${search.trim()}%`);
      where += ` AND (j.title ILIKE $${params.length} OR j.description ILIKE $${params.length})`;
    }
    if (status) {
      params.push(status);
      where += ` AND LOWER(j.status) = LOWER($${params.length})`;
    }
    if (category) {
      params.push(category);
      where += ` AND j.category = $${params.length}`;
    }

    // unread_count = unread notifications for THIS admin scoped to each job —
    // used by the UI to render a red dot on jobs with new activity (new bid,
    // start, completion, etc.). Subquery is cheap given partial index
    // idx_notifications_admin_unread.
    const { rows } = await pool.query(
      `
      SELECT
        j.*,
        p.building_name AS property_name,
        p.address       AS property_address,
        p.city          AS property_city,
        COALESCE((
          SELECT COUNT(*)::int FROM notifications n
          WHERE n.admin_user_id = $1
            AND n.job_id = j.id
            AND n.is_read = FALSE
        ), 0) AS unread_count
      FROM jobs j
      LEFT JOIN properties p ON p.id = j.property_id
      WHERE ${where}
      ORDER BY j.created_at DESC
      `,
      params
    );

    res.json({ jobs: rows, total: rows.length });
  } catch (err) {
    console.error("❌ admin.listMyJobs:", err);
    res.status(500).json({ message: "Server error" });
  }
};
