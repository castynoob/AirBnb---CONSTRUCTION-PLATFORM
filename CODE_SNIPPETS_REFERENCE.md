# Code Snippets Quick Reference

## Database Schema - Users Table

```sql
CREATE TABLE "public"."users" (
    "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    "email" character varying(255) NOT NULL UNIQUE,
    "password" text,
    "role" character varying(50),
    "first_name" character varying(100),
    "middle_name" character varying(100),
    "last_name" character varying(100),
    "phone" character varying(30),
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    "email_verified" boolean DEFAULT false,
    "verification_token" text,
    "verification_token_expires" timestamp,
    "reset_token" text,
    "reset_token_expires" timestamp,
    "stripe_customer_id" character varying(255),
    "provider" character varying(10) DEFAULT 'local',
    "provider_id" character varying(255)
);
```

---

## Backend - Register with Email Verification

```javascript
// src/controllers/authController.js (lines 13-47)

export const register = async (req, res) => {
  try {
    const { email, password, first_name, last_name, role } = req.body;

    // Check if email already exists
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    // Hash password
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
      message: "User registered successfully. Please check your email to verify your account." 
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
```

---

## Backend - Verify Email (Link Click)

```javascript
// src/controllers/authController.js (lines 136-168)

export const verifyEmailFromLink = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
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
      return res.redirect(`${process.env.FRONTEND_URL}/?verification=failed&reason=invalid_token`);
    }

    // Success - redirect to landing page
    res.redirect(`${process.env.FRONTEND_URL}/?verification=success`);
  } catch (err) {
    console.error("Email verification error:", err);
    res.redirect(`${process.env.FRONTEND_URL}/?verification=failed&reason=server_error`);
  }
};
```

---

## Backend - Request Password Reset

```javascript
// src/controllers/authController.js (lines 281-319)

export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await findUserByEmail(email);

    // Security: Don't reveal if email exists
    if (!user) {
      return res.json({ 
        message: "If your email is registered, you will receive a password reset link" 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    // Store reset token in database
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
    console.error("Password reset request error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
```

---

## Backend - Reset Password

```javascript
// src/controllers/authController.js (lines 384-432)

export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Validate input
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
    console.error("Password reset error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
```

---

## Backend - Email Configuration with SendGrid

```javascript
// src/config/emailConfig.js

import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";

dotenv.config();

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export const sendVerificationEmail = async (email, token) => {
  const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  const verificationUrl = `${backendUrl}/api/auth/verify-email?token=${token}`;

  const msg = {
    to: email,
    from: process.env.EMAIL_FROM,
    subject: "Verify Your Email - Construction Platform",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3B82F6;">Email Verification</h1>
        <p>Click the button below to verify your email:</p>
        <a href="${verificationUrl}"
           style="display: inline-block; padding: 12px 24px; background-color: #3B82F6;
                  color: white; text-decoration: none; border-radius: 5px;">
          Verify Email
        </a>
        <p>Link: ${verificationUrl}</p>
        <p style="color: #999; font-size: 12px;">This link expires in 24 hours.</p>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`Verification email sent to ${email}`);
  } catch (error) {
    console.error("SendGrid error:", error.response?.body || error);
    throw error;
  }
};

export const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  const msg = {
    to: email,
    from: process.env.EMAIL_FROM,
    subject: "Password Reset - Construction Platform",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3B82F6;">Password Reset</h1>
        <p>Click the button below to reset your password:</p>
        <a href="${resetUrl}"
           style="display: inline-block; padding: 12px 24px; background-color: #3B82F6;
                  color: white; text-decoration: none; border-radius: 5px;">
          Reset Password
        </a>
        <p>Link: ${resetUrl}</p>
        <p style="color: #999; font-size: 12px;">This link expires in 1 hour.</p>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`Password reset email sent to ${email}`);
  } catch (error) {
    console.error("SendGrid error:", error.response?.body || error);
    throw error;
  }
};
```

---

## Frontend - Login Form Handling

```javascript
// src/pages/landingpage/LandingPage.jsx (lines 65-153)

const handleLoginSubmit = async (e) => {
  e.preventDefault();

  if (!validateLoginForm()) {
    return;
  }

  setIsLoggingIn(true);
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: loginFormData.email,
        password: loginFormData.password,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();

    // Save tokens and user data
    localStorage.setItem("token", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    localStorage.setItem("userId", data.user.id);
    localStorage.setItem("userProfile", JSON.stringify({
      id: data.user.id,
      name: `${data.user.first_name || ""} ${data.user.last_name || ""}`.trim(),
      email: data.user.email,
      role: data.user.role,
      token: data.accessToken,
    }));

    // Navigate to homepage
    navigate(`/homepage/${data.user.role}`);
  } catch (error) {
    console.error("Login error:", error);
    setLoginErrors({ 
      submit: "Login failed. Please check your credentials and try again." 
    });
  } finally {
    setIsLoggingIn(false);
  }
};
```

