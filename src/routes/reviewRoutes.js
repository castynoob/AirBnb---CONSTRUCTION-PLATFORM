import express from "express";
import {
  addReview,
  getReviewsSubmitted,
  getReviewsReceived,
  getReviewByJob
} from "../controllers/reviewController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware.js";
import { REVIEW_KEYS, TTL } from "../utils/cacheKeys.js";

const router = express.Router();

// Add review - Invalidate review caches
router.post(
  "/",
  authenticateToken,
  invalidateCache((req) => {
    // Invalidate reviews for both reviewer and reviewed user
    const patterns = [REVIEW_KEYS.forUser(req.body.reviewer_id)];
    if (req.body.reviewed_user_id) {
      patterns.push(REVIEW_KEYS.forUser(req.body.reviewed_user_id));
    }
    if (req.body.job_id) {
      patterns.push(REVIEW_KEYS.byJob(req.body.job_id));
    }
    return patterns;
  }),
  addReview
);

// Get reviews submitted by a user - CACHED (30 minutes)
router.get(
  "/reviewer/:reviewer_id",
  authenticateToken,
  cacheMiddleware((req) => REVIEW_KEYS.byReviewer(req.params.reviewer_id), TTL.THIRTY_MINUTES),
  getReviewsSubmitted
);

// Get reviews received by a user - CACHED (30 minutes)
router.get(
  "/reviewed/:reviewed_user_id",
  authenticateToken,
  cacheMiddleware((req) => REVIEW_KEYS.byReviewedUser(req.params.reviewed_user_id), TTL.THIRTY_MINUTES),
  getReviewsReceived
);

// Get review by job - CACHED (30 minutes)
router.get(
  "/job/:job_id",
  authenticateToken,
  cacheMiddleware((req) => REVIEW_KEYS.byJob(req.params.job_id), TTL.THIRTY_MINUTES),
  getReviewByJob
);

export default router;
