import pool from "../config/db.js";

export const findUserByEmail = async (email) => {
  const result = await pool.query(
    "SELECT id, email, password, role, first_name, last_name FROM users WHERE email = $1",
    [email]
  );
  return result.rows[0];
};

export const createUser = async ({ email, password, first_name, last_name, role }) => {
  await pool.query(
    `INSERT INTO users (email, password, first_name, last_name, role)
     VALUES ($1, $2, $3, $4, $5)`,
    [email, password, first_name, last_name, role]
  );
};
