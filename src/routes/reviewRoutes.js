import express from "express";
import {
  addReview,
  getReviewsSubmitted,
  getReviewsReceived,
  getReviewByJob
} from "../controllers/reviewController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Add review
router.post("/", authenticateToken, addReview);

// Get reviews submitted by a user
router.get("/reviewer/:reviewer_id", authenticateToken, getReviewsSubmitted);

// Get reviews received by a user
router.get("/reviewed/:reviewed_user_id", authenticateToken, getReviewsReceived);

router.get('/job/:job_id', authenticateToken, getReviewByJob);


export default router;
