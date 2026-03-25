// ============================================
// FINANCIAL ROUTES
// Aggregated financial dashboard for property managers
// ============================================

import express from 'express';
import FinancialController from '../controllers/financialController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireManager } from '../middleware/roleMiddleware.js';

const router = express.Router();

/**
 * @route   GET /api/financial
 * @desc    Get aggregated financial dashboard data
 * @query   year (optional) - filter by year, e.g. 2026
 * @query   property_id (optional) - filter by property
 * @access  Property Manager only
 */
router.get(
  '/',
  authenticateToken,
  requireManager,
  FinancialController.getFinancialDashboard
);

export default router;
