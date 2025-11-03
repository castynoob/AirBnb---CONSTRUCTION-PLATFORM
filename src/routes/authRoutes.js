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

// Registration with rate limiting
router.post("/register", registrationRateLimiter, validateRegistration, register);

// Login with combined rate limiting (IP + email)
router.post("/login", loginRateLimiter, loginEmailRateLimiter, validateLogin, login);

// Google login with rate limiting
router.post("/google-login", loginRateLimiter, googleLogin);

// Email verification
router.post("/verify-email", verifyEmail);
router.get("/verify-email", verifyEmailFromLink); // GET endpoint for email links with redirect

// Resend verification email with rate limiting
router.post("/resend-verification", verificationEmailRateLimiter, resendVerificationEmail);

// Refresh token
router.post("/refresh-token", refreshAccessToken);

// Logout
router.post("/logout", logout);

// Password reset with rate limiting
router.post("/request-password-reset", passwordResetRateLimiter, requestPasswordReset);
router.post("/reset-password", passwordResetRateLimiter, resetPassword);

// Profile endpoints (require authentication)
router.get("/me", authenticateToken, getCurrentUser);

// Update profile - invalidate user caches
router.put(
  "/me",
  authenticateToken,
  invalidateCache((req) => [USER_KEYS.allForUser(req.user.id || req.user.userId)]),
  updateCurrentUser
);

export default router;