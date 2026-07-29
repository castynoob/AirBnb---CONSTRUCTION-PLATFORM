// =============================================================================
// Referral routes — mounted at /api/referrals in server.js. Admin settings
// live at /api/admin/referral-settings (mounted separately below).
// =============================================================================

import express from "express";
import {
  getMyReferralInfo,
  getMyPendingDiscount,
  getPublicSettings,
  validateCode,
  getAdminSettings,
  updateAdminSettings,
  listAllReferrals,
} from "../controllers/referralController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authenticateAdmin } from "../middleware/adminAuth.js";

const router = express.Router();

// Public — the signup form calls these before the user is authenticated.
router.get("/settings", getPublicSettings);
router.get("/validate", validateCode);
// POST accepts email/phone in the body so the anti-abuse pre-flight can
// warn the user before they submit the signup form.
router.post("/validate", validateCode);

// Authenticated user — get their own code + stats.
router.get("/my-info", authenticateToken, getMyReferralInfo);

// Authenticated user — pending discount preview for the checkout screen.
router.get("/my-pending-discount", authenticateToken, getMyPendingDiscount);

export default router;

// Separate router for admin so the admin JWT middleware guards it in
// isolation. Mounted at /api/admin/referral-settings.
export const adminRouter = express.Router();
adminRouter.get("/",      authenticateAdmin, getAdminSettings);
adminRouter.put("/",      authenticateAdmin, updateAdminSettings);
adminRouter.get("/list",  authenticateAdmin, listAllReferrals);
