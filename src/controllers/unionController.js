// =============================================================================
// Unions — condo associations that group properties for cross-building
// announcements.
//
// PM/admin surface (mounted under /api/unions):
//   POST   /                            — create a union
//   GET    /mine                        — unions I created (and thus admin)
//   GET    /:id                         — union detail + member properties
//   POST   /:id/properties              — add one of my properties
//   DELETE /:id/properties/:propertyId  — remove a property
//   POST   /:id/broadcasts              — post an announcement to the union
//   GET    /:id/broadcasts              — list broadcasts for the union
//
// Resident-facing:
//   GET    /property/:propertyId/broadcasts
//     Public-ish: any authenticated resident can pull broadcasts for THEIR
//     own property's union. Ownership enforced by matching req.user to a
//     resident_profiles row for that property.
//
// Ownership rules (MVP — single-admin per union):
//   • A union is only mutable by its `created_by` user.
//   • A property can only be added if the acting user is its PM.
//   • A property can only be in ONE union at a time (UNIQUE constraint on
//     union_properties.property_id).
// =============================================================================

import pool from "../config/db.js";

// Ownership helper: is req.user the PM of this property?
const isPropertyOwner = async (userId, propertyId) => {
  const { rows } = await pool.query(
    `SELECT 1
       FROM public.properties p
       JOIN public.manager_profiles mp ON mp.id = p.manager_id
      WHERE p.id = $1 AND mp.user_id = $2`,
    [propertyId, userId]
  );
  return rows.length > 0;
};

const isUnionAdmin = async (userId, unionId) => {
  const { rows } = await pool.query(
    `SELECT 1 FROM public.unions WHERE id = $1 AND created_by = $2`,
    [unionId, userId]
  );
  return rows.length > 0;
};

