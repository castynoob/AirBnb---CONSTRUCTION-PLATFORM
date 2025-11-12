// DEBUG ROUTE - Remove in production
import express from "express";
import pool from "../config/db.js";
import bcrypt from "bcryptjs";

const router = express.Router();

// Check if user exists and verify password
router.post("/debug/check-supplier-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Get user from database
    const result = await pool.query(
      `SELECT id, email, password, role, first_name, last_name,
              email_verified, provider, created_at
       FROM users
       WHERE email = $1 AND role = 'supplier'`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.json({
        found: false,
        message: "No supplier user found with this email",
        hint: "Check if user registered or if email is correct"
      });
    }

    const user = result.rows[0];

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password);

    return res.json({
      found: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        provider: user.provider,
        created_at: user.created_at
      },
      passwordMatch: passwordMatch,
      emailVerified: user.email_verified,
      issues: [
        !passwordMatch && "❌ Password does not match",
        !user.email_verified && "❌ Email not verified - check inbox for verification email",
        user.password === null && "❌ Password is NULL in database (shouldn't happen)"
      ].filter(Boolean)
    });

  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
