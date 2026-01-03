import pool from "../config/db.js";

// ============================================
// ADMIN USER QUERIES
// ============================================

// Find admin by email
export const findAdminByEmail = async (email) => {
  const result = await pool.query(
    `SELECT * FROM admin_users WHERE email = $1`,
    [email]
  );
  return result.rows[0];
};

// Find admin by ID
export const findAdminById = async (id) => {
  const result = await pool.query(
    `SELECT id, email, name, role, status, avatar_url, last_login_at, created_at
     FROM admin_users WHERE id = $1`,
    [id]
  );
  return result.rows[0];
};

// Update admin last login
export const updateAdminLastLogin = async (adminId) => {
  await pool.query(
    `UPDATE admin_users SET last_login_at = NOW() WHERE id = $1`,
    [adminId]
  );
};

// ============================================
// ADMIN SESSION QUERIES
// ============================================

// Create admin session
export const createAdminSession = async (adminId, tokenHash, ipAddress, userAgent, expiresAt) => {
  const result = await pool.query(
    `INSERT INTO admin_sessions (admin_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [adminId, tokenHash, ipAddress, userAgent, expiresAt]
  );
  return result.rows[0];
};

// Find admin session by token hash
export const findAdminSession = async (tokenHash) => {
  const result = await pool.query(
    `SELECT * FROM admin_sessions
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash]
  );
  return result.rows[0];
};

// Delete admin session
export const deleteAdminSession = async (tokenHash) => {
  await pool.query(
    `DELETE FROM admin_sessions WHERE token_hash = $1`,
    [tokenHash]
  );
};

// Delete all sessions for admin
export const deleteAllAdminSessions = async (adminId) => {
  await pool.query(
    `DELETE FROM admin_sessions WHERE admin_id = $1`,
    [adminId]
  );
};

// ============================================
// AUDIT LOG QUERIES
// ============================================

// Create audit log entry
export const createAuditLog = async (adminId, action, entityType, entityId, details, ipAddress, userAgent) => {
  const result = await pool.query(
    `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [adminId, action, entityType, entityId, details ? JSON.stringify(details) : null, ipAddress, userAgent]
  );
  return result.rows[0];
};

// Get audit logs with pagination
export const getAuditLogs = async (limit = 50, offset = 0, filters = {}) => {
  let query = `
    SELECT al.*, au.name as admin_name, au.email as admin_email
    FROM audit_logs al
    LEFT JOIN admin_users au ON al.admin_id = au.id
    WHERE 1=1
  `;
  const params = [];
  let paramCount = 0;

  if (filters.adminId) {
    paramCount++;
    query += ` AND al.admin_id = $${paramCount}`;
    params.push(filters.adminId);
  }

  if (filters.action) {
    paramCount++;
    query += ` AND al.action = $${paramCount}`;
    params.push(filters.action);
  }

  if (filters.entityType) {
    paramCount++;
    query += ` AND al.entity_type = $${paramCount}`;
    params.push(filters.entityType);
  }

  if (filters.startDate) {
    paramCount++;
    query += ` AND al.created_at >= $${paramCount}`;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    paramCount++;
    query += ` AND al.created_at <= $${paramCount}`;
    params.push(filters.endDate);
  }

  query += ` ORDER BY al.created_at DESC`;

  paramCount++;
  query += ` LIMIT $${paramCount}`;
  params.push(limit);

  paramCount++;
  query += ` OFFSET $${paramCount}`;
  params.push(offset);

  const result = await pool.query(query, params);
  return result.rows;
};

// ============================================
// DASHBOARD STATISTICS QUERIES
// ============================================

// Get total users count by role
export const getUserStats = async () => {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_users,
      COUNT(*) FILTER (WHERE role = 'property_manager') as property_managers,
      COUNT(*) FILTER (WHERE role = 'entrepreneur') as entrepreneurs,
      COUNT(*) FILTER (WHERE role = 'supplier') as suppliers,
      COUNT(*) FILTER (WHERE role = 'resident') as residents,
      COUNT(*) FILTER (WHERE email_verified = true) as verified_users,
      COUNT(*) FILTER (WHERE email_verified = false) as unverified_users
    FROM users
  `);
  return result.rows[0];
};

// Get subscription stats
export const getSubscriptionStats = async () => {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_subscriptions,
      COUNT(*) FILTER (WHERE status = 'active') as active_subscriptions,
      COUNT(*) FILTER (WHERE plan_type = 'basic' AND status = 'active') as basic_plans,
      COUNT(*) FILTER (WHERE plan_type = 'premium' AND status = 'active') as premium_plans,
      COUNT(*) FILTER (WHERE status = 'canceled') as canceled_subscriptions
    FROM subscriptions
  `);
  return result.rows[0];
};

// Get job stats
export const getJobStats = async () => {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_jobs,
      COUNT(*) FILTER (WHERE status = 'Open') as open_jobs,
      COUNT(*) FILTER (WHERE status = 'In Progress') as in_progress_jobs,
      COUNT(*) FILTER (WHERE status = 'Completed') as completed_jobs,
      COUNT(*) FILTER (WHERE status = 'Cancelled') as cancelled_jobs
    FROM jobs
  `);
  return result.rows[0];
};

// Get bid stats
export const getBidStats = async () => {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_bids,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_bids,
      COUNT(*) FILTER (WHERE status = 'accepted') as accepted_bids,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected_bids,
      COALESCE(AVG(amount), 0) as average_bid_amount
    FROM bids
  `);
  return result.rows[0];
};

// Get revenue stats (from budget unlocks and subscriptions)
export const getRevenueStats = async () => {
  const UNLOCK_FEE = 20; // $20 per budget unlock

  // Get budget unlock count
  const budgetUnlocksResult = await pool.query(`
    SELECT COUNT(*) as total_unlocks
    FROM budget_unlocks
    WHERE status = 'succeeded'
  `);

  // Get subscription counts (for display purposes)
  const subscriptionsResult = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'active') as active_subscriptions,
      COUNT(*) FILTER (WHERE plan_type = 'basic' AND status = 'active') as basic_count,
      COUNT(*) FILTER (WHERE plan_type = 'premium' AND status = 'active') as premium_count
    FROM subscriptions
  `);

  const totalUnlocks = parseInt(budgetUnlocksResult.rows[0].total_unlocks) || 0;
  const subs = subscriptionsResult.rows[0];

  // Calculate revenue
  const unlockRevenue = totalUnlocks * UNLOCK_FEE; // $20 per unlock
  const basicRevenue = (parseInt(subs.basic_count) || 0) * 250;
  const premiumRevenue = (parseInt(subs.premium_count) || 0) * 429;
  const subscriptionRevenue = basicRevenue + premiumRevenue;

  return {
    total_platform_fees: unlockRevenue + subscriptionRevenue,
    budget_unlock_revenue: unlockRevenue,
    subscription_revenue: subscriptionRevenue,
    total_unlocks: totalUnlocks,
    total_contracts: totalUnlocks, // For backwards compatibility
  };
};

// Get monthly revenue for chart (from budget unlocks)
export const getMonthlyRevenue = async (months = 12) => {
  const UNLOCK_FEE = 20; // $20 per budget unlock

  const result = await pool.query(`
    SELECT
      DATE_TRUNC('month', unlocked_at) as month,
      COUNT(*) as unlock_count
    FROM budget_unlocks
    WHERE status = 'succeeded'
      AND unlocked_at >= NOW() - INTERVAL '${months} months'
    GROUP BY DATE_TRUNC('month', unlocked_at)
    ORDER BY month ASC
  `);

  // Calculate revenue as count × $20
  return result.rows.map(row => ({
    month: row.month,
    revenue: (parseInt(row.unlock_count) || 0) * UNLOCK_FEE,
    transactions: parseInt(row.unlock_count) || 0
  }));
};

