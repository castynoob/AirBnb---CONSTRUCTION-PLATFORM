import pool from "../config/db.js";

// Create Review with category ratings
export const createReview = async (reviewer_id, reviewed_user_id, job_id, rating, comment, categoryRatings = {}) => {
  const { rating_quality, rating_timeliness, rating_communication, rating_value } = categoryRatings;
  const result = await pool.query(
    `INSERT INTO reviews (reviewer_id, reviewed_user_id, job_id, rating, comment, rating_quality, rating_timeliness, rating_communication, rating_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [reviewer_id, reviewed_user_id, job_id, rating, comment, rating_quality || null, rating_timeliness || null, rating_communication || null, rating_value || null]
  );
  return result.rows[0];
};

// Get reviews submitted by a user
export const getReviewsByReviewer = async (reviewer_id) => {
  const result = await pool.query(
    `SELECT r.*,
            j.title AS job_title,
            u.first_name AS reviewed_first_name,
            u.last_name AS reviewed_last_name,
            CASE WHEN u.role = 'entrepreneur' AND ep.company_name IS NOT NULL AND ep.company_name != ''
              THEN ep.company_name
              ELSE u.first_name || ' ' || u.last_name
            END AS reviewed_display_name,
            COALESCE(
              json_agg(
                json_build_object('id', i.id, 'image_url', i.image_url, 'image_type', COALESCE(i.image_type, 'general'), 'created_at', i.created_at)
                ORDER BY i.created_at
              ) FILTER (WHERE i.id IS NOT NULL),
              '[]'
            ) as images
     FROM reviews r
     LEFT JOIN jobs j ON r.job_id = j.id
     LEFT JOIN users u ON r.reviewed_user_id = u.id
     LEFT JOIN entrepreneur_profiles ep ON u.id = ep.user_id AND u.role = 'entrepreneur'
     LEFT JOIN images i ON i.review_id = r.id
     WHERE r.reviewer_id = $1
     GROUP BY r.id, j.title, u.first_name, u.last_name, u.role, ep.company_name
     ORDER BY r.created_at DESC`,
    [reviewer_id]
  );
  return result.rows;
};

// Get reviews received by a user
export const getReviewsByReviewedUser = async (reviewed_user_id) => {
  const result = await pool.query(
    `SELECT r.*,
            j.title AS job_title,
            u.first_name AS reviewer_first_name,
            u.last_name AS reviewer_last_name,
            CASE WHEN u.role = 'entrepreneur' AND ep.company_name IS NOT NULL AND ep.company_name != ''
              THEN ep.company_name
              ELSE u.first_name || ' ' || u.last_name
            END AS reviewer_display_name,
            COALESCE(
              json_agg(
                json_build_object('id', i.id, 'image_url', i.image_url, 'image_type', COALESCE(i.image_type, 'general'), 'created_at', i.created_at)
                ORDER BY i.created_at
              ) FILTER (WHERE i.id IS NOT NULL),
              '[]'
            ) as images
     FROM reviews r
     LEFT JOIN jobs j ON r.job_id = j.id
     LEFT JOIN users u ON r.reviewer_id = u.id
     LEFT JOIN entrepreneur_profiles ep ON u.id = ep.user_id AND u.role = 'entrepreneur'
     LEFT JOIN images i ON i.review_id = r.id
     WHERE r.reviewed_user_id = $1
     GROUP BY r.id, j.title, u.first_name, u.last_name, u.role, ep.company_name
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
            CASE WHEN u1.role = 'entrepreneur' AND ep1.company_name IS NOT NULL AND ep1.company_name != ''
              THEN ep1.company_name
              ELSE u1.first_name || ' ' || u1.last_name
            END AS reviewer_display_name,
            u2.first_name AS reviewed_first_name,
            u2.last_name AS reviewed_last_name,
            CASE WHEN u2.role = 'entrepreneur' AND ep2.company_name IS NOT NULL AND ep2.company_name != ''
              THEN ep2.company_name
              ELSE u2.first_name || ' ' || u2.last_name
            END AS reviewed_display_name,
            COALESCE(
              json_agg(
                json_build_object('id', i.id, 'image_url', i.image_url, 'image_type', COALESCE(i.image_type, 'general'), 'created_at', i.created_at)
                ORDER BY i.created_at
              ) FILTER (WHERE i.id IS NOT NULL),
              '[]'
            ) as images
     FROM reviews r
     LEFT JOIN users u1 ON u1.id = r.reviewer_id
     LEFT JOIN entrepreneur_profiles ep1 ON u1.id = ep1.user_id AND u1.role = 'entrepreneur'
     LEFT JOIN users u2 ON u2.id = r.reviewed_user_id
     LEFT JOIN entrepreneur_profiles ep2 ON u2.id = ep2.user_id AND u2.role = 'entrepreneur'
     LEFT JOIN images i ON i.review_id = r.id
     WHERE r.job_id = $1
     GROUP BY r.id, u1.first_name, u1.last_name, u1.role, ep1.company_name, u2.first_name, u2.last_name, u2.role, ep2.company_name`,
    [job_id]
  );

  return result.rows; // could be 0 or 1 depending on constraints
};
