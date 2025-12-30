import pool from "../config/db.js";

// Create a single notification (matches existing table structure)
export const createNotification = async ({
  userId,
  type,
  content,
  senderId = null,
  senderName = null,
  jobId = null,
  jobTitle = null,
  propertyName = null,
  unitName = null,
  bidderId = null,
  bidderName = null,
  bidAmount = null,
  contractorId = null,
  contractorName = null,
  workTitle = null,
  licenseNumber = null,
  conversationId = null
}) => {
  const result = await pool.query(
    `INSERT INTO notifications (
      user_id, type, content, sender_id, sender_name, job_id, job_title,
      property_name, unit_name, bidder_id, bidder_name, bid_amount,
      contractor_id, contractor_name, work_title, license_number, conversation_id
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [userId, type, content, senderId, senderName, jobId, jobTitle,
     propertyName, unitName, bidderId, bidderName, bidAmount,
     contractorId, contractorName, workTitle, licenseNumber, conversationId]
  );
  return result.rows[0];
};

// Create notifications for multiple users (for job-related notifications)
export const createBulkNotifications = async (notifications) => {
  if (!notifications || notifications.length === 0) return [];

  // Build parameterized query for bulk insert
  const columns = 5; // user_id, type, content, job_id, job_title
  const values = notifications.map((n, i) => {
    const offset = i * columns;
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
  }).join(", ");

  const params = notifications.flatMap(n => [
    n.userId,
    n.type,
    n.content,
    n.jobId || null,
    n.jobTitle || null
  ]);

  const result = await pool.query(
    `INSERT INTO notifications (user_id, type, content, job_id, job_title)
     VALUES ${values}
     RETURNING *`,
    params
  );
  return result.rows;
};

// Get notifications for a user
export const getUserNotifications = async (userId, limit = 50, offset = 0, unreadOnly = false) => {
  let query = `
    SELECT * FROM notifications
    WHERE user_id = $1
  `;

  if (unreadOnly) {
    query += ` AND is_read = false`;
  }

  query += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`;

  const result = await pool.query(query, [userId, limit, offset]);
  return result.rows;
};

// Get unread notification count
export const getUnreadCount = async (userId) => {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return parseInt(result.rows[0].count);
};

// Mark notification as read
export const markAsRead = async (notificationId, userId) => {
  const result = await pool.query(
    `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *`,
    [notificationId, userId]
  );
  return result.rows[0];
};

// Mark all notifications as read for a user
export const markAllAsRead = async (userId) => {
  await pool.query(
    `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return true;
};

// Delete a notification
export const deleteNotification = async (notificationId, userId) => {
  await pool.query(
    `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
  return true;
};

// Get users who bid on a job (for notifications)
export const getUsersWhoBidOnJob = async (jobId) => {
  const result = await pool.query(
    `SELECT DISTINCT u.id as user_id, u.first_name, u.last_name, u.email
     FROM bids b
     JOIN entrepreneur_profiles ep ON b.entrepreneur_id = ep.id
     JOIN users u ON ep.user_id = u.id
     WHERE b.job_id = $1`,
    [jobId]
  );
  return result.rows;
};

// Get job owner (property manager) user id
export const getJobOwnerUserId = async (jobId) => {
  const result = await pool.query(
    `SELECT u.id as user_id, u.first_name, u.last_name, u.email
     FROM jobs j
     JOIN manager_profiles mp ON j.manager_id = mp.id
     JOIN users u ON mp.user_id = u.id
     WHERE j.id = $1`,
    [jobId]
  );
  return result.rows[0];
};