// Get revenue by time period (days, weeks, months, years) with optional date range
// Includes BOTH budget unlock revenue AND subscription revenue
export const getRevenueByPeriod = async (period = 'month', startDate = null, endDate = null) => {
  const UNLOCK_FEE = 20; // $20 per budget unlock
  const BASIC_PLAN_PRICE = 250; // $250 for basic plan
  const PREMIUM_PLAN_PRICE = 429; // $429 for premium plan

  let dateTrunc, interval;

  switch (period) {
    case 'day':
      dateTrunc = 'day';
      interval = '30 days';
      break;
    case 'week':
      dateTrunc = 'week';
      interval = '12 weeks';
      break;
    case 'month':
      dateTrunc = 'month';
      interval = '12 months';
      break;
    case 'year':
      dateTrunc = 'year';
      interval = '5 years';
      break;
    default:
      dateTrunc = 'month';
      interval = '12 months';
  }

  let budgetQuery, subscriptionQuery;
  let params = [];

  if (startDate && endDate) {
    // Custom date range - Budget Unlocks
    budgetQuery = `
      SELECT
        DATE_TRUNC('${dateTrunc}', unlocked_at) as period_date,
        COUNT(*) as unlock_count
      FROM budget_unlocks
      WHERE status = 'succeeded'
        AND unlocked_at >= $1
        AND unlocked_at <= $2
      GROUP BY DATE_TRUNC('${dateTrunc}', unlocked_at)
    `;

    // Custom date range - Subscriptions
    subscriptionQuery = `
      SELECT
        DATE_TRUNC('${dateTrunc}', created_at) as period_date,
        COUNT(*) FILTER (WHERE plan_type = 'basic') as basic_count,
        COUNT(*) FILTER (WHERE plan_type = 'premium') as premium_count
      FROM subscriptions
      WHERE created_at >= $1
        AND created_at <= $2
      GROUP BY DATE_TRUNC('${dateTrunc}', created_at)
    `;

    params = [startDate, endDate];
  } else {
    // Default interval - Budget Unlocks
    budgetQuery = `
      SELECT
        DATE_TRUNC('${dateTrunc}', unlocked_at) as period_date,
        COUNT(*) as unlock_count
      FROM budget_unlocks
      WHERE status = 'succeeded'
        AND unlocked_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE_TRUNC('${dateTrunc}', unlocked_at)
    `;

    // Default interval - Subscriptions
    subscriptionQuery = `
      SELECT
        DATE_TRUNC('${dateTrunc}', created_at) as period_date,
        COUNT(*) FILTER (WHERE plan_type = 'basic') as basic_count,
        COUNT(*) FILTER (WHERE plan_type = 'premium') as premium_count
      FROM subscriptions
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE_TRUNC('${dateTrunc}', created_at)
    `;
  }

  // Execute both queries
  const [budgetResult, subscriptionResult] = await Promise.all([
    pool.query(budgetQuery, params),
    pool.query(subscriptionQuery, params)
  ]);

  // Create a map to combine results by period
  const revenueMap = new Map();

  // Add budget unlock revenue
  budgetResult.rows.forEach(row => {
    const periodKey = row.period_date.toISOString();
    const unlockRevenue = (parseInt(row.unlock_count) || 0) * UNLOCK_FEE;

    if (revenueMap.has(periodKey)) {
      const existing = revenueMap.get(periodKey);
      existing.unlockRevenue = unlockRevenue;
      existing.unlockCount = parseInt(row.unlock_count) || 0;
      existing.revenue += unlockRevenue;
    } else {
      revenueMap.set(periodKey, {
        period: row.period_date,
        revenue: unlockRevenue,
        unlockRevenue: unlockRevenue,
        subscriptionRevenue: 0,
        unlockCount: parseInt(row.unlock_count) || 0,
        subscriptionCount: 0
      });
    }
  });

  // Add subscription revenue
  subscriptionResult.rows.forEach(row => {
    const periodKey = row.period_date.toISOString();
    const basicCount = parseInt(row.basic_count) || 0;
    const premiumCount = parseInt(row.premium_count) || 0;
    const subRevenue = (basicCount * BASIC_PLAN_PRICE) + (premiumCount * PREMIUM_PLAN_PRICE);

    if (revenueMap.has(periodKey)) {
      const existing = revenueMap.get(periodKey);
      existing.subscriptionRevenue = subRevenue;
      existing.subscriptionCount = basicCount + premiumCount;
      existing.revenue += subRevenue;
    } else {
      revenueMap.set(periodKey, {
        period: row.period_date,
        revenue: subRevenue,
        unlockRevenue: 0,
        subscriptionRevenue: subRevenue,
        unlockCount: 0,
        subscriptionCount: basicCount + premiumCount
      });
    }
  });

  // Convert map to array and sort by period
  const result = Array.from(revenueMap.values())
    .sort((a, b) => new Date(a.period) - new Date(b.period));

  return result;
};

// Get jobs posted over time for chart with period/date filtering
export const getJobsOverTime = async (days = 30) => {
  const result = await pool.query(`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as count
    FROM jobs
    WHERE created_at >= NOW() - INTERVAL '${days} days'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);
  return result.rows;
};

// Get jobs by time period with optional date range
export const getJobsByPeriod = async (period = 'day', startDate = null, endDate = null) => {
  let dateTrunc, interval;

  switch (period) {
    case 'day':
      dateTrunc = 'day';
      interval = '30 days';
      break;
    case 'week':
      dateTrunc = 'week';
      interval = '12 weeks';
      break;
    case 'month':
      dateTrunc = 'month';
      interval = '12 months';
      break;
    case 'year':
      dateTrunc = 'year';
      interval = '5 years';
      break;
    default:
      dateTrunc = 'day';
      interval = '30 days';
  }

  let query;
  let params = [];

  if (startDate && endDate) {
    query = `
      SELECT
        DATE_TRUNC('${dateTrunc}', created_at) as period_date,
        COUNT(*) as count
      FROM jobs
      WHERE created_at >= $1
        AND created_at <= $2
      GROUP BY DATE_TRUNC('${dateTrunc}', created_at)
      ORDER BY period_date ASC
    `;
    params = [startDate, endDate];
  } else {
    query = `
      SELECT
        DATE_TRUNC('${dateTrunc}', created_at) as period_date,
        COUNT(*) as count
      FROM jobs
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE_TRUNC('${dateTrunc}', created_at)
      ORDER BY period_date ASC
    `;
  }

  const result = await pool.query(query, params);

  return result.rows.map(row => ({
    period: row.period_date,
    count: parseInt(row.count) || 0
  }));
};

// Get user registrations over time
export const getUserRegistrationsOverTime = async (days = 30) => {
  const result = await pool.query(`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as count,
      COUNT(*) FILTER (WHERE role = 'property_manager') as property_managers,
      COUNT(*) FILTER (WHERE role = 'entrepreneur') as entrepreneurs,
      COUNT(*) FILTER (WHERE role = 'supplier') as suppliers,
      COUNT(*) FILTER (WHERE role = 'resident') as residents
    FROM users
    WHERE created_at >= NOW() - INTERVAL '${days} days'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);
  return result.rows;
};

// Get user registrations by time period with optional date range
export const getUsersByPeriod = async (period = 'day', startDate = null, endDate = null) => {
  let dateTrunc, interval;

  switch (period) {
    case 'day':
      dateTrunc = 'day';
      interval = '30 days';
      break;
    case 'week':
      dateTrunc = 'week';
      interval = '12 weeks';
      break;
    case 'month':
      dateTrunc = 'month';
      interval = '12 months';
      break;
    case 'year':
      dateTrunc = 'year';
      interval = '5 years';
      break;
    default:
      dateTrunc = 'day';
      interval = '30 days';
  }

  let query;
  let params = [];

  if (startDate && endDate) {
    query = `
      SELECT
        DATE_TRUNC('${dateTrunc}', created_at) as period_date,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE role = 'property_manager') as property_managers,
        COUNT(*) FILTER (WHERE role = 'entrepreneur') as entrepreneurs,
        COUNT(*) FILTER (WHERE role = 'supplier') as suppliers,
        COUNT(*) FILTER (WHERE role = 'resident') as residents
      FROM users
      WHERE created_at >= $1
        AND created_at <= $2
      GROUP BY DATE_TRUNC('${dateTrunc}', created_at)
      ORDER BY period_date ASC
    `;
    params = [startDate, endDate];
  } else {
    query = `
      SELECT
        DATE_TRUNC('${dateTrunc}', created_at) as period_date,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE role = 'property_manager') as property_managers,
        COUNT(*) FILTER (WHERE role = 'entrepreneur') as entrepreneurs,
        COUNT(*) FILTER (WHERE role = 'supplier') as suppliers,
        COUNT(*) FILTER (WHERE role = 'resident') as residents
      FROM users
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE_TRUNC('${dateTrunc}', created_at)
      ORDER BY period_date ASC
    `;
  }

  const result = await pool.query(query, params);

  return result.rows.map(row => ({
    period: row.period_date,
    count: parseInt(row.count) || 0,
    property_managers: parseInt(row.property_managers) || 0,
    entrepreneurs: parseInt(row.entrepreneurs) || 0,
    suppliers: parseInt(row.suppliers) || 0,
    residents: parseInt(row.residents) || 0
  }));
};

