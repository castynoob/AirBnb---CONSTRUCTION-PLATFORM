// ============================================
// FAVORITES ROUTES
// ============================================

import express from 'express';
import favoriteController from '../controllers/favoriteController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';

const router = express.Router();

/**
 * @route   POST /api/favorites
 * @desc    Add entrepreneur to favorites
 * @access  Property Managers only
 * @body    { entrepreneurId, jobId?, bidId?, notes? }
 */
router.post(
  '/favorites',
  authenticateToken,
  authorizeRoles('property_manager'),
  favoriteController.addFavorite
);

/**
 * @route   GET /api/favorites
 * @desc    Get all favorites for current manager
 * @access  Property Managers only
 * @returns Array of favorite entrepreneurs with details
 */
router.get(
  '/favorites',
  authenticateToken,
  authorizeRoles('property_manager'),
  favoriteController.getFavorites
);

/**
 * @route   GET /api/favorites/count
 * @desc    Get favorite count for current manager
 * @access  Property Managers only
 * @returns { count: number }
 */
router.get(
  '/favorites/count',
  authenticateToken,
  authorizeRoles('property_manager'),
  favoriteController.getFavoriteCount
);

/**
 * @route   GET /api/favorites/check/bid/:bidId
 * @desc    Check if a specific bid is favorited
 * @access  Property Managers only
 * @returns { isFavorited: boolean }
 */
router.get(
  '/favorites/check/bid/:bidId',
  authenticateToken,
  authorizeRoles('property_manager'),
  favoriteController.checkFavorite
);

/**
 * @route   GET /api/favorites/:entrepreneurId/history
 * @desc    Get job history with this entrepreneur
 * @access  Property Managers only
 * @returns Array of past jobs/bids
 */
router.get(
  '/favorites/:entrepreneurId/history',
  authenticateToken,
  authorizeRoles('property_manager'),
  favoriteController.getJobHistory
);

/**
 * @route   DELETE /api/favorites/bid/:bidId
 * @desc    Remove a specific bid from favorites
 * @access  Property Managers only
 */
router.delete(
  '/favorites/bid/:bidId',
  authenticateToken,
  authorizeRoles('property_manager'),
  favoriteController.removeFavorite
);

/**
 * @route   PATCH /api/favorites/:favoriteId/notes
 * @desc    Update favorite notes
 * @access  Property Managers only
 * @body    { notes: string }
 */
router.patch(
  '/favorites/:favoriteId/notes',
  authenticateToken,
  authorizeRoles('property_manager'),
  favoriteController.updateNotes
);

export default router;
