// =============================================================================
// Resident Repair Routes
// =============================================================================
//
// Two audiences share this router:
//   - Residents can submit / list / withdraw / view their own requests.
//   - Property managers can list pending, approve, or reject requests on
//     properties they own.
//
// Role authorization is enforced inside each controller (some endpoints are
// role-agnostic — e.g. `getRepair` is fine for either party to hit as long as
// they own or manage the request).
// =============================================================================

import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { uploadMultipleImages, handleUploadError } from "../middleware/uploadMiddleware.js";
import {
  submitRepair,
  listMyRepairs,
  withdrawRepair,
  getRepair,
  listPendingForPM,
  approveRepair,
  rejectRepair,
} from "../controllers/residentRepairController.js";

const router = express.Router();

// -----------------------------------------------------------------------------
// Resident endpoints
// -----------------------------------------------------------------------------
// Accepts either JSON (no images) or multipart/form-data with an `images`
// field (up to 10 JPG / PNG / WEBP, 5MB each). Multer only kicks in on
// multipart requests, so JSON submits still work as before.
router.post(
  "/",
  authenticateToken,
  authorizeRoles("resident"),
  uploadMultipleImages,
  handleUploadError,
  submitRepair
);
router.get("/mine", authenticateToken, authorizeRoles("resident"), listMyRepairs);
router.patch("/:id/withdraw", authenticateToken, authorizeRoles("resident"), withdrawRepair);

// -----------------------------------------------------------------------------
// PM endpoints — must precede the /:id catch-all so /pending isn't shadowed.
// -----------------------------------------------------------------------------
router.get("/pending", authenticateToken, authorizeRoles("property_manager"), listPendingForPM);
router.patch("/:id/approve", authenticateToken, authorizeRoles("property_manager"), approveRepair);
router.patch("/:id/reject", authenticateToken, authorizeRoles("property_manager"), rejectRepair);

// -----------------------------------------------------------------------------
// Shared — either party (auth check is inside the controller).
// -----------------------------------------------------------------------------
router.get("/:id", authenticateToken, getRepair);

export default router;