// Get recent activity with optional filters
export const getRecentActivity = async (limit = 20, filters = {}) => {
  const { types = [], roles = [] } = filters;
  const queries = [];
  const params = [];
  let paramIndex = 1;

  // Helper to check if a type should be included
  const includeType = (type) => types.length === 0 || types.includes(type);

  // User registrations
  if (includeType('user_registered')) {
    let userQuery = `
      SELECT
        'user_registered' as type,
        u.id as entity_id,
        u.first_name || ' ' || u.last_name as title,
        u.role as subtitle,
        u.created_at as timestamp
      FROM users u
    `;
    if (roles.length > 0) {
      userQuery += ` WHERE u.role = ANY($${paramIndex}::text[])`;
      params.push(roles);
      paramIndex++;
    }
    userQuery += ` ORDER BY u.created_at DESC LIMIT 10`;
    queries.push(`(${userQuery})`);
  }

  // Job posts
  if (includeType('job_posted')) {
    queries.push(`(
      SELECT
        'job_posted' as type,
        j.id as entity_id,
        j.title as title,
        j.category as subtitle,
        j.created_at as timestamp
      FROM jobs j
      ORDER BY j.created_at DESC
      LIMIT 10
    )`);
  }

  // Bid submissions
  if (includeType('bid_submitted')) {
    queries.push(`(
      SELECT
        'bid_submitted' as type,
        b.id as entity_id,
        'Bid: $' || b.amount::text as title,
        b.status as subtitle,
        b.created_at as timestamp
      FROM bids b
      ORDER BY b.created_at DESC
      LIMIT 10
    )`);
  }

  // Subscriptions
  if (includeType('subscription_created')) {
    queries.push(`(
      SELECT
        'subscription_created' as type,
        s.id as entity_id,
        s.plan_type || ' Plan' as title,
        s.status as subtitle,
        s.created_at as timestamp
      FROM subscriptions s
      ORDER BY s.created_at DESC
      LIMIT 10
    )`);
  }

  // If no queries (all types filtered out), return empty
  if (queries.length === 0) {
    return [];
  }

  params.push(limit);
  const finalQuery = `
    ${queries.join(' UNION ALL ')}
    ORDER BY timestamp DESC
    LIMIT $${paramIndex}
  `;

  const result = await pool.query(finalQuery, params);
  return result.rows;
};

// ============================================
// USER MANAGEMENT QUERIES
// ============================================

// Get all users with pagination and filters
export const getAllUsers = async (limit = 50, offset = 0, filters = {}) => {
  // Build WHERE conditions
  let whereClause = ' WHERE 1=1';
  const params = [];
  let paramCount = 0;

  if (filters.role) {
    paramCount++;
    whereClause += ` AND u.role = $${paramCount}`;
    params.push(filters.role);
  }

  if (filters.emailVerified !== undefined) {
    paramCount++;
    whereClause += ` AND u.email_verified = $${paramCount}`;
    params.push(filters.emailVerified);
  }

  if (filters.search) {
    paramCount++;
    whereClause += ` AND (u.email ILIKE $${paramCount} OR u.first_name ILIKE $${paramCount} OR u.last_name ILIKE $${paramCount})`;
    params.push(`%${filters.search}%`);
  }

  // Get total count (simple query without subquery)
  const countQuery = `
    SELECT COUNT(*) as total
    FROM users u
    LEFT JOIN entrepreneur_profiles ep ON u.id = ep.user_id AND u.role = 'entrepreneur'
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Main query with all fields including last_login subquery
  let query = `
    SELECT
      u.id, u.email, u.role, u.first_name, u.last_name, u.phone,
      u.email_verified, u.created_at, u.updated_at,
      CASE
        WHEN u.role = 'entrepreneur' THEN ep.subscription_plan
        ELSE NULL
      END as subscription_plan,
      (
        SELECT created_at FROM user_activity_logs
        WHERE user_id = u.id AND action = 'login'
        ORDER BY created_at DESC
        LIMIT 1
      ) as last_login
    FROM users u
    LEFT JOIN entrepreneur_profiles ep ON u.id = ep.user_id AND u.role = 'entrepreneur'
    ${whereClause}
  `;

  // Add pagination
  query += ` ORDER BY u.created_at DESC`;
  paramCount++;
  query += ` LIMIT $${paramCount}`;
  params.push(limit);
  paramCount++;
  query += ` OFFSET $${paramCount}`;
  params.push(offset);

  const result = await pool.query(query, params);
  return { users: result.rows, total };
};

// Get user by ID with full profile
export const getUserById = async (userId) => {
  const result = await pool.query(`
    SELECT
      u.id, u.email, u.role, u.first_name, u.middle_name, u.last_name, u.phone,
      u.email_verified, u.created_at, u.updated_at,
      ep.company_name as entrepreneur_company,
      ep.license_number,
      ep.subscription_plan,
      mp.company_name as manager_company,
      mp.total_properties,
      sp.company_name as supplier_company,
      (
        SELECT created_at FROM user_activity_logs
        WHERE user_id = u.id AND action = 'login'
        ORDER BY created_at DESC
        LIMIT 1
      ) as last_login
    FROM users u
    LEFT JOIN entrepreneur_profiles ep ON u.id = ep.user_id
    LEFT JOIN manager_profiles mp ON u.id = mp.user_id
    LEFT JOIN supplier_profiles sp ON u.id = sp.user_id
    WHERE u.id = $1
  `, [userId]);
  return result.rows[0];
};

// Suspend user
export const suspendUser = async (userId, adminId, reason) => {
  // For now, we'll add a suspended flag - you may want to add this column
  // Or use a different approach like moving to a suspended_users table
  // Here we'll just log the suspension in audit_logs
  return true;
};

// Get user activity
export const getUserActivity = async (userId, limit = 50) => {
  const result = await pool.query(`
    (
      SELECT 'job_posted' as type, j.title as description, j.created_at as timestamp
      FROM jobs j
      JOIN manager_profiles mp ON j.manager_id = mp.id
      WHERE mp.user_id = $1
      ORDER BY j.created_at DESC
      LIMIT 10
    )
    UNION ALL
    (
      SELECT 'bid_submitted' as type, 'Bid: $' || b.amount::text as description, b.created_at as timestamp
      FROM bids b
      JOIN entrepreneur_profiles ep ON b.entrepreneur_id = ep.id
      WHERE ep.user_id = $1
      ORDER BY b.created_at DESC
      LIMIT 10
    )
    UNION ALL
    (
      SELECT 'message_sent' as type, 'Message sent' as description, m.created_at as timestamp
      FROM messages m
      WHERE m.sender_id = $1
      ORDER BY m.created_at DESC
      LIMIT 10
    )
    ORDER BY timestamp DESC
    LIMIT $2
  `, [userId, limit]);
  return result.rows;
};

// ============================================
// JOB MANAGEMENT QUERIES
// ============================================

// Get all jobs with pagination and filters
export const getAllJobs = async (limit = 50, offset = 0, filters = {}) => {
  let whereClause = ' WHERE 1=1';
  const params = [];
  let paramCount = 0;

  if (filters.status) {
    paramCount++;
    whereClause += ` AND j.status = $${paramCount}`;
    params.push(filters.status);
  }

  if (filters.category) {
    paramCount++;
    whereClause += ` AND j.category = $${paramCount}`;
    params.push(filters.category);
  }

  if (filters.urgency) {
    paramCount++;
    whereClause += ` AND j.urgency = $${paramCount}`;
    params.push(filters.urgency);
  }

  if (filters.search) {
    paramCount++;
    whereClause += ` AND (j.title ILIKE $${paramCount} OR j.description ILIKE $${paramCount})`;
    params.push(`%${filters.search}%`);
  }

  if (filters.isFlagged !== undefined) {
    paramCount++;
    whereClause += ` AND j.is_flagged = $${paramCount}`;
    params.push(filters.isFlagged);
  }

  // Count query
  const countQuery = `
    SELECT COUNT(*) as total
    FROM jobs j
    LEFT JOIN manager_profiles mp ON j.manager_id = mp.id
    LEFT JOIN users u ON mp.user_id = u.id
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Main query
  let query = `
    SELECT
      j.id, j.title, j.description, j.category, j.urgency,
      j.due_date, j.estimated_duration_days,
      j.budget_min, j.budget_max, j.is_budget_hidden, j.is_emergency,
      j.status, j.created_at, j.updated_at,
      j.is_flagged, j.flag_reason, j.admin_notes,
      mp.id as manager_profile_id,
      mp.company_name as manager_company,
      u.id as manager_user_id,
      u.first_name as manager_first_name,
      u.last_name as manager_last_name,
      u.email as manager_email,
      p.address as property_address,
      p.city as property_city,
      (SELECT COUNT(*) FROM bids WHERE job_id = j.id) as bid_count
    FROM jobs j
    LEFT JOIN manager_profiles mp ON j.manager_id = mp.id
    LEFT JOIN users u ON mp.user_id = u.id
    LEFT JOIN properties p ON j.property_id = p.id
    ${whereClause}
  `;

  // Add pagination
  query += ` ORDER BY j.created_at DESC`;
  paramCount++;
  query += ` LIMIT $${paramCount}`;
  params.push(limit);
  paramCount++;
  query += ` OFFSET $${paramCount}`;
  params.push(offset);

  const result = await pool.query(query, params);
  return { jobs: result.rows, total };
};

// Get job by ID with full details
export const getJobById = async (jobId) => {
  const result = await pool.query(`
    SELECT
      j.*,
      mp.id as manager_profile_id,
      mp.company_name as manager_company,
      mp.address as manager_address,
      u.id as manager_user_id,
      u.first_name as manager_first_name,
      u.last_name as manager_last_name,
      u.email as manager_email,
      u.phone as manager_phone,
      p.address as property_address,
      p.city as property_city,
      p.province as property_province,
      p.building_name,
      p.building_type
    FROM jobs j
    LEFT JOIN manager_profiles mp ON j.manager_id = mp.id
    LEFT JOIN users u ON mp.user_id = u.id
    LEFT JOIN properties p ON j.property_id = p.id
    WHERE j.id = $1
  `, [jobId]);
  return result.rows[0];
};

