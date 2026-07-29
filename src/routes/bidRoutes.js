// src/routes/bidRoutes.js
import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { requireEntrepreneur } from "../middleware/roleMiddleware.js";
import { requireSubscription, checkBidLimit } from "../middleware/subscriptionMiddleware.js";
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware.js";
import { BID_KEYS, JOB_KEYS, TTL } from "../utils/cacheKeys.js";
import {
  submitBid,
  getBidsForJob,
  getMyBids,
  getManagerSubmissions,
  approveBid,
  declineBid,
  cancelBidApproval,
  toggleFavorite,
  updateBid,
  deleteBid
} from "../controllers/bidController.js";
import {
  listAddenda,
  proposeAddendum,
  acceptAddendum,
  rejectAddendum,
  withdrawAddendum,
} from "../controllers/bidAddendaController.js";

const router = express.Router();

// -----------------------------------------------------------------------------
// Bid addenda — post-submission price adjustments (Q&A → price change flow).
// Auth is per-endpoint inside the controller (must be either the contractor
// who submitted the bid or the PM who owns the job).
// -----------------------------------------------------------------------------
router.get("/:bidId/addenda",                verifyToken, listAddenda);
router.post("/:bidId/addenda",               verifyToken, proposeAddendum);
router.patch("/:bidId/addenda/:id/accept",   verifyToken, acceptAddendum);
router.patch("/:bidId/addenda/:id/reject",   verifyToken, rejectAddendum);
router.patch("/:bidId/addenda/:id/withdraw", verifyToken, withdrawAddendum);

// Entrepreneur endpointss
// Submit bid - Invalidate bid caches
router.post(
  "/",
  verifyToken,
  authorizeRoles("entrepreneur"),
  requireEntrepreneur,
  requireSubscription,
  checkBidLimit,
  invalidateCache((req) => {
    // Will invalidate after bid is created in controller
    return [BID_KEYS.allBids()];
  }),
  submitBid
);

// Get my bids - CACHED (5 minutes)
router.get(
  "/mine",
  verifyToken,
  authorizeRoles("entrepreneur"),
  cacheMiddleware((req) => {
    // Get entrepreneur ID from request (will be available after auth)
    const entrepreneurId = req.user.entrepreneurId || req.user.entrepreneur_id;
    return BID_KEYS.byEntrepreneur(entrepreneurId);
  }, TTL.FIVE_MINUTES),
  getMyBids
);

// Update bid - Entrepreneur only (pending bids only)
router.patch(
  "/:id",
  verifyToken,
  authorizeRoles("entrepreneur"),
  invalidateCache(() => [BID_KEYS.allBids()]),
  updateBid
);

// Delete bid - Entrepreneur only (pending bids only)
router.delete(
  "/:id",
  verifyToken,
  authorizeRoles("entrepreneur"),
  invalidateCache(() => [BID_KEYS.allBids()]),
  deleteBid
);

// Manager endpoints
// 🚀 Optimized: Get ALL submissions in one query with cursor pagination
router.get(
  "/manager/submissions",
  verifyToken,
  authorizeRoles("property_manager"),
  cacheMiddleware((req) => `manager_submissions:${req.user.id}:${req.query.status || 'all'}:${req.query.cursor || 'first'}`, TTL.FIVE_MINUTES),
  getManagerSubmissions
);

// Get bids for job - CACHED (5 minutes)
router.get(
  "/job/:job_id",
  verifyToken,
  authorizeRoles("property_manager"),
  cacheMiddleware((req) => BID_KEYS.byJob(req.params.job_id), TTL.FIVE_MINUTES),
  getBidsForJob
);

// Approve bid - Invalidate bid + submission caches
router.patch(
  "/:id/approve",
  verifyToken,
  authorizeRoles("property_manager"),
  invalidateCache(() => [BID_KEYS.allBids(), 'manager_submissions:*', JOB_KEYS.allJobs()]),
  approveBid
);

// Decline bid - Invalidate bid + submission caches
router.patch(
  "/:id/decline",
  verifyToken,
  authorizeRoles("property_manager"),
  invalidateCache(() => [BID_KEYS.allBids(), 'manager_submissions:*']),
  declineBid
);

// Cancel bid approval - Manager only
router.patch(
  "/:id/cancel-approval",
  verifyToken,
  authorizeRoles("property_manager"),
  invalidateCache(() => [BID_KEYS.allBids(), 'manager_submissions:*', JOB_KEYS.allJobs()]),
  cancelBidApproval
);

// Toggle favorite - Invalidate bid caches
router.patch(
  "/:id/favorite",
  verifyToken,
  authorizeRoles("property_manager"),
  invalidateCache(() => [BID_KEYS.allBids()]),
  toggleFavorite
);

export default router;