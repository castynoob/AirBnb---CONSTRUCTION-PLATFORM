// =============================================================================
// Specialist Directory — public listing of opt-in entrepreneurs
// =============================================================================
//
// GET /api/directory/entrepreneurs
//   ?search=<free text over company + first/last name>
//   &trades=painter,carpenter    (comma-separated; matches specializations)
//   &city=<partial>              (matches users.city)
//   &sort=rating|photos|recent   (default: photos — surfaces active showcases)
//   &page=1&limit=24
//
// Public — no authentication. Only returns entrepreneurs where:
//   showcase_enabled = true  AND
//   the profile has at least one portfolio photo
//
// Response shape:
//   { entrepreneurs: [...], total: N, page: 1, limit: 24, trades: [{name, count}] }
//
// The `trades` array is a facet — every specialization currently represented
// in the visible directory, with a running count. Frontend uses it to render
// dynamic filter chips instead of hardcoding a taxonomy.
// =============================================================================

import pool from "../config/db.js";

// Normalise the JSON portfolio blob (stored as text in some rows, jsonb in
// others) into a real array we can slice. Bad JSON just becomes [].
const parsePortfolio = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") return raw;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
};

export const listDirectory = async (req, res) => {
  try {
    const {
      search,
      trades,
      city,
      sort = "photos",
      page = "1",
      limit = "24",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(48, Math.max(1, parseInt(limit, 10) || 24));
    const offset = (pageNum - 1) * pageSize;

    const conditions = ["ep.showcase_enabled = true"];
    const params = [];

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const i = params.length;
      conditions.push(`(
        ep.company_name ILIKE $${i}
        OR u.first_name ILIKE $${i}
        OR u.last_name ILIKE $${i}
      )`);
    }

    if (trades && trades.trim()) {
      const tradeList = trades.split(",").map((t) => t.trim()).filter(Boolean);
      if (tradeList.length > 0) {
        params.push(tradeList);
        conditions.push(`ep.specializations && $${params.length}::text[]`);
      }
    }

    if (city && city.trim()) {
      params.push(`%${city.trim()}%`);
      conditions.push(`u.city ILIKE $${params.length}`);
    }

    // Portfolio "at least one photo" filter is applied AFTER selection since
    // the portfolio is stored as JSON — cheaper to parse in Node than to
    // json_array_length() every row inside a WHERE.
    const where = conditions.join(" AND ");

    // Rating aggregate — LEFT JOIN reviews via reviewed_user_id (schema uses
    // `reviewed_user_id` on the reviews table pointing at users.id).
    const orderBy = (() => {
      switch (sort) {
        case "rating": return "avg_rating DESC NULLS LAST, review_count DESC";
        // Uses the aliased column from the inner SELECT — `u` isn't in scope
        // out here in the outer wrapper, only `sub.*` columns are.
        case "recent": return "joined_at DESC";
        case "photos":
        default:       return "portfolio_size DESC, avg_rating DESC NULLS LAST";
      }
    })();

    const listSql = `
      WITH review_stats AS (
        SELECT
          reviewed_user_id AS user_id,
          COUNT(*)::int AS review_count,
          AVG(rating)::numeric(3,2) AS avg_rating
        FROM public.reviews
        GROUP BY reviewed_user_id
      )
      SELECT
        ep.id                                          AS entrepreneur_profile_id,
        ep.user_id,
        ep.company_name,
        ep.specializations,
        ep.years_in_business,
        ep.num_employees,
        ep.rbq_status,
        ep.rbq_holder_name,
        ep.portfolio,
        ep.service_area,
        ep.bio,
        ep.website,
        u.first_name,
        u.last_name,
        u.city,
        u.province,
        u.profile_picture AS avatar_url,
        u.created_at                                   AS joined_at,
        COALESCE(rs.review_count, 0)                   AS review_count,
        rs.avg_rating,
        COALESCE(
          jsonb_array_length(
            CASE
              WHEN jsonb_typeof(ep.portfolio::jsonb) = 'array' THEN ep.portfolio::jsonb
              ELSE '[]'::jsonb
            END
          ), 0
        )::int                                          AS portfolio_size
      FROM public.entrepreneur_profiles ep
      JOIN public.users u ON u.id = ep.user_id
      LEFT JOIN review_stats rs ON rs.user_id = u.id
      WHERE ${where}
    `;

    // Wrap and filter to entrepreneurs with at least one portfolio photo,
    // then paginate + count.
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM (${listSql}) sub
        WHERE portfolio_size > 0`,
      params
    );
    const total = countRes.rows[0]?.n || 0;

    params.push(pageSize);
    params.push(offset);
    const rowsRes = await pool.query(
      `SELECT * FROM (${listSql}) sub
        WHERE portfolio_size > 0
        ORDER BY ${orderBy}
        LIMIT $${params.length - 1}
        OFFSET $${params.length}`,
      params
    );

    const entrepreneurs = rowsRes.rows.map((r) => {
      const portfolio = parsePortfolio(r.portfolio);
      const preview = portfolio.slice(0, 4).map((p) => ({
        url: p.url || p.image_url || p,
        caption: p.caption || null,
        trade_tag: p.trade_tag || null,
        is_before: !!p.is_before,
        pair_id: p.pair_id || null,
      }));
      return {
        id: r.entrepreneur_profile_id,
        user_id: r.user_id,
        company_name: r.company_name,
        first_name: r.first_name,
        last_name: r.last_name,
        display_name:
          r.company_name || `${r.first_name || ""} ${r.last_name || ""}`.trim(),
        specializations: r.specializations || [],
        years_in_business: r.years_in_business,
        num_employees: r.num_employees,
        rbq_status: r.rbq_status,
        rbq_holder_name: r.rbq_holder_name,
        service_area: r.service_area || [],
        bio: r.bio || null,
        website: r.website || null,
        city: r.city,
        province: r.province,
        avatar_url: r.avatar_url,
        joined_at: r.joined_at,
        review_count: r.review_count,
        avg_rating: r.avg_rating ? Number(r.avg_rating) : null,
        portfolio_size: r.portfolio_size,
        portfolio_preview: preview,
        // Full portfolio too — the modal opens against this same payload so
        // we don't need a second /detail endpoint round-trip for a first
        // decent showing. If lists get huge later we can slim this down.
        portfolio,
      };
    });

    // Facet: count of every specialization seen in the visible set. Used to
    // populate filter chips dynamically instead of a hardcoded taxonomy.
    const facetSql = `
      SELECT LOWER(TRIM(spec)) AS trade, COUNT(*)::int AS count
        FROM (${listSql}) sub, unnest(sub.specializations) AS spec
       WHERE portfolio_size > 0
       GROUP BY LOWER(TRIM(spec))
       ORDER BY count DESC
       LIMIT 24
    `;
    // Reuse the same params (minus the last two: limit/offset)
    const facetParams = params.slice(0, -2);
    let tradesFacet = [];
    try {
      const facetRes = await pool.query(facetSql, facetParams);
      tradesFacet = facetRes.rows.map((r) => ({
        name: r.trade,
        count: r.count,
      }));
    } catch (facetErr) {
      // Facet is nice-to-have; never fail the request over it.
      console.warn("⚠️ directory facet failed:", facetErr.message);
    }

    res.json({
      entrepreneurs,
      total,
      page: pageNum,
      limit: pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      trades: tradesFacet,
    });
  } catch (err) {
    console.error("❌ listDirectory:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