// Get bids for a job
export const getJobBids = async (jobId) => {
  const result = await pool.query(`
    SELECT
      b.*,
      ep.company_name as entrepreneur_company,
      ep.license_number,
      ep.average_rating,
      ep.total_reviews,
      u.first_name as entrepreneur_first_name,
      u.last_name as entrepreneur_last_name,
      u.email as entrepreneur_email,
      bu.unlocked_at as budget_unlocked_at
    FROM bids b
    LEFT JOIN entrepreneur_profiles ep ON b.entrepreneur_id = ep.id
    LEFT JOIN users u ON ep.user_id = u.id
    LEFT JOIN budget_unlocks bu ON bu.entrepreneur_id = b.entrepreneur_id AND bu.job_id = b.job_id
    WHERE b.job_id = $1
    ORDER BY b.created_at DESC
  `, [jobId]);
  return result.rows;
};

// Flag a job
export const flagJob = async (jobId, reason, adminId) => {
  const result = await pool.query(`
    UPDATE jobs
    SET is_flagged = true, flag_reason = $2, flagged_by = $3, flagged_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [jobId, reason, adminId]);
  return result.rows[0];
};

// Unflag a job
export const unflagJob = async (jobId) => {
  const result = await pool.query(`
    UPDATE jobs
    SET is_flagged = false, flag_reason = NULL, flagged_by = NULL, flagged_at = NULL
    WHERE id = $1
    RETURNING *
  `, [jobId]);
  return result.rows[0];
};

// Add admin notes to a job
export const addJobAdminNotes = async (jobId, notes) => {
  const result = await pool.query(`
    UPDATE jobs
    SET admin_notes = $2
    WHERE id = $1
    RETURNING *
  `, [jobId, notes]);
  return result.rows[0];
};

// Force close a job
export const forceCloseJob = async (jobId, reason, adminId) => {
  const result = await pool.query(`
    UPDATE jobs
    SET status = 'Closed', closed_reason = $2, closed_by = $3, closed_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [jobId, reason, adminId]);
  return result.rows[0];
};

// Get job categories for filter dropdown
export const getJobCategories = async () => {
  const result = await pool.query(`
    SELECT DISTINCT category FROM jobs WHERE category IS NOT NULL ORDER BY category
  `);
  return result.rows.map(r => r.category);
};

// ============================================
// BID MANAGEMENT QUERIES
// ============================================

// Get all bids with pagination and filters
export const getAllBids = async (limit = 50, offset = 0, filters = {}) => {
  let whereClause = ' WHERE 1=1';
  const params = [];
  let paramCount = 0;

  if (filters.status) {
    paramCount++;
    whereClause += ` AND b.status = $${paramCount}`;
    params.push(filters.status);
  }

  if (filters.search) {
    paramCount++;
    whereClause += ` AND (j.title ILIKE $${paramCount} OR ep.company_name ILIKE $${paramCount} OR u.first_name ILIKE $${paramCount} OR u.last_name ILIKE $${paramCount})`;
    params.push(`%${filters.search}%`);
  }

  if (filters.minAmount) {
    paramCount++;
    whereClause += ` AND b.amount >= $${paramCount}`;
    params.push(filters.minAmount);
  }

  if (filters.maxAmount) {
    paramCount++;
    whereClause += ` AND b.amount <= $${paramCount}`;
    params.push(filters.maxAmount);
  }

  if (filters.startDate) {
    paramCount++;
    whereClause += ` AND b.created_at >= $${paramCount}`;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    paramCount++;
    whereClause += ` AND b.created_at <= $${paramCount}`;
    params.push(filters.endDate);
  }

  if (filters.isFlagged !== undefined) {
    paramCount++;
    whereClause += ` AND b.is_flagged = $${paramCount}`;
    params.push(filters.isFlagged);
  }

  // Count query
  const countQuery = `
    SELECT COUNT(*) as total
    FROM bids b
    LEFT JOIN jobs j ON b.job_id = j.id
    LEFT JOIN entrepreneur_profiles ep ON b.entrepreneur_id = ep.id
    LEFT JOIN users u ON ep.user_id = u.id
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Main query
  let query = `
    SELECT
      b.id, b.job_id, b.entrepreneur_id, b.amount, b.message, b.status,
      b.is_flagged, b.flag_reason, b.admin_notes,
      b.created_at, b.updated_at,
      j.id as job_id,
      j.title as job_title,
      j.category as job_category,
      j.status as job_status,
      j.budget_min, j.budget_max,
      ep.company_name as entrepreneur_company,
      ep.license_number,
      ep.average_rating,
      ep.total_reviews,
      u.id as entrepreneur_user_id,
      u.first_name as entrepreneur_first_name,
      u.last_name as entrepreneur_last_name,
      u.email as entrepreneur_email,
      mu.id as manager_user_id,
      mu.first_name as manager_first_name,
      mu.last_name as manager_last_name,
      mu.email as manager_email,
      mp.company_name as manager_company
    FROM bids b
    LEFT JOIN jobs j ON b.job_id = j.id
    LEFT JOIN entrepreneur_profiles ep ON b.entrepreneur_id = ep.id
    LEFT JOIN users u ON ep.user_id = u.id
    LEFT JOIN manager_profiles mp ON j.manager_id = mp.id
    LEFT JOIN users mu ON mp.user_id = mu.id
    ${whereClause}
  `;

  // Add pagination
  query += ` ORDER BY b.created_at DESC`;
  paramCount++;
  query += ` LIMIT $${paramCount}`;
  params.push(limit);
  paramCount++;
  query += ` OFFSET $${paramCount}`;
  params.push(offset);

  const result = await pool.query(query, params);
  return { bids: result.rows, total };
};

// Get bid by ID with full details
export const getBidByIdAdmin = async (bidId) => {
  const result = await pool.query(`
    SELECT
      b.*,
      j.id as job_id,
      j.title as job_title,
      j.description as job_description,
      j.category as job_category,
      j.urgency as job_urgency,
      j.status as job_status,
      j.budget_min, j.budget_max,
      j.due_date as job_due_date,
      j.created_at as job_created_at,
      ep.company_name as entrepreneur_company,
      ep.license_number,
      ep.years_in_business,
      ep.average_rating,
      ep.total_reviews,
      ep.specializations,
      u.id as entrepreneur_user_id,
      u.first_name as entrepreneur_first_name,
      u.last_name as entrepreneur_last_name,
      u.email as entrepreneur_email,
      u.phone as entrepreneur_phone,
      mu.id as manager_user_id,
      mu.first_name as manager_first_name,
      mu.last_name as manager_last_name,
      mu.email as manager_email,
      mu.phone as manager_phone,
      mp.company_name as manager_company,
      p.address as property_address,
      p.city as property_city,
      bu.unlocked_at as budget_unlocked_at
    FROM bids b
    LEFT JOIN jobs j ON b.job_id = j.id
    LEFT JOIN entrepreneur_profiles ep ON b.entrepreneur_id = ep.id
    LEFT JOIN users u ON ep.user_id = u.id
    LEFT JOIN manager_profiles mp ON j.manager_id = mp.id
    LEFT JOIN users mu ON mp.user_id = mu.id
    LEFT JOIN properties p ON j.property_id = p.id
    LEFT JOIN budget_unlocks bu ON bu.entrepreneur_id = b.entrepreneur_id AND bu.job_id = b.job_id
    WHERE b.id = $1
  `, [bidId]);
  return result.rows[0];
};

// Get bid statistics for admin dashboard
export const getAdminBidStats = async () => {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_bids,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_bids,
      COUNT(*) FILTER (WHERE status = 'approved') as approved_bids,
      COUNT(*) FILTER (WHERE status = 'declined') as declined_bids,
      COUNT(*) FILTER (WHERE is_flagged = true) as flagged_bids,
      COALESCE(AVG(amount), 0) as average_bid_amount,
      COALESCE(
        ROUND(
          (COUNT(*) FILTER (WHERE status = 'approved')::numeric / NULLIF(COUNT(*), 0)) * 100,
          1
        ),
        0
      ) as acceptance_rate
    FROM bids
  `);
  return result.rows[0];
};

