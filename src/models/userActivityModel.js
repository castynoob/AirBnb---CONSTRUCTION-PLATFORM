import pool from "../config/db.js";

// ============================================
// USER ACTIVITY LOGGING
// ============================================

/**
 * Create a user activity log entry
 * @param {string} userId - The user's ID
 * @param {string} action - The action performed (e.g., 'login', 'job_created', 'bid_submitted')
 * @param {string} entityType - Type of entity involved (e.g., 'user', 'job', 'bid', 'contract')
 * @param {string|null} entityId - ID of the entity involved (optional)
 * @param {object|null} details - Additional details as JSON (optional)
 * @param {string|null} ipAddress - User's IP address (optional)
 * @param {string|null} userAgent - User's browser/device info (optional)
 */
export const createUserActivityLog = async (
  userId,
  action,
  entityType = null,
  entityId = null,
  details = null,
  ipAddress = null,
  userAgent = null
) => {
  try {
    const result = await pool.query(
      `INSERT INTO user_activity_logs
       (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        userId,
        action,
        entityType,
        entityId,
        details ? JSON.stringify(details) : null,
        ipAddress,
        userAgent,
      ]
    );
    return result.rows[0];
  } catch (err) {
    // Log error but don't throw - activity logging should not break main functionality
    console.error("Failed to create user activity log:", err.message);
    return null;
  }
};

/**
 * Get activity logs for a specific user
 * @param {string} userId - The user's ID
 * @param {number} limit - Maximum number of records to return
 * @param {number} offset - Number of records to skip
 * @param {object} filters - Optional filters (action, entityType, startDate, endDate)
 */
export const getUserActivityLogs = async (userId, limit = 50, offset = 0, filters = {}) => {
  let query = `
    SELECT * FROM user_activity_logs
    WHERE user_id = $1
  `;
  const params = [userId];
  let paramCount = 1;

  if (filters.action) {
    paramCount++;
    query += ` AND action = $${paramCount}`;
    params.push(filters.action);
  }

  if (filters.entityType) {
    paramCount++;
    query += ` AND entity_type = $${paramCount}`;
    params.push(filters.entityType);
  }

  if (filters.startDate) {
    paramCount++;
    query += ` AND created_at >= $${paramCount}`;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    paramCount++;
    query += ` AND created_at <= $${paramCount}`;
    params.push(filters.endDate);
  }

  query += ` ORDER BY created_at DESC`;

  paramCount++;
  query += ` LIMIT $${paramCount}`;
  params.push(limit);

  paramCount++;
  query += ` OFFSET $${paramCount}`;
  params.push(offset);

  const result = await pool.query(query, params);
  return result.rows;
};

/**
 * Get all activity logs with user info (for admin dashboard)
 * @param {number} limit - Maximum number of records to return
 * @param {number} offset - Number of records to skip
 * @param {object} filters - Optional filters
 */
export const getAllActivityLogs = async (limit = 50, offset = 0, filters = {}) => {
  let query = `
    SELECT
      ual.*,
      u.email as user_email,
      u.first_name,
      u.last_name,
      u.role as user_role
    FROM user_activity_logs ual
    LEFT JOIN users u ON ual.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  let paramCount = 0;

  if (filters.userId) {
    paramCount++;
    query += ` AND ual.user_id = $${paramCount}`;
    params.push(filters.userId);
  }

  if (filters.action) {
    paramCount++;
    query += ` AND ual.action = $${paramCount}`;
    params.push(filters.action);
  }

  if (filters.entityType) {
    paramCount++;
    query += ` AND ual.entity_type = $${paramCount}`;
    params.push(filters.entityType);
  }

  if (filters.userRole) {
    paramCount++;
    query += ` AND u.role = $${paramCount}`;
    params.push(filters.userRole);
  }

  if (filters.startDate) {
    paramCount++;
    query += ` AND ual.created_at >= $${paramCount}`;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    paramCount++;
    query += ` AND ual.created_at <= $${paramCount}`;
    params.push(filters.endDate);
  }

  // Get total count
  const countQuery = query.replace(
    /SELECT[\s\S]*?FROM/,
    'SELECT COUNT(*) as total FROM'
  );
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Add pagination
  query += ` ORDER BY ual.created_at DESC`;
  paramCount++;
  query += ` LIMIT $${paramCount}`;
  params.push(limit);
  paramCount++;
  query += ` OFFSET $${paramCount}`;
  params.push(offset);

  const result = await pool.query(query, params);
  return { logs: result.rows, total };
};

/**
 * Get activity summary for a user (counts by action type)
 * @param {string} userId - The user's ID
 */
export const getUserActivitySummary = async (userId) => {
  const result = await pool.query(
    `SELECT
       action,
       COUNT(*) as count,
       MAX(created_at) as last_occurrence
     FROM user_activity_logs
     WHERE user_id = $1
     GROUP BY action
     ORDER BY count DESC`,
    [userId]
  );
  return result.rows;
};

/**
 * Get the last login for a user
 * @param {string} userId - The user's ID
 */
export const getLastLogin = async (userId) => {
  const result = await pool.query(
    `SELECT created_at, ip_address, user_agent
     FROM user_activity_logs
     WHERE user_id = $1 AND action = 'login'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0];
};

// ============================================
// PREDEFINED ACTION TYPES
// ============================================
export const ActivityActions = {
  // Authentication
  LOGIN: 'login',
  LOGOUT: 'logout',
  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  EMAIL_VERIFIED: 'email_verified',

  // Profile
  PROFILE_UPDATED: 'profile_updated',
  PROFILE_PICTURE_UPDATED: 'profile_picture_updated',

  // Jobs (Property Manager)
  JOB_CREATED: 'job_created',
  JOB_UPDATED: 'job_updated',
  JOB_CLOSED: 'job_closed',
  JOB_CANCELLED: 'job_cancelled',

  // Bids (Entrepreneur)
  BID_SUBMITTED: 'bid_submitted',
  BID_WITHDRAWN: 'bid_withdrawn',
  BID_ACCEPTED: 'bid_accepted',
  BID_REJECTED: 'bid_rejected',

  // Budget Unlock (Entrepreneur)
  BUDGET_UNLOCKED: 'budget_unlocked',

  // Contracts
  CONTRACT_CREATED: 'contract_created',
  CONTRACT_PAID: 'contract_paid',
  CONTRACT_WORK_STARTED: 'contract_work_started',
  CONTRACT_COMPLETED: 'contract_completed',

  // Subscriptions
  SUBSCRIPTION_CREATED: 'subscription_created',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  SUBSCRIPTION_RENEWED: 'subscription_renewed',

  // Messages
  MESSAGE_SENT: 'message_sent',

  // Supplier
  QUOTE_SUBMITTED: 'quote_submitted',
  INVOICE_CREATED: 'invoice_created',

  // Reviews
  REVIEW_SUBMITTED: 'review_submitted',

  // Properties
  PROPERTY_ADDED: 'property_added',
  PROPERTY_UPDATED: 'property_updated',
};

export const EntityTypes = {
  USER: 'user',
  JOB: 'job',
  BID: 'bid',
  CONTRACT: 'contract',
  SUBSCRIPTION: 'subscription',
  MESSAGE: 'message',
  PROPERTY: 'property',
  REVIEW: 'review',
  INVOICE: 'invoice',
};
