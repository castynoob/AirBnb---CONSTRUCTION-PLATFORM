import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "crypto";
import pool from "../config/db.js";
import { createUser, findUserByEmail } from "../models/userModel.js";
import { createRefreshToken, findRefreshToken, deleteRefreshToken } from "../models/refreshTokenModel.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../config/emailConfig.js";

dotenv.config();

// ✅ UPDATED: Registration with Email Verification
export const register = async (req, res) => {
  try {
    const { email, password, first_name, last_name, role } = req.body;

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        message: "This email is already registered. Please use a different email or try logging in.",
        field: "email"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user with verification token
    await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, role, verification_token, verification_token_expires)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [email, hashedPassword, first_name, last_name, role, verificationToken, tokenExpires]
    );

    // Send verification email
    await sendVerificationEmail(email, verificationToken);

    res.status(201).json({
      message: "Registration successful! Please check your email to verify your account.",
      email: email
    });
  } catch (err) {
    console.error("❌ Register error:", err);
    res.status(500).json({
      message: "We're experiencing technical difficulties. Please try again later."
    });
  }
};

// ✅ UPDATED: Login with Refresh Token
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await findUserByEmail(email);

    // Generic error message for security (don't reveal if email exists)
    const invalidMessage = "Invalid email or password";

    if (!user) {
      return res.status(401).json({ message: invalidMessage });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: invalidMessage });
    }

    // Check if email is verified (after password check for security)
    if (!user.email_verified) {
      return res.status(403).json({
        message: "Please verify your email before logging in. Check your inbox for the verification link."
      });
    }

    // Create short-lived access token (15 minutes)
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    // Create long-lived refresh token (7 days)
    const refreshToken = await createRefreshToken(user.id);

    res.json({
      message: "Login successful",
      accessToken,
      refreshToken,
      user: { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🆕 NEW: Verify Email (POST - for API calls)
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Verification token required" });
    }

    const result = await pool.query(
      `UPDATE users
       SET email_verified = TRUE,
           verification_token = NULL,
           verification_token_expires = NULL
       WHERE verification_token = $1
         AND verification_token_expires > NOW()
       RETURNING id, email, first_name, last_name`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        message: "Invalid or expired verification token"
      });
    }

    res.json({
      message: "Email verified successfully. You can now log in.",
      user: result.rows[0]
    });
  } catch (err) {
    console.error("❌ Email verification error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🆕 NEW: Verify Email via Link (GET - for email links with redirect)
export const verifyEmailFromLink = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      // Redirect to frontend with error
      return res.redirect(`${process.env.FRONTEND_URL}/?verification=failed&reason=missing_token`);
    }

    const result = await pool.query(
      `UPDATE users
       SET email_verified = TRUE,
           verification_token = NULL,
           verification_token_expires = NULL
       WHERE verification_token = $1
         AND verification_token_expires > NOW()
       RETURNING id, email, first_name, last_name`,
      [token]
    );

    if (result.rows.length === 0) {
      // Redirect to frontend with error (expired or invalid token)
      return res.redirect(`${process.env.FRONTEND_URL}/?verification=failed&reason=invalid_token`);
    }

    // Success - redirect to landing page with success message
    res.redirect(`${process.env.FRONTEND_URL}/?verification=success`);
  } catch (err) {
    console.error("❌ Email verification error:", err);
    // Redirect to frontend with error
    res.redirect(`${process.env.FRONTEND_URL}/?verification=failed&reason=server_error`);
  }
};