---

## Frontend - Token Refresh Helper

```javascript
// src/utils/api.js (lines 23-63)

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');

  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/refresh-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    // Logout user
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('userProfile');
    window.location.href = '/';
    throw new Error('Session expired - Please login again');
  }

  const data = await response.json();
  const newAccessToken = data.accessToken;

  // Update token in localStorage
  localStorage.setItem('token', newAccessToken);

  // Update token in userProfile
  const userProfile = localStorage.getItem('userProfile');
  if (userProfile) {
    const user = JSON.parse(userProfile);
    user.token = newAccessToken;
    localStorage.setItem('userProfile', JSON.stringify(user));
  }

  return newAccessToken;
}
```

---

## Frontend - Authenticated API Request with Auto-Refresh

```javascript
// src/utils/api.js (lines 68-146)

async function apiRequest(endpoint, options = {}) {
  const userProfile = localStorage.getItem('userProfile');

  if(!userProfile) {
    throw new Error(`Error userProfile does not exist`);
  }

  const user = JSON.parse(userProfile);
  let token = user.token;

  if (!token) {
    throw new Error('No token provided');
  }

  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  // Handle 401 Unauthorized - Try to refresh token
  if (response.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;

      try {
        const newToken = await refreshAccessToken();
        isRefreshing = false;
        onTokenRefreshed(newToken);

        // Retry original request with new token
        config.headers['Authorization'] = `Bearer ${newToken}`;
        const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, config);

        if (!retryResponse.ok) {
          const data = await retryResponse.json();
          throw new Error(data.message || 'Request failed');
        }

        return retryResponse.json();

      } catch (error) {
        isRefreshing = false;
        refreshSubscribers = [];
        throw error;
      }
    }
  }

  // Handle other errors
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Request failed');
  }

  return response.json();
}
```

---

## Backend - Refresh Token Model

```javascript
// src/models/refreshTokenModel.js

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
```

---

## Backend - Auth Routes Configuration

```javascript
// src/routes/authRoutes.js

import express from "express";
import {
  register,
  login,
  verifyEmail,
  verifyEmailFromLink,
  resendVerificationEmail,
  refreshAccessToken,
  logout,
  requestPasswordReset,
  resetPassword,
  getCurrentUser,
  updateCurrentUser,
  googleLogin
} from "../controllers/authController.js";
import { validateRegistration, validateLogin } from "../middleware/validationMiddleware.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { invalidateCache } from "../middleware/cacheMiddleware.js";
import { USER_KEYS } from "../utils/cacheKeys.js";
import {
  loginRateLimiter,
  loginEmailRateLimiter,
  registrationRateLimiter,
  passwordResetRateLimiter,
  verificationEmailRateLimiter
} from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

// Authentication endpoints
router.post("/register", registrationRateLimiter, validateRegistration, register);
router.post("/login", loginRateLimiter, loginEmailRateLimiter, validateLogin, login);
router.post("/google-login", loginRateLimiter, googleLogin);

// Email verification
router.post("/verify-email", verifyEmail);
router.get("/verify-email", verifyEmailFromLink);
router.post("/resend-verification", verificationEmailRateLimiter, resendVerificationEmail);

// Token management
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", logout);

// Password reset
router.post("/request-password-reset", passwordResetRateLimiter, requestPasswordReset);
router.post("/reset-password", passwordResetRateLimiter, resetPassword);

// User profile (requires authentication)
router.get("/me", authenticateToken, getCurrentUser);
router.put("/me", authenticateToken, invalidateCache((req) => [USER_KEYS.allForUser(req.user.id)]), updateCurrentUser);

export default router;
```

---

## Environment Variables (.env)

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/construction_db

# JWT Authentication
JWT_SECRET=your-very-secure-secret-key-here

# SendGrid Email Service
SENDGRID_API_KEY=your-sendgrid-api-key-here
EMAIL_FROM=noreply@intervos.com

# Server URLs
PORT=5000
BACKEND_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173

# Google OAuth
VITE_GOOGLE_CLIENT_ID=your-google-client-id-here.apps.googleusercontent.com

# Stripe
STRIPE_SECRET_KEY=sk_test_...
VITE_STRIPE_PUBLIC_KEY=pk_test_...

# Redis (for sessions/caching)
REDIS_URL=redis://localhost:6379
```

