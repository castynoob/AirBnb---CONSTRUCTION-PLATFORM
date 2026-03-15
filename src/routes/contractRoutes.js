// ============================================
// CONTRACT ROUTES
// Handles contract workflow between managers and entrepreneurs
// Note: Payments are handled externally, outside the application
// ============================================

import express from 'express';
import ContractController from '../controllers/contractController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireManager, requireEntrepreneur } from '../middleware/roleMiddleware.js';

const router = express.Router();

// ============================================
// CONTRACT MANAGEMENT ROUTES
// ============================================

/**
 * @route   GET /api/contracts
 * @desc    Get all contracts for current user
 * @access  Manager or Entrepreneur
 */
router.get(
  '/',
  authenticateToken,
  ContractController.getContracts
);

/**
 * @route   GET /api/contracts/:id
 * @desc    Get contract details
 * @access  Manager or Entrepreneur involved in contract
 */
router.get(
  '/:id',
  authenticateToken,
  ContractController.getContract
);

/**
 * @route   GET /api/contracts/job/:job_id
 * @desc    Get contract by job ID
 * @access  Manager or Entrepreneur involved in job
 */
router.get(
  '/job/:job_id',
  authenticateToken,
  ContractController.getContractByJob
);

/**
 * @route   POST /api/contracts/create
 * @desc    Create a contract from an approved bid
 * @access  Manager only
 */
router.post(
  '/create',
  authenticateToken,
  requireManager,
  ContractController.createContract
);

/**
 * @route   POST /api/contracts/:id/complete
 * @desc    Mark work as complete (triggers manager review)
 * @access  Entrepreneur only
 */
router.post(
  '/:id/complete',
  authenticateToken,
  requireEntrepreneur,
  ContractController.markWorkComplete
);

/**
 * @route   POST /api/contracts/:id/approve
 * @desc    Approve work completion (payment handled externally)
 * @access  Manager only
 */
router.post(
  '/:id/approve',
  authenticateToken,
  requireManager,
  ContractController.approveWork
);

/**
 * @route   POST /api/contracts/:id/confirm-completion
 * @desc    Confirm job completion (either party)
 * @access  Manager or Entrepreneur involved in contract
 */
router.post(
  '/:id/confirm-completion',
  authenticateToken,
  ContractController.confirmCompletion
);

export default router;
