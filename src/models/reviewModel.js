import pool from "../config/db.js";

// Create Review
export const createReview = async (reviewer_id, reviewed_user_id, job_id, rating, comment) => {
  const result = await pool.query(
    `INSERT INTO reviews (reviewer_id, reviewed_user_id, job_id, rating, comment)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [reviewer_id, reviewed_user_id, job_id, rating, comment]
  );
  return result.rows[0];
};

// Get reviews submitted by a user
export const getReviewsByReviewer = async (reviewer_id) => {
  const result = await pool.query(
    `SELECT r.*, j.title AS job_title, u.first_name AS reviewed_first_name, u.last_name AS reviewed_last_name
     FROM reviews r
     LEFT JOIN jobs j ON r.job_id = j.id
     LEFT JOIN users u ON r.reviewed_user_id = u.id
     WHERE r.reviewer_id = $1
     ORDER BY r.created_at DESC`,
    [reviewer_id]
  );
  return result.rows;
};

// Get reviews received by a user
export const getReviewsByReviewedUser = async (reviewed_user_id) => {
  const result = await pool.query(
    `SELECT r.*, j.title AS job_title, u.first_name AS reviewer_first_name, u.last_name AS reviewer_last_name
     FROM reviews r
     LEFT JOIN jobs j ON r.job_id = j.id
     LEFT JOIN users u ON r.reviewer_id = u.id
     WHERE r.reviewed_user_id = $1
     ORDER BY r.created_at DESC`,
    [reviewed_user_id]
  );
  return result.rows;
};

export const hasUserReviewedCompletedJob = async (reviewer_id, job_id) => {
  const result = await pool.query(
    `SELECT r.*
     FROM reviews r
     JOIN jobs j ON j.id = r.job_id
     WHERE r.reviewer_id = $1
       AND r.job_id = $2
       AND j.status = 'completed'`,
    [reviewer_id, job_id]
  );
  return result.rows.length > 0; // true if already reviewed
};

// Get review by job_id
export const getReviewByJobId = async (job_id) => {
  const result = await pool.query(
    `SELECT r.*, 
            u1.first_name AS reviewer_first_name,
            u1.last_name AS reviewer_last_name,
            u2.first_name AS reviewed_first_name,
            u2.last_name AS reviewed_last_name
     FROM reviews r
     LEFT JOIN users u1 ON u1.id = r.reviewer_id
     LEFT JOIN users u2 ON u2.id = r.reviewed_user_id
     WHERE r.job_id = $1`,
    [job_id]
  );

  return result.rows; // could be 0 or 1 depending on constraints
};
