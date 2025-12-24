// ============================================
// NOTIFICATION ROUTES
// ============================================

import express from 'express';
import notificationController from '../controllers/notificationController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route   GET /api/notifications
 * @desc    Get all notifications for current user
 * @access  Authenticated users
 */
router.get(
  '/notifications',
  authenticateToken,
  notificationController.getNotifications
);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get count of unread notifications
 * @access  Authenticated users
 */
router.get(
  '/notifications/unread-count',
  authenticateToken,
  notificationController.getUnreadCount
);

/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Mark a single notification as read
 * @access  Authenticated users
 */
router.patch(
  '/notifications/:id/read',
  authenticateToken,
  notificationController.markAsRead
);

/**
 * @route   PATCH /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Authenticated users
 */
router.patch(
  '/notifications/read-all',
  authenticateToken,
  notificationController.markAllAsRead
);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete a single notification
 * @access  Authenticated users
 */
router.delete(
  '/notifications/:id',
  authenticateToken,
  notificationController.deleteNotification
);

/**
 * @route   DELETE /api/notifications/clear-all
 * @desc    Clear all notifications
 * @access  Authenticated users
 */
router.delete(
  '/notifications/clear-all',
  authenticateToken,
  notificationController.clearAll
);

export default router;
