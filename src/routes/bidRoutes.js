// src/routes/bidRoutes.js
import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { requireEntrepreneur } from "../middleware/roleMiddleware.js";
import { requireSubscription, checkBidLimit } from "../middleware/subscriptionMiddleware.js";
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware.js";
import { BID_KEYS, TTL } from "../utils/cacheKeys.js";
import {
  submitBid,
  getBidsForJob,
  getMyBids,
  approveBid,
  declineBid,
  toggleFavorite
} from "../controllers/bidController.js";

const router = express.Router();

// Entrepreneur endpoints
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

// Manager endpoints
// Get bids for job - CACHED (5 minutes)
router.get(
  "/job/:job_id",
  verifyToken,
  authorizeRoles("property_manager"),
  cacheMiddleware((req) => BID_KEYS.byJob(req.params.job_id), TTL.FIVE_MINUTES),
  getBidsForJob
);

// Approve bid - Invalidate bid caches
router.patch(
  "/:id/approve",
  verifyToken,
  authorizeRoles("property_manager"),
  invalidateCache(() => [BID_KEYS.allBids()]),
  approveBid
);

// Decline bid - Invalidate bid caches
router.patch(
  "/:id/decline",
  verifyToken,
  authorizeRoles("property_manager"),
  invalidateCache(() => [BID_KEYS.allBids()]),
  declineBid
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