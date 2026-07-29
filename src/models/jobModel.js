// src/models/jobModel.js
import pool from "../config/db.js";

// 🟢 Create a new job (matches schema_postgres.sql + migration 009)
// Exactly one of manager_id / admin_owner_id should be populated.
export const createJob = async ({
  property_id,
  manager_id = null,
  admin_owner_id = null,
  title,
  description,
  category,
  urgency,
  due_date,
  estimated_duration_days,
  budget_min,
  budget_max,
  is_budget_hidden = false,
  is_emergency = false,
  status = "Open",
}) => {
  // HTML forms submit "" for empty date/number inputs — Postgres rejects those
  // with 22007 on `date` columns and 22P02 on `integer`. Coerce blank strings
  // to null so optional fields save cleanly.
  const nullIfBlank = (v) => (v === "" || v === undefined ? null : v);

  const result = await pool.query(
    `INSERT INTO jobs (
      property_id, manager_id, admin_owner_id, title, description, category, urgency,
      due_date, estimated_duration_days, budget_min, budget_max,
      is_budget_hidden, is_emergency, status
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
    ) RETURNING *`,
    [
      property_id,
      manager_id,
      admin_owner_id,
      title,
      description,
      category,
      urgency,
      nullIfBlank(due_date),
      nullIfBlank(estimated_duration_days),
      budget_min,
      budget_max,
      is_budget_hidden,
      is_emergency,
      status,
    ]
  );

  return result.rows[0];
};

// 🟡 Get all jobs (contractor-facing feed).
// Exclude resident-raised requests that are still pending PM approval or
// were rejected/withdrawn — those live in `jobs` for the audit trail but
// mustn't leak into the contractor discovery feed. Approved requests slip
// through because their `resident_request_status` is 'approved' (allowed).
export const getAllJobs = async () => {
  const result = await pool.query(
    `SELECT * FROM jobs
      WHERE (is_archived = false OR is_archived IS NULL)
        AND (resident_request_status IS NULL
             OR resident_request_status = 'approved')
      ORDER BY created_at DESC`
  );
  return result.rows;
};

// 🔵 Get job by ID
export const getJobById = async (id) => {
  // ✅ JOIN with manager_profiles, users, properties, and review stats
  const result = await pool.query(
    `SELECT j.*,
            mp.user_id as manager_user_id,
            mp.company_name as manager_company,
            mp.address as manager_address,
            mp.years_experience as manager_experience,
            mp.expertise_area as manager_expertise,
            mp.total_properties as manager_total_properties,
            mp.image as manager_image,
            u.first_name || ' ' || u.last_name as manager_name,
            u.email as manager_email,
            u.phone as manager_phone,
            u.created_at as manager_joined,
            p.building_name as property_name,
            p.address as property_address,
            p.city as property_city,
            p.province as property_province,
            p.postal_code as property_postal_code,
            p.building_type as property_type,
            p.num_units as property_units,
            p.latitude as property_lat,
            p.longitude as property_lng,
            p.image as property_image,
            COALESCE(rs.avg_rating, 0) as manager_avg_rating,
            COALESCE(rs.review_count, 0) as manager_review_count,
            COALESCE(js.total_jobs, 0) as manager_total_jobs,
            COALESCE(js.completed_jobs, 0) as manager_completed_jobs
     FROM jobs j
     LEFT JOIN manager_profiles mp ON j.manager_id = mp.id
     LEFT JOIN users u ON mp.user_id = u.id
     LEFT JOIN properties p ON j.property_id = p.id
     LEFT JOIN LATERAL (
       SELECT ROUND(AVG(r.rating)::numeric, 1) as avg_rating, COUNT(*)::int as review_count
       FROM reviews r WHERE r.reviewed_user_id = mp.user_id
     ) rs ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int as total_jobs, COUNT(*) FILTER (WHERE jj.status = 'completed')::int as completed_jobs
       FROM jobs jj WHERE jj.manager_id = j.manager_id AND (jj.is_archived = false OR jj.is_archived IS NULL)
     ) js ON true
     WHERE j.id = $1`,
    [id]
  );
  return result.rows[0];
};