// 🆕 NEW: Resend Verification Email
export const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await findUserByEmail(email);

    if (!user) {
      // Don't reveal if email exists or not
      return res.json({ 
        message: "If your email is registered, you will receive a verification link" 
      });
    }

    if (user.email_verified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      `UPDATE users 
       SET verification_token = $1, verification_token_expires = $2 
       WHERE id = $3`,
      [verificationToken, tokenExpires, user.id]
    );

    await sendVerificationEmail(email, verificationToken);

    res.json({ 
      message: "If your email is registered, you will receive a verification link" 
    });
  } catch (err) {
    console.error("❌ Resend verification error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🆕 NEW: Refresh Access Token
export const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token required" });
    }

    // Verify refresh token exists and is valid
    const tokenData = await findRefreshToken(refreshToken);
    if (!tokenData) {
      return res.status(403).json({ 
        message: "Invalid or expired refresh token" 
      });
    }

    // Get user data
    const user = await pool.query(
      "SELECT id, email, role, first_name, last_name FROM users WHERE id = $1",
      [tokenData.user_id]
    );

    if (!user.rows[0]) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate new access token
    const accessToken = jwt.sign(
      { 
        id: user.rows[0].id, 
        email: user.rows[0].email, 
        role: user.rows[0].role 
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.json({ 
      accessToken,
      user: user.rows[0]
    });
  } catch (err) {
    console.error("❌ Refresh token error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🆕 NEW: Logout (Invalidate Refresh Token)
export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    await deleteRefreshToken(refreshToken);
    
    res.json({ message: "Logout successful" });
  } catch (err) {
    console.error("❌ Logout error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🆕 NEW: Request Password Reset
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await findUserByEmail(email);

    if (!user) {
      // Security: Don't reveal if email exists
      return res.json({ 
        message: "If your email is registered, you will receive a password reset link" 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    await pool.query(
      `UPDATE users 
       SET reset_token = $1, reset_token_expires = $2 
       WHERE id = $3`,
      [resetToken, tokenExpires, user.id]
    );

    // Send reset email
    await sendPasswordResetEmail(email, resetToken);

    res.json({ 
      message: "If your email is registered, you will receive a password reset link" 
    });
  } catch (err) {
    console.error("❌ Password reset request error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// 👤 GET /api/auth/me - Get current user profile
export const getCurrentUser = async (req, res) => {
  try {
    // req.user.id comes from authMiddleware (it checks the token)
    // We use it to find the user in the database
    
    const result = await pool.query(
      `SELECT id, email, role, first_name, middle_name, last_name, phone, 
              email_verified, created_at 
       FROM users 
       WHERE id = $1`,
      [req.user.id]  // This is the logged-in user's ID
    );

    // If user not found (shouldn't happen, but just in case)
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Send back the user data
    res.json({ 
      user: result.rows[0] 
    });
    
  } catch (err) {
    console.error("❌ Get user error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✏️ PUT /api/auth/me - Update current user profile
export const updateCurrentUser = async (req, res) => {
  try {
    // Get the data from the request body
    const { first_name, middle_name, last_name, phone } = req.body;
    
    // Update the database
    const result = await pool.query(
      `UPDATE users 
       SET first_name = $1, 
           middle_name = $2, 
           last_name = $3, 
           phone = $4, 
           updated_at = NOW()
       WHERE id = $5 
       RETURNING id, email, role, first_name, middle_name, last_name, phone`,
      [first_name, middle_name, last_name, phone, req.user.id]
    );

    // Send back the updated user data
    res.json({ 
      message: "Profile updated successfully",
      user: result.rows[0] 
    });
    
  } catch (err) {
    console.error("❌ Update user error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🆕 NEW: Reset Password
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ 
        message: "Token and new password are required" 
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ 
        message: "Password must be at least 8 characters long" 
      });
    }

    // Find user with valid reset token
    const user = await pool.query(
      `SELECT id FROM users 
       WHERE reset_token = $1 
         AND reset_token_expires > NOW()`,
      [token]
    );

    if (user.rows.length === 0) {
      return res.status(400).json({ 
        message: "Invalid or expired reset token" 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    await pool.query(
      `UPDATE users 
       SET password = $1, 
           reset_token = NULL, 
           reset_token_expires = NULL 
       WHERE id = $2`,
      [hashedPassword, user.rows[0].id]
    );

    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    console.error("❌ Password reset error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🆕 NEW: Change Password (Authenticated users)
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user.id; // From authenticateToken middleware

    // Validate inputs
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: "All fields are required"
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "New passwords do not match"
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long"
      });
    }

    // Password strength validation
    const hasUpperCase = /[A-Z]/.test(newPassword);
    const hasLowerCase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);

    if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
      return res.status(400).json({
        message: "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
      });
    }

    // Get current user with password
    const userResult = await pool.query(
      `SELECT id, password, provider FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userResult.rows[0];

    // Check if user registered via Google (no password)
    if (user.provider === 'google' && !user.password) {
      return res.status(400).json({
        message: "Cannot change password for accounts registered via Google. Please use Google to sign in."
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Current password is incorrect"
      });
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        message: "New password must be different from current password"
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await pool.query(
      `UPDATE users
       SET password = $1, updated_at = NOW()
       WHERE id = $2`,
      [hashedPassword, userId]
    );

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("❌ Change password error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🆕 NEW: Google Login
export const googleLogin = async (req, res) => {
    try {
        const { email } = req.body;
        
        // 1. Find user by email
        const user = await findUserByEmail(email);

        if (!user) {
            // User not registered (FE will prompt registration)
            return res.status(404).json({ 
                message: "User not found. Please register." 
            });
        }
        
        // Check if email is verified (standard login check)
        if (!user.email_verified) {
            return res.status(403).json({ 
                message: "Please verify your email before logging in" 
            });
        }
        
        // 2. Create short-lived access token (15 minutes)
        const accessToken = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "15m" }
        );

        // 3. Create long-lived refresh token (7 days)
        const refreshToken = await createRefreshToken(user.id);

        res.json({
            message: "Google login successful",
            accessToken,
            refreshToken,
            user: { 
                id: user.id, 
                email: user.email, 
                role: user.role,
                first_name: user.first_name,
                last_name: user.last_name
            },
        });

    } catch (err) {
        console.error("❌ Google Login error:", err);
        res.status(500).json({ message: "Server error" });
    }
};
