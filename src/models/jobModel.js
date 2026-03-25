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
  // ✅ JOIN with manager_profiles to get the user_id for messaging
  const result = await pool.query(
    `SELECT j.*,
            mp.user_id as manager_user_id,
            u.first_name || ' ' || u.last_name as manager_name
     FROM jobs j
     LEFT JOIN manager_profiles mp ON j.manager_id = mp.id
     LEFT JOIN users u ON mp.user_id = u.id
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
    `SELECT * FROM jobs WHERE manager_id = $1 AND (is_archived = false OR is_archived IS NULL) ORDER BY created_at DESC`,
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