// Flag a bid
export const flagBid = async (bidId, reason, adminId) => {
  const result = await pool.query(`
    UPDATE bids
    SET is_flagged = true, flag_reason = $2, flagged_by = $3, flagged_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [bidId, reason, adminId]);
  return result.rows[0];
};

// Unflag a bid
export const unflagBid = async (bidId) => {
  const result = await pool.query(`
    UPDATE bids
    SET is_flagged = false, flag_reason = NULL, flagged_by = NULL, flagged_at = NULL
    WHERE id = $1
    RETURNING *
  `, [bidId]);
  return result.rows[0];
};

// Add admin notes to a bid
export const addBidAdminNotes = async (bidId, notes) => {
  const result = await pool.query(`
    UPDATE bids
    SET admin_notes = $2
    WHERE id = $1
    RETURNING *
  `, [bidId, notes]);
  return result.rows[0];
};

// ============================================
// PROPERTY MANAGEMENT QUERIES
// ============================================

// Get all properties with pagination and filters
export const getAllAdminProperties = async (limit = 50, offset = 0, filters = {}) => {
  let whereClause = ' WHERE 1=1';
  const params = [];
  let paramCount = 0;

  if (filters.search) {
    paramCount++;
    whereClause += ` AND (p.address ILIKE $${paramCount} OR p.building_name ILIKE $${paramCount} OR p.city ILIKE $${paramCount} OR mp.company_name ILIKE $${paramCount})`;
    params.push(`%${filters.search}%`);
  }

  if (filters.city) {
    paramCount++;
    whereClause += ` AND p.city = $${paramCount}`;
    params.push(filters.city);
  }

  if (filters.buildingType) {
    paramCount++;
    whereClause += ` AND p.building_type = $${paramCount}`;
    params.push(filters.buildingType);
  }

  if (filters.hasActiveJobs === 'true') {
    whereClause += ` AND EXISTS (SELECT 1 FROM jobs j WHERE j.property_id = p.id AND LOWER(j.status) IN ('open', 'ongoing', 'in progress', 'pending', 'accepted'))`;
  } else if (filters.hasActiveJobs === 'false') {
    whereClause += ` AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.property_id = p.id AND LOWER(j.status) IN ('open', 'ongoing', 'in progress', 'pending', 'accepted'))`;
  }

  if (filters.isFlagged !== undefined) {
    paramCount++;
    whereClause += ` AND p.is_flagged = $${paramCount}`;
    params.push(filters.isFlagged);
  }

  // Count query
  const countQuery = `
    SELECT COUNT(*) as total
    FROM properties p
    LEFT JOIN manager_profiles mp ON p.manager_id = mp.id
    LEFT JOIN users u ON mp.user_id = u.id
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Main query with job counts
  let query = `
    SELECT
      p.id, p.manager_id, p.address, p.city, p.province, p.postal_code,
      p.num_units, p.building_type, p.building_name,
      p.is_flagged, p.flag_reason, p.admin_notes,
      p.created_at, p.updated_at,
      mp.company_name as manager_company,
      u.id as manager_user_id,
      u.first_name as manager_first_name,
      u.last_name as manager_last_name,
      u.email as manager_email,
      COUNT(DISTINCT j.id) as total_jobs,
      COUNT(DISTINCT CASE WHEN LOWER(j.status) IN ('open', 'ongoing', 'in progress', 'pending', 'accepted') THEN j.id END) as active_jobs
    FROM properties p
    LEFT JOIN manager_profiles mp ON p.manager_id = mp.id
    LEFT JOIN users u ON mp.user_id = u.id
    LEFT JOIN jobs j ON j.property_id = p.id
    ${whereClause}
    GROUP BY p.id, mp.company_name, u.id, u.first_name, u.last_name, u.email
  `;

  // Add pagination
  query += ` ORDER BY p.created_at DESC`;
  paramCount++;
  query += ` LIMIT $${paramCount}`;
  params.push(limit);
  paramCount++;
  query += ` OFFSET $${paramCount}`;
  params.push(offset);

  const result = await pool.query(query, params);
  return { properties: result.rows, total };
};

// Get property by ID with full details
export const getPropertyByIdAdmin = async (propertyId) => {
  const result = await pool.query(`
    SELECT
      p.*,
      mp.company_name as manager_company,
      u.phone as manager_phone,
      u.id as manager_user_id,
      u.first_name as manager_first_name,
      u.last_name as manager_last_name,
      u.email as manager_email,
      COUNT(DISTINCT j.id) as total_jobs,
      COUNT(DISTINCT CASE WHEN LOWER(j.status) IN ('open', 'ongoing', 'in progress', 'pending', 'accepted') THEN j.id END) as active_jobs,
      COUNT(DISTINCT CASE WHEN LOWER(j.status) IN ('completed', 'closed', 'done') THEN j.id END) as completed_jobs
    FROM properties p
    LEFT JOIN manager_profiles mp ON p.manager_id = mp.id
    LEFT JOIN users u ON mp.user_id = u.id
    LEFT JOIN jobs j ON j.property_id = p.id
    WHERE p.id = $1
    GROUP BY p.id, mp.company_name, u.id, u.first_name, u.last_name, u.email, u.phone
  `, [propertyId]);
  return result.rows[0];
};

// Get property statistics for admin dashboard
export const getAdminPropertyStats = async () => {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_properties,
      COUNT(DISTINCT CASE WHEN EXISTS (
        SELECT 1 FROM jobs j WHERE j.property_id = p.id AND LOWER(j.status) IN ('open', 'ongoing', 'in progress', 'pending', 'accepted')
      ) THEN p.id END) as properties_with_active_jobs,
      SUM(p.num_units) as total_units,
      COUNT(*) FILTER (WHERE p.is_flagged = true) as flagged_properties
    FROM properties p
  `);

  // Get top city
  const topCityResult = await pool.query(`
    SELECT city, COUNT(*) as count
    FROM properties
    WHERE city IS NOT NULL
    GROUP BY city
    ORDER BY count DESC
    LIMIT 1
  `);

  return {
    ...result.rows[0],
    top_city: topCityResult.rows[0]?.city || 'N/A',
    top_city_count: topCityResult.rows[0]?.count || 0
  };
};

// Get jobs for a property (only jobs directly linked to this property)
export const getPropertyJobs = async (propertyId) => {
  const result = await pool.query(`
    SELECT
      j.id, j.title, j.category, j.status, j.urgency,
      j.budget_min, j.budget_max, j.is_budget_hidden,
      j.created_at, j.due_date,
      COUNT(b.id) as bid_count
    FROM jobs j
    LEFT JOIN bids b ON j.id = b.job_id
    WHERE j.property_id = $1
    GROUP BY j.id
    ORDER BY j.created_at DESC
  `, [propertyId]);
  return result.rows;
};

// Get cities for filter dropdown
export const getPropertyCities = async () => {
  const result = await pool.query(`
    SELECT DISTINCT city FROM properties WHERE city IS NOT NULL ORDER BY city
  `);
  return result.rows.map(r => r.city);
};

// Get building types for filter dropdown
export const getBuildingTypes = async () => {
  const result = await pool.query(`
    SELECT DISTINCT building_type FROM properties WHERE building_type IS NOT NULL ORDER BY building_type
  `);
  return result.rows.map(r => r.building_type);
};

// Flag a property
export const flagProperty = async (propertyId, reason, adminId) => {
  const result = await pool.query(`
    UPDATE properties
    SET is_flagged = true, flag_reason = $2, flagged_by = $3, flagged_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [propertyId, reason, adminId]);
  return result.rows[0];
};

// Unflag a property
export const unflagProperty = async (propertyId) => {
  const result = await pool.query(`
    UPDATE properties
    SET is_flagged = false, flag_reason = NULL, flagged_by = NULL, flagged_at = NULL
    WHERE id = $1
    RETURNING *
  `, [propertyId]);
  return result.rows[0];
};

// Add admin notes to a property
export const addPropertyAdminNotes = async (propertyId, notes) => {
  const result = await pool.query(`
    UPDATE properties
    SET admin_notes = $2
    WHERE id = $1
    RETURNING *
  `, [propertyId, notes]);
  return result.rows[0];
};

// ============================================
// TRANSACTIONS / PAYMENTS QUERIES
// ============================================

// Get transaction statistics
export const getTransactionStats = async () => {
  const UNLOCK_FEE = 20; // $20 per budget unlock (consistent with Dashboard)

  // Get budget unlock counts
  const budgetUnlockStats = await pool.query(`
    SELECT
      COUNT(*) as total_count,
      COUNT(CASE WHEN status = 'succeeded' THEN 1 END) as succeeded_count,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
      COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_count,
      COUNT(CASE WHEN unlocked_at >= DATE_TRUNC('month', NOW()) AND status = 'succeeded' THEN 1 END) as monthly_succeeded,
      COUNT(CASE WHEN unlocked_at >= DATE_TRUNC('week', NOW()) AND status = 'succeeded' THEN 1 END) as weekly_succeeded,
      COUNT(CASE WHEN DATE(unlocked_at) = CURRENT_DATE AND status = 'succeeded' THEN 1 END) as today_succeeded
    FROM budget_unlocks
  `);

  // Get subscription stats
  const subscriptionStats = await pool.query(`
    SELECT
      COUNT(*) as total_subscriptions,
      COUNT(CASE WHEN status = 'active' THEN 1 END) as active_subscriptions,
      COUNT(CASE WHEN status = 'canceled' OR status = 'cancelled' THEN 1 END) as canceled_subscriptions,
      COUNT(CASE WHEN status = 'past_due' THEN 1 END) as past_due_subscriptions
    FROM subscriptions
  `);

  const stats = budgetUnlockStats.rows[0];

  // Calculate revenue based on count * $20 (consistent with Dashboard)
  return {
    budgetUnlocks: {
      total_count: parseInt(stats.total_count) || 0,
      succeeded_count: parseInt(stats.succeeded_count) || 0,
      pending_count: parseInt(stats.pending_count) || 0,
      failed_count: parseInt(stats.failed_count) || 0,
      refunded_count: parseInt(stats.refunded_count) || 0,
      total_revenue: (parseInt(stats.succeeded_count) || 0) * UNLOCK_FEE,
      monthly_revenue: (parseInt(stats.monthly_succeeded) || 0) * UNLOCK_FEE,
      weekly_revenue: (parseInt(stats.weekly_succeeded) || 0) * UNLOCK_FEE,
      today_revenue: (parseInt(stats.today_succeeded) || 0) * UNLOCK_FEE
    },
    subscriptions: subscriptionStats.rows[0]
  };
};

