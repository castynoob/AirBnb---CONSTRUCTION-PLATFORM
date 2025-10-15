import pool from "../config/db.js";

export const query = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result.rows;
  } catch (err) {
    console.error("DB Error:", err);
    throw err;
  }
};