// 🟣 Update job
// ✅ SECURE VERSION:
export const updateJob = async (id, fields) => {
  const keys = Object.keys(fields);
  if (keys.length === 0) return null;

  // Same defensive coercion as createJob — blank string from the edit form on
  // a date/int column would otherwise 22007/22P02. Applied to nullable typed
  // columns only; leaves text/varchar untouched.
  const nullIfBlank = (v) => (v === "" ? null : v);
  const NULLABLE_TYPED = new Set(["due_date", "estimated_duration_days"]);
  const coerced = { ...fields };
  for (const k of Object.keys(coerced)) {
    if (NULLABLE_TYPED.has(k)) coerced[k] = nullIfBlank(coerced[k]);
  }

  const setQuery = keys.map((key, idx) => `${key} = $${idx + 2}`).join(", ");
  const values = [id, ...keys.map((k) => coerced[k])];

  const result = await pool.query(
    `UPDATE jobs SET ${setQuery}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    values
  );
  return result.rows[0];
};

// 🔴 Delete job
export const deleteJob = async (id) => {
  await pool.query(`DELETE FROM jobs WHERE id = $1`, [id]);
  return { message: "Job deleted successfully" };
};

// 🟠 Get all jobs by manager ID
export const getJobsByManagerId = async (manager_id) => {
  const result = await pool.query(
    `SELECT j.*,
            (SELECT i.image_url FROM images i WHERE i.job_id = j.id ORDER BY i.created_at ASC LIMIT 1) as job_image
     FROM jobs j
     WHERE j.manager_id = $1
       AND (j.is_archived = false OR j.is_archived IS NULL)
       -- Exclude unapproved resident-raised requests; the PM reviews those in
       -- the /repairs/pending queue, not here.
       AND (j.resident_request_status IS NULL
            OR j.resident_request_status = 'approved')
     ORDER BY j.created_at DESC`,
    [manager_id]
  );
  return result.rows;
};

/**
 * 🚀 Paginated + fully-enriched manager dashboard feed.
 *
 * Replaces the old client-side N+1 fan-out (~2N+P HTTP requests) with a
 * SINGLE SQL query that JOINs property + bid stats + first image per job.
 * Cursor pagination uses (created_at, id) so we get deterministic pages
 * even when many jobs share the same second-precision timestamp.
 *
 * Returns { rows, hasMore, nextCursor }.
 *
 * `cursor` is an opaque base64 encoding of "<iso-created-at>|<uuid>"; the
 * controller opaque-serializes it so callers don't build coupled URLs.
 */
export const getManagerDashboardJobs = async (
  manager_id,
  { limit = 20, cursorCreatedAt = null, cursorId = null } = {}
) => {
  const params = [manager_id];
  let cursorClause = "";
  if (cursorCreatedAt && cursorId) {
    // Row-wise comparison — jobs strictly older than the last row of the
    // previous page, breaking ties by id so we never skip or double-count.
    params.push(cursorCreatedAt);
    params.push(cursorId);
    cursorClause = `AND (j.created_at, j.id) < ($${params.length - 1}, $${params.length})`;
  }
  // Ask for limit+1 so the caller can tell whether another page exists
  // without needing a separate COUNT.
  params.push(limit + 1);

  const result = await pool.query(
    `
    SELECT
      j.id, j.title, j.description, j.category, j.urgency,
      j.status, j.budget_min, j.budget_max,
      j.is_budget_hidden, j.is_emergency,
      j.due_date, j.estimated_duration_days, j.property_id,
      j.manager_id, j.unit_id, j.admin_owner_id,
      j.created_at, j.updated_at,

      -- Property (JOIN, deduped once instead of N frontend fetches)
      p.building_name  AS property_name,
      p.address        AS property_address,
      p.city           AS property_city,
      p.province       AS property_province,
      p.postal_code    AS property_postal_code,
      p.building_type  AS property_type,
      p.num_units      AS property_units,
      p.latitude       AS property_lat,
      p.longitude      AS property_lng,
      p.image          AS property_image,

      -- Bid stats via LATERAL — one row per job, cheap on the index
      COALESCE(bs.total_bids, 0)::int      AS bid_count,
      COALESCE(bs.approved_bids, 0)::int   AS approved_bid_count,

      -- First image URL only. Full gallery is fetched on demand when the
      -- manager opens the job details page — dashboard cards don't need it.
      (SELECT i.image_url
         FROM images i
        WHERE i.job_id = j.id
        ORDER BY i.created_at ASC
        LIMIT 1)                            AS job_image

    FROM jobs j
    LEFT JOIN properties p ON p.id = j.property_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int                                                            AS total_bids,
        COUNT(*) FILTER (WHERE b.status IN ('approved', 'accepted'))::int        AS approved_bids
      FROM bids b
      WHERE b.job_id = j.id
    ) bs ON true
    WHERE j.manager_id = $1
      AND (j.is_archived = false OR j.is_archived IS NULL)
      -- Exclude resident-raised requests that haven't been approved yet.
      -- The PM's dedicated /repairs/pending queue owns triage; the dashboard
      -- is for jobs actually in flight. NULL = PM-authored jobs (unchanged).
      AND (j.resident_request_status IS NULL
           OR j.resident_request_status = 'approved')
      ${cursorClause}
    ORDER BY j.created_at DESC, j.id DESC
    LIMIT $${params.length}
    `,
    params
  );

  const rows = result.rows;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last
    ? Buffer.from(`${last.created_at.toISOString()}|${last.id}`).toString("base64")
    : null;

  return { rows: page, hasMore, nextCursor };
};

// 📦 Get archived jobs by manager ID
export const getArchivedJobsByManagerId = async (manager_id) => {
  const result = await pool.query(
    `SELECT * FROM jobs WHERE manager_id = $1 AND is_archived = true ORDER BY updated_at DESC`,
    [manager_id]
  );
  return result.rows;
};

// 🟢 Get all jobs by entrepreneur ID
export const getJobsByEntrepreneurId = async (entrepreneur_id) => {
  const result = await pool.query(
    `SELECT * FROM jobs WHERE entrepreneur_id = $1 ORDER BY created_at DESC`,
    [entrepreneur_id]
  );
  return result.rows;
};

/**
 * Bulk create multiple jobs from inspection Excel
 * Used for creating jobs from parsed inspection reports
 *
 * @param {Array} jobsArray - Array of job objects
 * @returns {Promise<Array>} Array of created jobs
 */
export const bulkCreateJobs = async (jobsArray) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const createdJobs = [];

    for (const jobData of jobsArray) {
      const {
        property_id,
        manager_id = null,
        admin_owner_id = null,
        title,
        description = '',
        category = 'Other',
        urgency = 'Medium',
        due_date = null,
        estimated_duration_days = null,
        budget_min = null,
        budget_max = null,
        is_budget_hidden = false,
        is_emergency = false,
        status = 'Open',
        location = null,
      } = jobData;

      const result = await client.query(
        `INSERT INTO jobs (
          property_id, manager_id, admin_owner_id, title, description, category, urgency,
          due_date, estimated_duration_days, budget_min, budget_max,
          is_budget_hidden, is_emergency, status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        ) RETURNING *`,
        [
          property_id,
          manager_id,
          admin_owner_id,
          title,
          description,
          category,
          urgency,
          due_date,
          estimated_duration_days,
          budget_min,
          budget_max,
          is_budget_hidden,
          is_emergency,
          status,
        ]
      );

      createdJobs.push(result.rows[0]);
    }

    await client.query('COMMIT');
    console.log(`[Job Model] ✓ Bulk created ${createdJobs.length} jobs`);

    return createdJobs;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Job Model] Bulk create error:', error);
    throw error;
  } finally {
    client.release();
  }
};