import pool from "../config/db.js";
import crypto from "crypto";

export const createRefreshToken = async (userId) => {
  const token = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) 
     VALUES ($1, $2, $3)`,
    [userId, token, expiresAt]
  );
  
  return token;
};

export const findRefreshToken = async (token) => {
  const result = await pool.query(
    `SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()`,
    [token]
  );
  return result.rows[0];
};

export const deleteRefreshToken = async (token) => {
  await pool.query(`DELETE FROM refresh_tokens WHERE token = $1`, [token]);
};