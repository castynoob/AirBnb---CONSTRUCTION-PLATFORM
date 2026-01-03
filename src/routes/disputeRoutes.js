// ============================================
// USER DISPUTE ROUTES
// Allows users to file and view disputes
// ============================================

import express from 'express';
import disputeController from '../controllers/disputeController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route   POST /api/disputes
 * @desc    Create a new dispute
 * @access  All authenticated users
 * @body    { type, job_id?, reported_id?, reason }
 */
router.post(
  '/disputes',
  authenticateToken,
  disputeController.createDispute
);

/**
 * @route   GET /api/disputes/my-disputes
 * @desc    Get user's filed disputes
 * @access  All authenticated users
 * @query   { status? } - Filter by status
 */
router.get(
  '/disputes/my-disputes',
  authenticateToken,
  disputeController.getMyDisputes
);

/**
 * @route   GET /api/disputes/:disputeId
 * @desc    Get a single dispute by ID
 * @access  All authenticated users (own disputes only)
 */
router.get(
  '/disputes/:disputeId',
  authenticateToken,
  disputeController.getDispute
);

/**
 * @route   GET /api/jobs/my-jobs
 * @desc    Get user's jobs for dispute form
 * @access  All authenticated users
 */
router.get(
  '/jobs/my-jobs',
  authenticateToken,
  disputeController.getMyJobs
);

export default router;
