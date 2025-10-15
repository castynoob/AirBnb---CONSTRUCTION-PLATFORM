import pool from "../config/db.js";

export const createUser = async (userData) => {
  const { email, password, first_name, last_name, role } = userData;
  const [result] = await pool.query(
    `INSERT INTO users (id, email, password, first_name, last_name, role, created_at, updated_at)
     VALUES (UUID(), ?, ?, ?, ?, ?, NOW(), NOW())`,
    [email, password, first_name, last_name, role]
  );
  return result;
};

export const findUserByEmail = async (email) => {
  const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
  return rows[0];
};
