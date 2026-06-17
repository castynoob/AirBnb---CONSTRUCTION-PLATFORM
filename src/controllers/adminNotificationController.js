// ============================================
// ADMIN NOTIFICATION CONTROLLER
// ============================================
// Mirrors the user-side notificationController but reads/writes the
// admin_user_id slot on the notifications table.
//
// Auth: routes mount under authenticateAdmin + isAdminOrHigher, so req.admin
// is always populated by the time these handlers run.

import pool from "../config/db.js";

// GET /api/admin/notifications
export const getAdminNotifications = async (req, res) => {
  try {
    const adminId = req.admin.id;

    const result = await pool.query(
      `SELECT
        id, type, is_read,
        sender_id, sender_name, content, conversation_id,
        bidder_id, bidder_name, job_id, job_title,
        property_name, unit_name, bid_amount, license_number,
        contractor_id, contractor_name, work_title,
        created_at, updated_at
       FROM notifications
       WHERE admin_user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [adminId]
    );

    res.status(200).json({
      success: true,
      notifications: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("❌ Error getting admin notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get notifications",
      error: error.message,
    });
  }
};

// GET /api/admin/notifications/unread-count
export const getAdminUnreadCount = async (req, res) => {
  try {
    const adminId = req.admin.id;

    const result = await pool.query(
      `SELECT COUNT(*) AS count
       FROM notifications
       WHERE admin_user_id = $1 AND is_read = FALSE`,
      [adminId]
    );

    res.status(200).json({
      success: true,
      count: parseInt(result.rows[0].count, 10),
    });
  } catch (error) {
    console.error("❌ Error getting admin unread count:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get unread count",
      error: error.message,
    });
  }
};

// PATCH /api/admin/notifications/:id/read
export const markAdminNotificationAsRead = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE, updated_at = now()
       WHERE id = $1 AND admin_user_id = $2
       RETURNING *`,
      [id, adminId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      notification: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error marking admin notification as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
      error: error.message,
    });
  }
};

// PATCH /api/admin/notifications/read-all
export const markAllAdminNotificationsAsRead = async (req, res) => {
  try {
    const adminId = req.admin.id;

    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE, updated_at = now()
       WHERE admin_user_id = $1 AND is_read = FALSE
       RETURNING id`,
      [adminId]
    );

    res.status(200).json({
      success: true,
      message: `Marked ${result.rowCount} notifications as read`,
      count: result.rowCount,
    });
  } catch (error) {
    console.error("❌ Error marking all admin notifications as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark all notifications as read",
      error: error.message,
    });
  }
};

// PATCH /api/admin/notifications/job/:jobId/read
// Marks every notification for one job (belonging to the current admin) as read.
// Called when the admin opens the "Manage" modal for a job — clears the red dot.
export const markJobNotificationsAsRead = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { jobId } = req.params;

    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE, updated_at = now()
       WHERE admin_user_id = $1 AND job_id = $2 AND is_read = FALSE
       RETURNING id`,
      [adminId, jobId]
    );

    res.status(200).json({
      success: true,
      message: `Marked ${result.rowCount} notifications as read`,
      count: result.rowCount,
    });
  } catch (error) {
    console.error("❌ Error marking job notifications as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark job notifications as read",
      error: error.message,
    });
  }
};

// DELETE /api/admin/notifications/:id
export const deleteAdminNotification = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM notifications
       WHERE id = $1 AND admin_user_id = $2
       RETURNING id`,
      [id, adminId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification deleted",
    });
  } catch (error) {
    console.error("❌ Error deleting admin notification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete notification",
      error: error.message,
    });
  }
};

// DELETE /api/admin/notifications/clear-all
export const clearAdminNotifications = async (req, res) => {
  try {
    const adminId = req.admin.id;

    const result = await pool.query(
      `DELETE FROM notifications
       WHERE admin_user_id = $1
       RETURNING id`,
      [adminId]
    );

    res.status(200).json({
      success: true,
      message: `Deleted ${result.rowCount} notifications`,
      count: result.rowCount,
    });
  } catch (error) {
    console.error("❌ Error clearing admin notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clear notifications",
      error: error.message,
    });
  }
};