// Get all budget unlocks with pagination and filters
export const getAllBudgetUnlocks = async (limit = 50, offset = 0, filters = {}) => {
  let whereClause = ' WHERE 1=1';
  const params = [];
  let paramCount = 0;

  if (filters.status) {
    paramCount++;
    whereClause += ` AND bu.status = $${paramCount}`;
    params.push(filters.status);
  }

  if (filters.search) {
    paramCount++;
    whereClause += ` AND (
      u.email ILIKE $${paramCount} OR
      u.first_name ILIKE $${paramCount} OR
      u.last_name ILIKE $${paramCount} OR
      ep.company_name ILIKE $${paramCount} OR
      j.title ILIKE $${paramCount}
    )`;
    params.push(`%${filters.search}%`);
  }

  if (filters.dateFrom) {
    paramCount++;
    whereClause += ` AND bu.unlocked_at >= $${paramCount}`;
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    paramCount++;
    whereClause += ` AND bu.unlocked_at <= $${paramCount}`;
    params.push(filters.dateTo);
  }

  if (filters.minAmount) {
    paramCount++;
    whereClause += ` AND bu.amount >= $${paramCount}`;
    params.push(filters.minAmount);
  }

  if (filters.maxAmount) {
    paramCount++;
    whereClause += ` AND bu.amount <= $${paramCount}`;
    params.push(filters.maxAmount);
  }

  // Count query
  const countQuery = `
    SELECT COUNT(*) as total
    FROM budget_unlocks bu
    LEFT JOIN entrepreneur_profiles ep ON bu.entrepreneur_id = ep.id
    LEFT JOIN users u ON ep.user_id = u.id
    LEFT JOIN jobs j ON bu.job_id = j.id
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Main query - amount divided by 100 to convert cents to dollars
  let query = `
    SELECT
      bu.id,
      (bu.amount / 100.0) as amount,
      bu.payment_id,
      bu.stripe_payment_intent_id,
      bu.status,
      bu.unlocked_at,
      bu.created_at,
      bu.entrepreneur_id,
      bu.job_id,
      ep.company_name as entrepreneur_company,
      ep.license_number as entrepreneur_license,
      u.id as entrepreneur_user_id,
      u.first_name as entrepreneur_first_name,
      u.last_name as entrepreneur_last_name,
      u.email as entrepreneur_email,
      j.title as job_title,
      j.category as job_category,
      j.budget_min,
      j.budget_max,
      j.status as job_status,
      mu.first_name as manager_first_name,
      mu.last_name as manager_last_name,
      mp.company_name as manager_company
    FROM budget_unlocks bu
    LEFT JOIN entrepreneur_profiles ep ON bu.entrepreneur_id = ep.id
    LEFT JOIN users u ON ep.user_id = u.id
    LEFT JOIN jobs j ON bu.job_id = j.id
    LEFT JOIN manager_profiles mp ON j.manager_id = mp.id
    LEFT JOIN users mu ON mp.user_id = mu.id
    ${whereClause}
  `;

  // Add pagination
  query += ` ORDER BY bu.unlocked_at DESC`;
  paramCount++;
  query += ` LIMIT $${paramCount}`;
  params.push(limit);
  paramCount++;
  query += ` OFFSET $${paramCount}`;
  params.push(offset);

  const result = await pool.query(query, params);
  return { transactions: result.rows, total };
};

// Get budget unlock by ID - amount divided by 100 to convert cents to dollars
export const getBudgetUnlockById = async (id) => {
  const result = await pool.query(`
    SELECT
      bu.id,
      (bu.amount / 100.0) as amount,
      bu.payment_id,
      bu.stripe_payment_intent_id,
      bu.status,
      bu.unlocked_at,
      bu.created_at,
      bu.entrepreneur_id,
      bu.job_id,
      ep.company_name as entrepreneur_company,
      ep.license_number as entrepreneur_license,
      ep.average_rating as entrepreneur_rating,
      ep.total_reviews as entrepreneur_reviews,
      u.id as entrepreneur_user_id,
      u.first_name as entrepreneur_first_name,
      u.last_name as entrepreneur_last_name,
      u.email as entrepreneur_email,
      u.phone as entrepreneur_phone,
      j.id as job_id,
      j.title as job_title,
      j.description as job_description,
      j.category as job_category,
      j.budget_min,
      j.budget_max,
      j.status as job_status,
      j.urgency as job_urgency,
      j.due_date as job_due_date,
      j.created_at as job_created_at,
      p.address as property_address,
      p.city as property_city,
      p.building_name as property_building,
      mu.id as manager_user_id,
      mu.first_name as manager_first_name,
      mu.last_name as manager_last_name,
      mu.email as manager_email,
      mp.company_name as manager_company
    FROM budget_unlocks bu
    LEFT JOIN entrepreneur_profiles ep ON bu.entrepreneur_id = ep.id
    LEFT JOIN users u ON ep.user_id = u.id
    LEFT JOIN jobs j ON bu.job_id = j.id
    LEFT JOIN properties p ON j.property_id = p.id
    LEFT JOIN manager_profiles mp ON j.manager_id = mp.id
    LEFT JOIN users mu ON mp.user_id = mu.id
    WHERE bu.id = $1
  `, [id]);
  return result.rows[0];
};

// Get revenue over time for charts (budget unlocks only)
export const getTransactionRevenueOverTime = async (period = 'day') => {
  const UNLOCK_FEE = 20; // $20 per budget unlock (consistent with Dashboard)
  let dateTrunc, interval;

  switch (period) {
    case 'day':
      dateTrunc = 'day';
      interval = '30 days';
      break;
    case 'week':
      dateTrunc = 'week';
      interval = '12 weeks';
      break;
    case 'month':
      dateTrunc = 'month';
      interval = '12 months';
      break;
    default:
      dateTrunc = 'day';
      interval = '30 days';
  }

  const result = await pool.query(`
    SELECT
      DATE_TRUNC('${dateTrunc}', unlocked_at) as period,
      COUNT(*) as count
    FROM budget_unlocks
    WHERE unlocked_at >= NOW() - INTERVAL '${interval}'
      AND status = 'succeeded'
    GROUP BY DATE_TRUNC('${dateTrunc}', unlocked_at)
    ORDER BY period ASC
  `);

  // Calculate revenue as count * $20 (consistent with Dashboard)
  return result.rows.map(row => ({
    period: row.period,
    count: parseInt(row.count) || 0,
    revenue: (parseInt(row.count) || 0) * UNLOCK_FEE
  }));
};

// Get all subscriptions with pagination and filters
export const getAllSubscriptions = async (limit = 50, offset = 0, filters = {}) => {
  let whereClause = ' WHERE 1=1';
  const params = [];
  let paramCount = 0;

  if (filters.status) {
    paramCount++;
    whereClause += ` AND s.status = $${paramCount}`;
    params.push(filters.status);
  }

  if (filters.plan_type) {
    paramCount++;
    whereClause += ` AND s.plan_type = $${paramCount}`;
    params.push(filters.plan_type);
  }

  if (filters.search) {
    paramCount++;
    whereClause += ` AND (
      u.email ILIKE $${paramCount} OR
      u.first_name ILIKE $${paramCount} OR
      u.last_name ILIKE $${paramCount} OR
      ep.company_name ILIKE $${paramCount}
    )`;
    params.push(`%${filters.search}%`);
  }

  // Count query
  const countQuery = `
    SELECT COUNT(*) as total
    FROM subscriptions s
    LEFT JOIN entrepreneur_profiles ep ON s.entrepreneur_profile_id = ep.id
    LEFT JOIN users u ON ep.user_id = u.id
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Main query
  let query = `
    SELECT
      s.id,
      s.stripe_customer_id,
      s.stripe_subscription_id,
      s.plan_type,
      s.status,
      s.trial_end,
      s.current_period_start,
      s.current_period_end,
      s.cancel_at_period_end,
      s.canceled_at,
      s.created_at,
      s.updated_at,
      ep.id as entrepreneur_profile_id,
      ep.company_name as entrepreneur_company,
      ep.license_number as entrepreneur_license,
      u.id as user_id,
      u.first_name,
      u.last_name,
      u.email
    FROM subscriptions s
    LEFT JOIN entrepreneur_profiles ep ON s.entrepreneur_profile_id = ep.id
    LEFT JOIN users u ON ep.user_id = u.id
    ${whereClause}
  `;

  // Add pagination
  query += ` ORDER BY s.created_at DESC`;
  paramCount++;
  query += ` LIMIT $${paramCount}`;
  params.push(limit);
  paramCount++;
  query += ` OFFSET $${paramCount}`;
  params.push(offset);

  const result = await pool.query(query, params);
  return { subscriptions: result.rows, total };
};

