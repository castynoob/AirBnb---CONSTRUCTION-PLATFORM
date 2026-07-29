// =============================================================================
// Job invite routes — mounted at /api/invites in server.js.
// =============================================================================

import express from "express";
import {
  createInvite,
  listMyInvites,
  listInvitesForJob,
  respondToInvite,
} from "../controllers/jobInviteController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// PM sends an invite (usually from the specialist directory).
router.post(
  "/",
  authenticateToken,
  authorizeRoles("property_manager"),
  createInvite
);

// Contractor's inbox — invites addressed to them.
router.get(
  "/mine",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  listMyInvites
);

// PM's view — everyone they've invited to a specific job.
router.get(
  "/job/:jobId",
  authenticateToken,
  authorizeRoles("property_manager"),
  listInvitesForJob
);

// Contractor explicit accept/decline (bidding auto-accepts elsewhere).
router.patch(
  "/:id/respond",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  respondToInvite
);

export default router;
