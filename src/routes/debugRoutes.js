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

// Reset password for any user (DEBUG ONLY - Remove in production!)
router.post("/debug/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({
        error: "Email and newPassword are required"
      });
    }

    // Check if user exists
    const userResult = await pool.query(
      `SELECT id, email, role, first_name, last_name FROM users WHERE email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: "User not found with this email"
      });
    }

    const user = userResult.rows[0];

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password in database
    await pool.query(
      `UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2`,
      [hashedPassword, user.id]
    );

    console.log(`🔐 Password reset for user: ${email} (${user.role})`);

    return res.json({
      success: true,
      message: "Password reset successfully",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: `${user.first_name} ${user.last_name}`
      }
    });

  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
