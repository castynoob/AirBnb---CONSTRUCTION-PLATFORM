import pool from "../config/db.js";

export const findUserByEmail = async (email) => {
  const result = await pool.query(
    `SELECT id, email, password, role, first_name, middle_name, last_name,
            phone, email_verified, created_at, updated_at
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
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


export const getAllUsers = async () => {
  const result = await pool.query("SELECT email, name FROM users");
  return result.rows;
};

export const getAllEntrepreneurEmails = async () => {
  const query = `
    SELECT u.email, u.first_name, u.last_name
    FROM entrepreneur_profiles ep
    JOIN users u ON ep.user_id = u.id
    WHERE u.email IS NOT NULL
  `;
  const result = await pool.query(query);
  return result.rows;
};