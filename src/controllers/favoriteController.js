// ============================================
// FAVORITES CONTROLLER - Business Logic
// ============================================

import favoriteModel from '../models/favoriteModel.js';
import pool from '../config/db.js';

const favoriteController = {
  /**
   * Add entrepreneur to favorites
   * POST /api/favorites
   */
  async addFavorite(req, res) {
    try {
      const userId = req.user.id; // User ID from JWT
      const { entrepreneurId, jobId, bidId, notes, category } = req.body;

      console.log('📝 ADD FAVORITE REQUEST:', {
        userId,
        userRole: req.user.role,
        entrepreneurId,
        jobId,
        bidId
      });

      // Validate required fields
      if (!entrepreneurId) {
        return res.status(400).json({
          success: false,
          message: 'Entrepreneur ID is required'
        });
      }

      // Get manager_profile.id from user.id
      const managerProfileResult = await pool.query(
        'SELECT id FROM manager_profiles WHERE user_id = $1',
        [userId]
      );

      if (managerProfileResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Manager profile not found'
        });
      }

      const managerId = managerProfileResult.rows[0].id;
      console.log('✅ Manager Profile ID:', managerId);

      // Auto-fill category from job if not provided
      let favCategory = category || null;
      if (!favCategory && jobId) {
        const jobResult = await pool.query('SELECT category FROM jobs WHERE id = $1', [jobId]);
        if (jobResult.rows[0]?.category) favCategory = jobResult.rows[0].category;
      }

      // Add to favorites
      const favorite = await favoriteModel.addFavorite(
        managerId,
        entrepreneurId,
        jobId,
        bidId,
        notes,
        favCategory
      );

      console.log('✅ FAVORITE ADDED:', favorite);

      res.status(201).json({
        success: true,
        message: 'Entrepreneur added to favorites',
        favorite
      });
    } catch (error) {
      console.error('❌ Error adding favorite:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add favorite',
        error: error.message
      });
    }
  },

  /**
   * Remove entrepreneur from favorites by bid ID
   * DELETE /api/favorites/bid/:bidId
   */
  async removeFavorite(req, res) {
    try {
      const userId = req.user.id; // User ID from JWT
      const { bidId } = req.params;

      console.log('🗑️  REMOVE FAVORITE REQUEST:', {
        userId,
        userRole: req.user.role,
        bidId
      });

      // Get manager_profile.id from user.id
      const managerProfileResult = await pool.query(
        'SELECT id FROM manager_profiles WHERE user_id = $1',
        [userId]
      );

      if (managerProfileResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Manager profile not found'
        });
      }

      const managerId = managerProfileResult.rows[0].id;

      // Check if favorite exists first
      const exists = await favoriteModel.isFavorited(managerId, bidId);
      console.log('🔍 Favorite exists?', exists);

      if (!exists) {
        console.log('⚠️  Favorite not found in database');
        return res.status(404).json({
          success: false,
          message: 'Favorite not found'
        });
      }

      // Remove from favorites
      const removed = await favoriteModel.removeFavorite(managerId, bidId);

      if (!removed) {
        console.log('⚠️  Failed to remove favorite (unexpected)');
        return res.status(404).json({
          success: false,
          message: 'Favorite not found'
        });
      }

      console.log('✅ FAVORITE REMOVED');

      res.json({
        success: true,
        message: 'Entrepreneur removed from favorites'
      });
    } catch (error) {
      console.error('❌ Error removing favorite:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove favorite',
        error: error.message
      });
    }
  },

  /**
   * Get all favorites for the current manager
   * GET /api/favorites
   */
  async getFavorites(req, res) {
    try {
      const userId = req.user.id; // User ID from JWT

      console.log('📋 GET FAVORITES REQUEST:', { userId });

      // Get manager_profile.id from user.id
      const managerProfileResult = await pool.query(
        'SELECT id FROM manager_profiles WHERE user_id = $1',
        [userId]
      );

      if (managerProfileResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Manager profile not found'
        });
      }

      const managerId = managerProfileResult.rows[0].id;

      // Get favorites with entrepreneur details
      const favorites = await favoriteModel.getFavoritesByManager(managerId);

      console.log('✅ FAVORITES RETRIEVED:', favorites.length);

      res.json({
        success: true,
        count: favorites.length,
        favorites
      });
    } catch (error) {
      console.error('❌ Error fetching favorites:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch favorites',
        error: error.message
      });
    }
  },

  /**
   * Check if a specific bid is favorited
   * GET /api/favorites/check/bid/:bidId
   */
  async checkFavorite(req, res) {
    try {
      const userId = req.user.id; // User ID from JWT
      const { bidId } = req.params;

      console.log('🔍 CHECK FAVORITE REQUEST:', { userId, bidId });

      // Get manager_profile.id from user.id
      const managerProfileResult = await pool.query(
        'SELECT id FROM manager_profiles WHERE user_id = $1',
        [userId]
      );

      if (managerProfileResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Manager profile not found'
        });
      }

      const managerId = managerProfileResult.rows[0].id;

      const isFavorited = await favoriteModel.isFavorited(managerId, bidId);

      console.log('✅ CHECK RESULT:', isFavorited);

      res.json({
        success: true,
        isFavorited
      });
    } catch (error) {
      console.error('❌ Error checking favorite:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check favorite status',
        error: error.message
      });
    }
  },

  /**
   * Get favorite count for current manager
   * GET /api/favorites/count
   */
  async getFavoriteCount(req, res) {
    try {
      const userId = req.user.id; // User ID from JWT

      // Get manager_profile.id from user.id
      const managerProfileResult = await pool.query(
        'SELECT id FROM manager_profiles WHERE user_id = $1',
        [userId]
      );

      if (managerProfileResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Manager profile not found'
        });
      }

      const managerId = managerProfileResult.rows[0].id;

      const count = await favoriteModel.getFavoriteCount(managerId);

      res.json({
        success: true,
        count
      });
    } catch (error) {
      console.error('Error fetching favorite count:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch favorite count',
        error: error.message
      });
    }
  },

  /**
   * Get job history for a favorite entrepreneur
   * GET /api/favorites/:entrepreneurId/history
   */
  async getJobHistory(req, res) {
    try {
      const userId = req.user.id; // User ID from JWT
      const { entrepreneurId } = req.params;

      // Get manager_profile.id from user.id
      const managerProfileResult = await pool.query(
        'SELECT id FROM manager_profiles WHERE user_id = $1',
        [userId]
      );

      if (managerProfileResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Manager profile not found'
        });
      }

      const managerId = managerProfileResult.rows[0].id;

      const history = await favoriteModel.getEntrepreneurJobHistory(
        managerId,
        entrepreneurId
      );

      res.json({
        success: true,
        count: history.length,
        history
      });
    } catch (error) {
      console.error('Error fetching job history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch job history',
        error: error.message
      });
    }
  },

  /**
   * Update favorite notes
   * PATCH /api/favorites/:favoriteId/notes
   */
  async updateNotes(req, res) {
    try {
      const { favoriteId } = req.params;
      const { notes } = req.body;
      const userId = req.user.id; // User ID from JWT

      // Get manager_profile.id from user.id
      const managerProfileResult = await pool.query(
        'SELECT id FROM manager_profiles WHERE user_id = $1',
        [userId]
      );

      if (managerProfileResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Manager profile not found'
        });
      }

      const managerId = managerProfileResult.rows[0].id;

      // First check if favorite belongs to this manager
      const favorite = await favoriteModel.getFavoriteById(favoriteId);
      if (!favorite || favorite.manager_id !== managerId) {
        return res.status(404).json({
          success: false,
          message: 'Favorite not found'
        });
      }

      const updated = await favoriteModel.updateNotes(favoriteId, notes);

      res.json({
        success: true,
        message: 'Notes updated successfully',
        favorite: updated
      });
    } catch (error) {
      console.error('Error updating notes:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update notes',
        error: error.message
      });
    }
  },

  async updateCategory(req, res) {
    try {
      const { favoriteId } = req.params;
      const { category } = req.body;
      const userId = req.user.id;

      const managerProfileResult = await pool.query(
        'SELECT id FROM manager_profiles WHERE user_id = $1',
        [userId]
      );
      if (managerProfileResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Manager profile not found' });
      }

      const managerId = managerProfileResult.rows[0].id;
      const favorite = await favoriteModel.getFavoriteById(favoriteId);
      if (!favorite || favorite.manager_id !== managerId) {
        return res.status(404).json({ success: false, message: 'Favorite not found' });
      }

      const updated = await favoriteModel.updateCategory(favoriteId, category);
      res.json({ success: true, message: 'Category updated', favorite: updated });
    } catch (error) {
      console.error('Error updating category:', error);
      res.status(500).json({ success: false, message: 'Failed to update category' });
    }
  }
};

export default favoriteController;
