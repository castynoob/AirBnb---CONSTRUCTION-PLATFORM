import pool from "../config/db.js";

export const getProfile = async (req, res) => {
  try {
    const user = await pool.query(
      "SELECT id, email, first_name, last_name, role FROM users WHERE id = $1",
      [req.user.id]
    );
    res.json(user.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