// Get subscription growth over time
export const getSubscriptionGrowthOverTime = async (period = 'day') => {
  let dateFormat, dateInterval, limit;

  switch (period) {
    case 'week':
      dateFormat = "YYYY-MM-DD";
      dateInterval = "7 days";
      limit = 12; // 12 weeks
      break;
    case 'month':
      dateFormat = "YYYY-MM";
      dateInterval = "1 month";
      limit = 12; // 12 months
      break;
    default: // day
      dateFormat = "YYYY-MM-DD";
      dateInterval = "1 day";
      limit = 30; // 30 days
  }

  const query = `
    WITH date_series AS (
      SELECT generate_series(
        date_trunc('${period === 'month' ? 'month' : 'day'}', NOW() - INTERVAL '${limit} ${period === 'month' ? 'months' : period === 'week' ? 'weeks' : 'days'}'),
        date_trunc('${period === 'month' ? 'month' : 'day'}', NOW()),
        INTERVAL '${dateInterval}'
      )::date as period
    )
    SELECT
      ds.period,
      COALESCE(COUNT(s.id) FILTER (WHERE s.created_at::date <= ds.period AND (s.canceled_at IS NULL OR s.canceled_at::date > ds.period)), 0) as total,
      COALESCE(COUNT(s.id) FILTER (WHERE s.created_at::date <= ds.period AND s.status = 'active' AND (s.canceled_at IS NULL OR s.canceled_at::date > ds.period)), 0) as active,
      COALESCE(COUNT(s.id) FILTER (WHERE date_trunc('${period === 'month' ? 'month' : 'day'}', s.created_at) = ds.period), 0) as new_subscriptions
    FROM date_series ds
    LEFT JOIN subscriptions s ON TRUE
    GROUP BY ds.period
    ORDER BY ds.period ASC
  `;

  const result = await pool.query(query);
  return result.rows.map(row => ({
    period: row.period,
    total: parseInt(row.total) || 0,
    active: parseInt(row.active) || 0,
    newSubscriptions: parseInt(row.new_subscriptions) || 0
  }));
};

// Get subscription stats with MRR calculation
export const getDetailedSubscriptionStats = async () => {
  const BASIC_PRICE = 250;
  const PREMIUM_PRICE = 429;

  const result = await pool.query(`
    SELECT
      COUNT(*) as total_subscriptions,
      COUNT(*) FILTER (WHERE status = 'active') as active_subscriptions,
      COUNT(*) FILTER (WHERE plan_type = 'basic' AND status = 'active') as basic_plans,
      COUNT(*) FILTER (WHERE plan_type = 'premium' AND status = 'active') as premium_plans,
      COUNT(*) FILTER (WHERE status = 'canceled') as canceled_subscriptions,
      COUNT(*) FILTER (WHERE status = 'past_due') as past_due_subscriptions,
      COUNT(*) FILTER (WHERE trial_end IS NOT NULL AND trial_end > NOW()) as trialing_subscriptions,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) as new_this_month,
      COUNT(*) FILTER (WHERE canceled_at >= date_trunc('month', CURRENT_DATE)) as canceled_this_month
    FROM subscriptions
  `);

  const stats = result.rows[0];
  const basicCount = parseInt(stats.basic_plans) || 0;
  const premiumCount = parseInt(stats.premium_plans) || 0;
  const mrr = (basicCount * BASIC_PRICE) + (premiumCount * PREMIUM_PRICE);

  return {
    total: parseInt(stats.total_subscriptions) || 0,
    active: parseInt(stats.active_subscriptions) || 0,
    basicPlans: basicCount,
    premiumPlans: premiumCount,
    canceled: parseInt(stats.canceled_subscriptions) || 0,
    pastDue: parseInt(stats.past_due_subscriptions) || 0,
    trialing: parseInt(stats.trialing_subscriptions) || 0,
    newThisMonth: parseInt(stats.new_this_month) || 0,
    canceledThisMonth: parseInt(stats.canceled_this_month) || 0,
    mrr: mrr,
    arr: mrr * 12
  };
};

// Get plan distribution for pie chart
export const getPlanDistribution = async () => {
  const result = await pool.query(`
    SELECT
      plan_type,
      status,
      COUNT(*) as count
    FROM subscriptions
    WHERE status IN ('active', 'trialing')
    GROUP BY plan_type, status
    ORDER BY plan_type, status
  `);

  return result.rows.map(row => ({
    planType: row.plan_type,
    status: row.status,
    count: parseInt(row.count) || 0
  }));
};

// Get subscription by ID with full details
export const getSubscriptionById = async (subscriptionId) => {
  const result = await pool.query(`
    SELECT
      s.*,
      ep.id as entrepreneur_profile_id,
      ep.company_name as entrepreneur_company,
      ep.license_number as entrepreneur_license,
      ep.profile_image,
      u.id as user_id,
      u.first_name,
      u.last_name,
      u.email,
      u.status as user_status
    FROM subscriptions s
    LEFT JOIN entrepreneur_profiles ep ON s.entrepreneur_profile_id = ep.id
    LEFT JOIN users u ON ep.user_id = u.id
    WHERE s.id = $1
  `, [subscriptionId]);

  return result.rows[0] || null;
};

// Extend trial period
export const extendSubscriptionTrial = async (subscriptionId, days) => {
  const result = await pool.query(`
    UPDATE subscriptions
    SET
      trial_end = COALESCE(trial_end, NOW()) + INTERVAL '${parseInt(days)} days',
      status = 'trialing',
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [subscriptionId]);

  return result.rows[0] || null;
};

// End trial immediately (convert to active or cancel)
export const endSubscriptionTrial = async (subscriptionId, convertToActive = true) => {
  if (convertToActive) {
    // Convert trial to active subscription
    const result = await pool.query(`
      UPDATE subscriptions
      SET
        trial_end = NOW(),
        status = 'active',
        current_period_start = NOW(),
        current_period_end = NOW() + INTERVAL '1 month',
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [subscriptionId]);
    return result.rows[0] || null;
  } else {
    // Cancel the trial
    const result = await pool.query(`
      UPDATE subscriptions
      SET
        trial_end = NOW(),
        status = 'canceled',
        canceled_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [subscriptionId]);
    return result.rows[0] || null;
  }
};

// Cancel subscription
export const cancelSubscription = async (subscriptionId, immediate = false) => {
  if (immediate) {
    const result = await pool.query(`
      UPDATE subscriptions
      SET
        status = 'canceled',
        canceled_at = NOW(),
        cancel_at_period_end = false,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [subscriptionId]);
    return result.rows[0] || null;
  } else {
    const result = await pool.query(`
      UPDATE subscriptions
      SET
        cancel_at_period_end = true,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [subscriptionId]);
    return result.rows[0] || null;
  }
};

// Reactivate subscription
export const reactivateSubscription = async (subscriptionId) => {
  const result = await pool.query(`
    UPDATE subscriptions
    SET
      status = 'active',
      canceled_at = NULL,
      cancel_at_period_end = false,
      current_period_start = NOW(),
      current_period_end = NOW() + INTERVAL '1 month',
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [subscriptionId]);

  return result.rows[0] || null;
};

// Change subscription plan
export const changeSubscriptionPlan = async (subscriptionId, newPlanType) => {
  const result = await pool.query(`
    UPDATE subscriptions
    SET
      plan_type = $2,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [subscriptionId, newPlanType]);

  return result.rows[0] || null;
};

// Add admin notes to subscription
export const addSubscriptionAdminNotes = async (subscriptionId, notes, adminId) => {
  // First check if admin_notes column exists, if not we'll store in a separate structure
  const result = await pool.query(`
    UPDATE subscriptions
    SET
      admin_notes = COALESCE(admin_notes, '[]'::jsonb) || $2::jsonb,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [subscriptionId, JSON.stringify([{ note: notes, admin_id: adminId, created_at: new Date().toISOString() }])]);

  return result.rows[0] || null;
};

// ============================================
// SUPPORT TICKET MANAGEMENT
// ============================================

