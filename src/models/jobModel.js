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
  const result = await pool.query(`SELECT * FROM jobs ORDER BY created_at DESC`);
  return result.rows;
};

// 🔵 Get job by ID
export const getJobById = async (id) => {
  const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [id]);
  return result.rows[0];
};

// 🟣 Update job
export const updateJob = async (id, fields) => {
  const keys = Object.keys(fields);
  if (keys.length === 0) return null;

  const setQuery = keys.map((key, idx) => `${key} = $${idx + 1}`).join(", ");
  const values = Object.values(fields);

  const result = await pool.query(
    `UPDATE jobs SET ${setQuery}, updated_at = NOW() WHERE id = '${id}' RETURNING *`,
    values
  );
  return result.rows[0];
};

// 🔴 Delete job
export const deleteJob = async (id) => {
  await pool.query(`DELETE FROM jobs WHERE id = $1`, [id]);
  return { message: "Job deleted successfully" };
};