// -----------------------------------------------------------------------------
// POST /api/unions
// Body: { name, description?, city?, province?, contact_email?, contact_phone? }
// -----------------------------------------------------------------------------
export const createUnion = async (req, res) => {
  try {
    const { name, description, city, province, contact_email, contact_phone } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required." });
    }
    const { rows } = await pool.query(
      `INSERT INTO public.unions
         (name, description, city, province, contact_email, contact_phone, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name.trim(), description || null, city || null, province || null,
       contact_email || null, contact_phone || null, req.user.id]
    );
    res.status(201).json({ union: rows[0] });
  } catch (err) {
    console.error("❌ createUnion:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/unions/mine — unions I created, plus a member-count for each.
export const listMyUnions = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.*,
              (SELECT COUNT(*)::int FROM public.union_properties up WHERE up.union_id = u.id) AS member_count,
              (SELECT COUNT(*)::int FROM public.union_broadcasts b WHERE b.union_id = u.id)  AS broadcast_count
         FROM public.unions u
        WHERE u.created_by = $1
        ORDER BY u.created_at DESC`,
      [req.user.id]
    );
    res.json({ unions: rows });
  } catch (err) {
    console.error("❌ listMyUnions:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/unions/:id — union detail + member properties.
export const getUnion = async (req, res) => {
  try {
    const { id } = req.params;
    const unionRes = await pool.query(
      `SELECT u.*, us.first_name AS creator_first_name, us.last_name AS creator_last_name
         FROM public.unions u
         JOIN public.users us ON us.id = u.created_by
        WHERE u.id = $1`,
      [id]
    );
    if (unionRes.rows.length === 0) return res.status(404).json({ message: "Union not found." });

    const propertiesRes = await pool.query(
      `SELECT p.id, p.building_name, p.address, p.city, p.province,
              p.num_units, up.added_at
         FROM public.union_properties up
         JOIN public.properties p ON p.id = up.property_id
        WHERE up.union_id = $1
        ORDER BY up.added_at DESC`,
      [id]
    );

    res.json({
      union: unionRes.rows[0],
      properties: propertiesRes.rows,
    });
  } catch (err) {
    console.error("❌ getUnion:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /api/unions/:id/properties — Body: { property_id }
export const addProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const { property_id } = req.body || {};
    if (!property_id) return res.status(400).json({ message: "property_id is required." });

    if (!(await isUnionAdmin(req.user.id, id))) {
      return res.status(403).json({ message: "Only the union admin can add properties." });
    }
    if (!(await isPropertyOwner(req.user.id, property_id))) {
      return res.status(403).json({ message: "You don't manage that property." });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO public.union_properties (union_id, property_id, added_by)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, property_id, req.user.id]
      );
      res.status(201).json({ membership: rows[0] });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({
          code: "already_in_union",
          message: "That property is already in a union. Remove it first if you want to switch.",
        });
      }
      throw err;
    }
  } catch (err) {
    console.error("❌ addProperty (union):", err);
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE /api/unions/:id/properties/:propertyId
export const removeProperty = async (req, res) => {
  try {
    const { id, propertyId } = req.params;
    if (!(await isUnionAdmin(req.user.id, id))) {
      return res.status(403).json({ message: "Only the union admin can remove properties." });
    }
    const { rows } = await pool.query(
      `DELETE FROM public.union_properties
        WHERE union_id = $1 AND property_id = $2
        RETURNING id`,
      [id, propertyId]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Property isn't in this union." });
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ removeProperty (union):", err);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /api/unions/:id/broadcasts
// Body: { title, body, category? }
export const createBroadcast = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, body, category } = req.body || {};
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ message: "Title and body are required." });
    }
    if (!(await isUnionAdmin(req.user.id, id))) {
      return res.status(403).json({ message: "Only the union admin can post broadcasts." });
    }
    const cat = ["notice", "event", "maintenance", "emergency"].includes(category) ? category : "notice";
    const { rows } = await pool.query(
      `INSERT INTO public.union_broadcasts (union_id, author_id, category, title, body)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, req.user.id, cat, title.trim(), body.trim()]
    );
    res.status(201).json({ broadcast: rows[0] });
  } catch (err) {
    console.error("❌ createBroadcast (union):", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/unions/:id/broadcasts
export const listBroadcasts = async (req, res) => {
  try {
    const { id } = req.params;
    // Anyone linked to the union (as admin OR resident of member property)
    // can read. Cheap authorization: check union admin, else check resident
    // membership via property.
    const isAdmin = await isUnionAdmin(req.user.id, id);
    if (!isAdmin) {
      const { rowCount } = await pool.query(
        `SELECT 1
           FROM public.resident_profiles rp
           JOIN public.union_properties up ON up.property_id = rp.property_id
          WHERE rp.user_id = $1 AND up.union_id = $2
          LIMIT 1`,
        [req.user.id, id]
      );
      if (rowCount === 0) {
        return res.status(403).json({ message: "You don't have access to this union's broadcasts." });
      }
    }

    const { rows } = await pool.query(
      `SELECT b.*, u.first_name AS author_first_name, u.last_name AS author_last_name
         FROM public.union_broadcasts b
         JOIN public.users u ON u.id = b.author_id
        WHERE b.union_id = $1
        ORDER BY b.published_at DESC
        LIMIT 100`,
      [id]
    );
    res.json({ broadcasts: rows });
  } catch (err) {
    console.error("❌ listBroadcasts (union):", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/unions/property/:propertyId/broadcasts
// Resident-facing: pulls broadcasts for THEIR property's union. Returns an
// empty list if the property isn't in a union (never a 404 — quiet path).
export const listBroadcastsForProperty = async (req, res) => {
  try {
    const { propertyId } = req.params;

    // Verify the caller lives at this property.
    const { rowCount: livesHere } = await pool.query(
      `SELECT 1 FROM public.resident_profiles WHERE user_id = $1 AND property_id = $2 LIMIT 1`,
      [req.user.id, propertyId]
    );
    // PMs of this property should also be able to preview what their
    // residents see.
    let ok = livesHere > 0;
    if (!ok) ok = await isPropertyOwner(req.user.id, propertyId);
    if (!ok) return res.status(403).json({ message: "You don't have access to this property's broadcasts." });

    // Find the union this property belongs to (if any).
    const unionRes = await pool.query(
      `SELECT union_id FROM public.union_properties WHERE property_id = $1 LIMIT 1`,
      [propertyId]
    );
    if (unionRes.rows.length === 0) return res.json({ union: null, broadcasts: [] });

    const unionId = unionRes.rows[0].union_id;
    const [unionInfo, broadcasts] = await Promise.all([
      pool.query(
        `SELECT id, name, description, city, province, contact_email, contact_phone
           FROM public.unions WHERE id = $1`,
        [unionId]
      ),
      pool.query(
        `SELECT b.*, u.first_name AS author_first_name, u.last_name AS author_last_name
           FROM public.union_broadcasts b
           JOIN public.users u ON u.id = b.author_id
          WHERE b.union_id = $1
          ORDER BY b.published_at DESC
          LIMIT 50`,
        [unionId]
      ),
    ]);
    res.json({ union: unionInfo.rows[0] || null, broadcasts: broadcasts.rows });
  } catch (err) {
    console.error("❌ listBroadcastsForProperty:", err);
    res.status(500).json({ message: "Server error" });
  }
};
