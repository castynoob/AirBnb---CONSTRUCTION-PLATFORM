// ============================================
// CONTRACT ROUTES
// Handles contract creation, payment, and payout flow
// ============================================

import express from 'express';
import ContractController from '../controllers/contractController.js';
import StripeConnectController from '../controllers/stripeConnectController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireManager, requireEntrepreneur } from '../middleware/roleMiddleware.js';

const router = express.Router();

// ============================================
// STRIPE CONNECT ROUTES (Entrepreneur Onboardings)
// ============================================

/**
 * @route   POST /api/contracts/connect/create-account
 * @desc    Create Stripe Connect account for entrepreneur
 * @access  Entrepreneur only
 */
router.post(
  '/connect/create-account',
  authenticateToken,
  requireEntrepreneur,
  StripeConnectController.createConnectAccount
);

/**
 * @route   POST /api/contracts/connect/onboarding-link
 * @desc    Get Stripe Connect onboarding link
 * @access  Entrepreneur only
 */
router.post(
  '/connect/onboarding-link',
  authenticateToken,
  requireEntrepreneur,
  StripeConnectController.createOnboardingLink
);

/**
 * @route   GET /api/contracts/connect/status
 * @desc    Get Stripe Connect account status
 * @access  Entrepreneur only
 */
router.get(
  '/connect/status',
  authenticateToken,
  requireEntrepreneur,
  StripeConnectController.getConnectStatus
);

/**
 * @route   POST /api/contracts/connect/dashboard-link
 * @desc    Get Stripe Express dashboard link
 * @access  Entrepreneur only
 */
router.post(
  '/connect/dashboard-link',
  authenticateToken,
  requireEntrepreneur,
  StripeConnectController.createDashboardLink
);

/**
 * @route   GET /api/contracts/connect/payouts-summary
 * @desc    Get entrepreneur's payouts summary and transaction history
 * @access  Entrepreneur only
 */
router.get(
  '/connect/payouts-summary',
  authenticateToken,
  requireEntrepreneur,
  StripeConnectController.getPayoutsSummary
);

/**
 * @route   GET /api/contracts/connect/entrepreneur-status/:entrepreneur_id
 * @desc    Check if an entrepreneur can receive payments (for managers)
 * @access  Manager only
 */
router.get(
  '/connect/entrepreneur-status/:entrepreneur_id',
  authenticateToken,
  requireManager,
  StripeConnectController.getEntrepreneurStripeStatus
);

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
 * @route   POST /api/contracts/:id/pay
 * @desc    Create payment intent for contract
 * @access  Manager only
 */
router.post(
  '/:id/pay',
  authenticateToken,
  requireManager,
  ContractController.createPaymentIntent
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
 * @desc    Approve work and release funds to entrepreneur
 * @access  Manager only
 */
router.post(
  '/:id/approve',
  authenticateToken,
  requireManager,
  ContractController.approveAndReleaseFunds
);

export default router;
