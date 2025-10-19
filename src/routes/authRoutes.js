import express from "express";
import {
  register,
  login,
  verifyEmail,
  resendVerificationEmail,
  refreshAccessToken,
  logout,
  requestPasswordReset,
  resetPassword,
  getCurrentUser,
  updateCurrentUser 
} from "../controllers/authController.js";
import { validateRegistration, validateLogin } from "../middleware/validationMiddleware.js";
import { authenticateToken } from "../middleware/authMiddleware.js";  // ← ADD THIS LINE!

const router = express.Router();

router.post("/register", validateRegistration, register);
router.post("/login", validateLogin, login);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerificationEmail);
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", logout);
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password", resetPassword);

// Profile endpoints (require authentication)
router.get("/me", authenticateToken, getCurrentUser);
router.put("/me", authenticateToken, updateCurrentUser);

export default router;