// Get all support tickets (admin)
export const getAllSupportTickets = async (limit = 50, offset = 0, filters = {}) => {
  let query = `
    SELECT
      st.id,
      st.ticket_number,
      st.user_id,
      st.subject,
      st.description,
      st.category,
      st.priority,
      st.status,
      st.assigned_to,
      st.created_at,
      st.updated_at,
      st.resolved_at,
      u.first_name as user_first_name,
      u.last_name as user_last_name,
      u.email as user_email,
      u.role as user_role,
      (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = st.id) as message_count
    FROM support_tickets st
    LEFT JOIN users u ON st.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  if (filters.search) {
    query += ` AND (
      st.subject ILIKE $${paramIndex} OR
      st.ticket_number ILIKE $${paramIndex} OR
      u.email ILIKE $${paramIndex} OR
      u.first_name ILIKE $${paramIndex} OR
      u.last_name ILIKE $${paramIndex}
    )`;
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  if (filters.status) {
    query += ` AND st.status = $${paramIndex}`;
    params.push(filters.status);
    paramIndex++;
  }

  if (filters.priority) {
    query += ` AND st.priority = $${paramIndex}`;
    params.push(filters.priority);
    paramIndex++;
  }

  if (filters.category) {
    query += ` AND st.category = $${paramIndex}`;
    params.push(filters.category);
    paramIndex++;
  }

  // Count query
  const countQuery = query.replace(
    /SELECT[\s\S]*?FROM support_tickets/,
    'SELECT COUNT(*) as total FROM support_tickets'
  );
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total || 0);

  // Add sorting and pagination
  query += ` ORDER BY st.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  return {
    tickets: result.rows,
    pagination: {
      total,
      limit,
      offset,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Get support ticket by ID (admin)
export const getSupportTicketById = async (ticketId) => {
  const result = await pool.query(`
    SELECT
      st.*,
      u.first_name as user_first_name,
      u.last_name as user_last_name,
      u.email as user_email,
      u.role as user_role
    FROM support_tickets st
    LEFT JOIN users u ON st.user_id = u.id
    WHERE st.id = $1
  `, [ticketId]);

  return result.rows[0] || null;
};

// Get ticket messages (admin - includes internal notes)
export const getTicketMessagesAdmin = async (ticketId) => {
  const result = await pool.query(`
    SELECT
      tm.id,
      tm.message,
      tm.sender_type,
      tm.sender_id,
      tm.is_internal,
      tm.created_at
    FROM ticket_messages tm
    WHERE tm.ticket_id = $1
    ORDER BY tm.created_at ASC
  `, [ticketId]);

  return result.rows;
};

// Add admin reply to ticket
export const addAdminTicketMessage = async (ticketId, adminId, message, isInternal = false) => {
  const result = await pool.query(`
    INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message, is_internal)
    VALUES ($1, 'admin', $2, $3, $4)
    RETURNING *
  `, [ticketId, adminId, message, isInternal]);

  // Update ticket status if it's currently open
  await pool.query(`
    UPDATE support_tickets
    SET
      status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
      updated_at = NOW()
    WHERE id = $1
  `, [ticketId]);

  return result.rows[0];
};

// Update ticket status
export const updateTicketStatus = async (ticketId, status, adminId) => {
  const resolvedAt = status === 'resolved' ? 'NOW()' : 'NULL';

  const result = await pool.query(`
    UPDATE support_tickets
    SET
      status = $1,
      assigned_to = COALESCE(assigned_to, $2),
      resolved_at = ${status === 'resolved' ? 'NOW()' : 'resolved_at'},
      updated_at = NOW()
    WHERE id = $3
    RETURNING *
  `, [status, adminId, ticketId]);

  return result.rows[0];
};

// ============================================
// DISPUTE MANAGEMENT QUERIES
// ============================================

// Get all disputes with pagination and filters
export const getAllDisputes = async (limit = 50, offset = 0, filters = {}) => {
  let query = `
    SELECT
      d.id,
      d.dispute_number,
      d.job_id,
      d.reporter_id,
      d.reported_id,
      d.type,
      d.reason,
      d.evidence,
      d.status,
      d.priority,
      d.resolution,
      d.resolution_type,
      d.resolved_by,
      d.resolved_at,
      d.admin_notes,
      d.created_at,
      d.updated_at,
      j.title as job_title,
      j.status as job_status,
      reporter.first_name as reporter_first_name,
      reporter.last_name as reporter_last_name,
      reporter.email as reporter_email,
      reporter.role as reporter_role,
      reported.first_name as reported_first_name,
      reported.last_name as reported_last_name,
      reported.email as reported_email,
      reported.role as reported_role,
      resolver.name as resolved_by_name
    FROM disputes d
    LEFT JOIN jobs j ON d.job_id = j.id
    LEFT JOIN users reporter ON d.reporter_id = reporter.id
    LEFT JOIN users reported ON d.reported_id = reported.id
    LEFT JOIN admin_users resolver ON d.resolved_by = resolver.id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  if (filters.search) {
    query += ` AND (
      d.reason ILIKE $${paramIndex} OR
      CAST(d.dispute_number AS TEXT) ILIKE $${paramIndex} OR
      j.title ILIKE $${paramIndex} OR
      reporter.email ILIKE $${paramIndex} OR
      reported.email ILIKE $${paramIndex} OR
      reporter.first_name ILIKE $${paramIndex} OR
      reporter.last_name ILIKE $${paramIndex} OR
      reported.first_name ILIKE $${paramIndex} OR
      reported.last_name ILIKE $${paramIndex}
    )`;
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  if (filters.status) {
    query += ` AND d.status = $${paramIndex}`;
    params.push(filters.status);
    paramIndex++;
  }

  if (filters.type) {
    query += ` AND d.type = $${paramIndex}`;
    params.push(filters.type);
    paramIndex++;
  }

  if (filters.priority) {
    query += ` AND d.priority = $${paramIndex}`;
    params.push(filters.priority);
    paramIndex++;
  }

  // Count query
  const countQuery = query.replace(
    /SELECT[\s\S]*?FROM disputes/,
    'SELECT COUNT(*) as total FROM disputes'
  );
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total || 0);

  // Add sorting and pagination
  query += ` ORDER BY d.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  return {
    disputes: result.rows,
    pagination: {
      total,
      limit,
      offset,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Get dispute by ID with full details
export const getDisputeById = async (disputeId) => {
  const result = await pool.query(`
    SELECT
      d.*,
      j.title as job_title,
      j.description as job_description,
      j.status as job_status,
      j.category as job_category,
      j.budget_min,
      j.budget_max,
      reporter.first_name as reporter_first_name,
      reporter.last_name as reporter_last_name,
      reporter.email as reporter_email,
      reporter.role as reporter_role,
      reporter.phone as reporter_phone,
      reported.first_name as reported_first_name,
      reported.last_name as reported_last_name,
      reported.email as reported_email,
      reported.role as reported_role,
      reported.phone as reported_phone,
      resolver.name as resolved_by_name,
      resolver.email as resolved_by_email
    FROM disputes d
    LEFT JOIN jobs j ON d.job_id = j.id
    LEFT JOIN users reporter ON d.reporter_id = reporter.id
    LEFT JOIN users reported ON d.reported_id = reported.id
    LEFT JOIN admin_users resolver ON d.resolved_by = resolver.id
    WHERE d.id = $1
  `, [disputeId]);

  return result.rows[0] || null;
};

// Get dispute statistics
export const getDisputeStats = async () => {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_disputes,
      COUNT(*) FILTER (WHERE status = 'open') as open_disputes,
      COUNT(*) FILTER (WHERE status = 'under_review') as under_review_disputes,
      COUNT(*) FILTER (WHERE status = 'resolved') as resolved_disputes,
      COUNT(*) FILTER (WHERE status = 'closed') as closed_disputes,
      COUNT(*) FILTER (WHERE status = 'escalated') as escalated_disputes,
      COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_disputes,
      COUNT(*) FILTER (WHERE priority = 'high') as high_priority_disputes,
      COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW())) as this_month,
      COUNT(*) FILTER (WHERE resolved_at >= DATE_TRUNC('month', NOW())) as resolved_this_month
    FROM disputes
  `);

  return result.rows[0];
};

// Update dispute status
export const updateDisputeStatus = async (disputeId, status, adminId) => {
  const result = await pool.query(`
    UPDATE disputes
    SET
      status = $1,
      updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `, [status, disputeId]);

  return result.rows[0];
};

// Resolve dispute
export const resolveDispute = async (disputeId, resolution, resolutionType, adminId) => {
  const result = await pool.query(`
    UPDATE disputes
    SET
      status = 'resolved',
      resolution = $1,
      resolution_type = $2,
      resolved_by = $3,
      resolved_at = NOW(),
      updated_at = NOW()
    WHERE id = $4
    RETURNING *
  `, [resolution, resolutionType, adminId, disputeId]);

  return result.rows[0];
};

// Add admin notes to dispute
export const addDisputeAdminNotes = async (disputeId, notes) => {
  const result = await pool.query(`
    UPDATE disputes
    SET
      admin_notes = $1,
      updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `, [notes, disputeId]);

  return result.rows[0];
};

// Update dispute priority
export const updateDisputePriority = async (disputeId, priority) => {
  const result = await pool.query(`
    UPDATE disputes
    SET
      priority = $1,
      updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `, [priority, disputeId]);

  return result.rows[0];
};

// Escalate dispute
export const escalateDispute = async (disputeId, adminId) => {
  const result = await pool.query(`
    UPDATE disputes
    SET
      status = 'escalated',
      priority = 'urgent',
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [disputeId]);

  return result.rows[0];
};

// Get dispute types for filter dropdown
export const getDisputeTypes = async () => {
  const result = await pool.query(`
    SELECT DISTINCT type FROM disputes WHERE type IS NOT NULL ORDER BY type
  `);
  return result.rows.map(r => r.type);
};
