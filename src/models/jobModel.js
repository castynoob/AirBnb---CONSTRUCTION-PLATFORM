// src/models/jobModel.js
import pool from "../config/db.js";

// 🟢 Create a new job (matches schema_postgres.sql)
export const createJob = async ({
  property_id,
  manager_id,
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
  const result = await pool.query(
    `INSERT INTO jobs (
      property_id, manager_id, title, description, category, urgency,
      due_date, estimated_duration_days, budget_min, budget_max,
      is_budget_hidden, is_emergency, status
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
    ) RETURNING *`,
    [
      property_id,
      manager_id,
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

  return result.rows[0];
};

// 🟡 Get all jobs
export const getAllJobs = async () => {
  const result = await pool.query(`SELECT * FROM jobs WHERE (is_archived = false OR is_archived IS NULL) ORDER BY created_at DESC`);
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

  const setQuery = keys.map((key, idx) => `${key} = $${idx + 2}`).join(", ");
  const values = [id, ...Object.values(fields)];

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
     WHERE j.manager_id = $1 AND (j.is_archived = false OR j.is_archived IS NULL)
     ORDER BY j.created_at DESC`,
    [manager_id]
  );
  return result.rows;
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
        manager_id,
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
          property_id, manager_id, title, description, category, urgency,
          due_date, estimated_duration_days, budget_min, budget_max,
          is_budget_hidden, is_emergency, status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) RETURNING *`,
        [
          property_id,
          manager_id,
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