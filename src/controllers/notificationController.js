// ============================================
// NOTIFICATION CONTROLLER - Business Logic
// ============================================

import pool from '../config/db.js';

const notificationController = {
  /**
   * Get all notifications for the current user
   * GET /api/notifications
   */
  async getNotifications(req, res) {
    try {
      const userId = req.user.id;

      console.log('📬 GET NOTIFICATIONS REQUEST:', { userId });

      const result = await pool.query(
        `SELECT
          id,
          type,
          is_read,
          sender_id,
          sender_name,
          content,
          conversation_id,
          bidder_id,
          bidder_name,
          job_id,
          job_title,
          property_name,
          unit_name,
          bid_amount,
          license_number,
          contractor_id,
          contractor_name,
          work_title,
          created_at,
          updated_at
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
        [userId]
      );

      console.log(`✅ Found ${result.rows.length} notifications`);

      res.status(200).json({
        success: true,
        notifications: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      console.error('❌ Error getting notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get notifications',
        error: error.message
      });
    }
  },

  /**
   * Get unread notification count
   * GET /api/notifications/unread-count
   */
  async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;

      const result = await pool.query(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
        [userId]
      );

      res.status(200).json({
        success: true,
        count: parseInt(result.rows[0].count, 10)
      });
    } catch (error) {
      console.error('❌ Error getting unread count:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get unread count',
        error: error.message
      });
    }
  },

  /**
   * Mark a single notification as read
   * PATCH /api/notifications/:id/read
   */
  async markAsRead(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      console.log('✅ MARK AS READ:', { userId, notificationId: id });

      const result = await pool.query(
        `UPDATE notifications
        SET is_read = true, updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
        [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Notification marked as read',
        notification: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read',
        error: error.message
      });
    }
  },

  /**
   * Mark all notifications as read
   * PATCH /api/notifications/read-all
   */
  async markAllAsRead(req, res) {
    try {
      const userId = req.user.id;

      console.log('✅ MARK ALL AS READ:', { userId });

      const result = await pool.query(
        `UPDATE notifications
        SET is_read = true, updated_at = now()
        WHERE user_id = $1 AND is_read = false
        RETURNING id`,
        [userId]
      );

      res.status(200).json({
        success: true,
        message: `Marked ${result.rowCount} notifications as read`,
        count: result.rowCount
      });
    } catch (error) {
      console.error('❌ Error marking all notifications as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark all notifications as read',
        error: error.message
      });
    }
  },

  /**
   * Delete a notification
   * DELETE /api/notifications/:id
   */
  async deleteNotification(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const result = await pool.query(
        'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Notification deleted'
      });
    } catch (error) {
      console.error('❌ Error deleting notification:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete notification',
        error: error.message
      });
    }
  },

  /**
   * Clear all notifications for user
   * DELETE /api/notifications/clear-all
   */
  async clearAll(req, res) {
    try {
      const userId = req.user.id;

      const result = await pool.query(
        'DELETE FROM notifications WHERE user_id = $1 RETURNING id',
        [userId]
      );

      res.status(200).json({
        success: true,
        message: `Deleted ${result.rowCount} notifications`,
        count: result.rowCount
      });
    } catch (error) {
      console.error('❌ Error clearing notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clear notifications',
        error: error.message
      });
    }
  }
};

// Helper function to create a notification (called from other controllers/socket)
export const createNotification = async (notificationData) => {
  try {
    const {
      userId,
      type,
      senderId,
      senderName,
      content,
      conversationId,
      bidderId,
      bidderName,
      jobId,
      jobTitle,
      propertyName,
      unitName,
      bidAmount,
      licenseNumber,
      contractorId,
      contractorName,
      workTitle
    } = notificationData;

    const result = await pool.query(
      `INSERT INTO notifications (
        user_id, type, sender_id, sender_name, content, conversation_id,
        bidder_id, bidder_name, job_id, job_title, property_name, unit_name,
        bid_amount, license_number, contractor_id, contractor_name, work_title
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        userId, type, senderId, senderName, content, conversationId,
        bidderId, bidderName, jobId, jobTitle, propertyName, unitName,
        bidAmount, licenseNumber, contractorId, contractorName, workTitle
      ]
    );

    console.log('📝 Notification created:', result.rows[0].id);
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
};

export default notificationController;
