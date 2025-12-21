// src/models/bidModel.js
import pool from "../config/db.js";

// 🟢 Create a new bid
export const createBid = async ({ job_id, entrepreneur_id, amount, message }) => {
  const result = await pool.query(
    `INSERT INTO bids (job_id, entrepreneur_id, amount, message, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [job_id, entrepreneur_id, amount, message]
  );
  return result.rows[0];
};

// 🟡 Get all bids for a specific job (with entrepreneur info)
export const getBidsByJobId = async (job_id) => {
  const result = await pool.query(
    `SELECT
      b.id, b.job_id, b.entrepreneur_id, b.amount, b.message, b.status,
      b.created_at, b.updated_at,
      ep.company_name, ep.license_number, ep.years_in_business,
      ep.average_rating, ep.total_reviews, ep.specializations,
      ep.user_id as entrepreneur_user_id,
      u.id as user_id, u.first_name, u.last_name, u.email
     FROM bids b
     JOIN entrepreneur_profiles ep ON b.entrepreneur_id = ep.id
     JOIN users u ON ep.user_id = u.id
     WHERE b.job_id = $1
     ORDER BY b.created_at DESC`,
    [job_id]
  );
  return result.rows;
};

// 🔵 Get all bids by entrepreneur (with job info)
export const getBidsByEntrepreneurId = async (entrepreneur_id) => {
  const result = await pool.query(
    `SELECT 
      b.id, b.job_id, b.entrepreneur_id, b.amount, b.message, b.status,
      b.created_at, b.updated_at,
      j.title as job_title, j.description as job_description, 
      j.category, j.urgency, j.due_date,
      p.address as property_address, p.city
     FROM bids b
     JOIN jobs j ON b.job_id = j.id
     LEFT JOIN properties p ON j.property_id = p.id
     WHERE b.entrepreneur_id = $1
     ORDER BY b.created_at DESC`,
    [entrepreneur_id]
  );
  return result.rows;
};

// 🟣 Update bid status (approve/decline)
export const updateBidStatus = async (bid_id, status) => {
  const result = await pool.query(
    `UPDATE bids 
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [status, bid_id]
  );
  return result.rows[0];
};

// 🔴 Get single bid by ID
export const getBidById = async (bid_id) => {
  const result = await pool.query(
    `SELECT * FROM bids WHERE id = $1`,
    [bid_id]
  );
  return result.rows[0];
};

// ⭐ Check if bid is favorited
export const isFavorited = async (manager_id, bid_id) => {
  const bid = await getBidById(bid_id);
  if (!bid) return false;
  
  const result = await pool.query(
    `SELECT * FROM favorites 
     WHERE manager_id = $1 
     AND entrepreneur_id = $2 
     AND job_id = $3`,
    [manager_id, bid.entrepreneur_id, bid.job_id]
  );
  return result.rows.length > 0;
};

// ⭐ Add to favorites
export const addToFavorites = async (manager_id, entrepreneur_id, job_id) => {
  const result = await pool.query(
    `INSERT INTO favorites (manager_id, entrepreneur_id, job_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [manager_id, entrepreneur_id, job_id]
  );
  return result.rows[0];
};

// ⭐ Remove from favorites
export const removeFromFavorites = async (manager_id, entrepreneur_id, job_id) => {
  await pool.query(
    `DELETE FROM favorites
     WHERE manager_id = $1
     AND entrepreneur_id = $2
     AND job_id = $3`,
    [manager_id, entrepreneur_id, job_id]
  );
};

// 🔴 Decline all other pending bids for a job (when one is approved)
export const declineOtherBids = async (job_id, approved_bid_id) => {
  const result = await pool.query(
    `UPDATE bids
     SET status = 'declined', updated_at = NOW()
     WHERE job_id = $1
     AND id != $2
     AND status = 'pending'
     RETURNING *`,
    [job_id, approved_bid_id]
  );
  return result.rows;
};