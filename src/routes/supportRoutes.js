// ============================================
// SUPPORT TICKET ROUTES
// ============================================

import express from 'express';
import supportController from '../controllers/supportController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route   POST /api/support/tickets
 * @desc    Create a new support ticket
 * @access  All authenticated users
 * @body    { subject, description, category?, priority? }
 */
router.post(
  '/support/tickets',
  authenticateToken,
  supportController.createTicket
);

/**
 * @route   GET /api/support/tickets
 * @desc    Get user's support tickets
 * @access  All authenticated users
 * @query   { status? } - Filter by status (open, in_progress, resolved, closed)
 */
router.get(
  '/support/tickets',
  authenticateToken,
  supportController.getTickets
);

/**
 * @route   GET /api/support/tickets/:ticketId
 * @desc    Get a single support ticket with messages
 * @access  All authenticated users (own tickets only)
 */
router.get(
  '/support/tickets/:ticketId',
  authenticateToken,
  supportController.getTicket
);

/**
 * @route   POST /api/support/tickets/:ticketId/messages
 * @desc    Add a message to a support ticket
 * @access  All authenticated users (own tickets only)
 * @body    { message }
 */
router.post(
  '/support/tickets/:ticketId/messages',
  authenticateToken,
  supportController.addMessage
);

/**
 * @route   GET /api/support/tickets/:ticketId/messages
 * @desc    Get messages for a support ticket
 * @access  All authenticated users (own tickets only)
 */
router.get(
  '/support/tickets/:ticketId/messages',
  authenticateToken,
  supportController.getMessages
);

export default router;
