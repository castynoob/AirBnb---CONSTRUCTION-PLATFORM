// ============================================
// FAVORITES MODEL - Database Operations
// ============================================

import pool from '../config/db.js';

const favoriteModel = {
  /**
   * Add entrepreneur to favorites
   * @param {string} managerId - Property manager ID
   * @param {string} entrepreneurId - Entrepreneur Profile ID
   * @param {string} jobId - Optional job ID
   * @param {string} bidId - Optional bid ID
   * @param {string} notes - Optional notes
   * @returns {Object} Created favorite record
   */
  async addFavorite(managerId, entrepreneurId, jobId = null, bidId = null, notes = null) {
    // Allow multiple bids from same entrepreneur by including bid_id in conflict check
    const query = `
      INSERT INTO favorites (manager_id, entrepreneur_id, job_id, bid_id, notes)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT ON CONSTRAINT favorites_manager_entrepreneur_bid_unique
      DO UPDATE SET
        job_id = COALESCE($3, favorites.job_id),
        notes = COALESCE($5, favorites.notes),
        created_at = NOW()
      RETURNING *
    `;

    const values = [managerId, entrepreneurId, jobId, bidId, notes];
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  /**
   * Remove entrepreneur from favorites by bid_id
   * @param {string} managerId - Property manager ID
   * @param {string} bidId - Bid ID
   * @returns {boolean} Success status
   */
  async removeFavorite(managerId, bidId) {
    const query = `
      DELETE FROM favorites
      WHERE manager_id = $1 AND bid_id = $2
      RETURNING id
    `;

    const result = await pool.query(query, [managerId, bidId]);
    return result.rowCount > 0;
  },

  /**
   * Get all favorites for a property manager with entrepreneur details
   * @param {string} managerId - Property manager ID
   * @returns {Array} List of favorite entrepreneurs
   */
  async getFavoritesByManager(managerId) {
    const query = `
      SELECT
        f.id as favorite_id,
        f.manager_id,
        f.entrepreneur_id,
        f.job_id,
        f.bid_id,
        f.notes,
        f.created_at as favorited_at,
        ep.company_name,
        ep.license_number,
        ep.years_in_business,
        ep.specializations,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        -- Get entrepreneur's average rating (using reviewed_user_id)
        COALESCE(
          (SELECT AVG(rating)::numeric(3,1)
           FROM reviews
           WHERE reviewed_user_id = u.id),
          0
        ) as average_rating,
        -- Get review count
        COALESCE(
          (SELECT COUNT(*)
           FROM reviews
           WHERE reviewed_user_id = u.id),
          0
        ) as review_count,
        -- Get count of completed jobs
        (SELECT COUNT(DISTINCT j.id)
         FROM jobs j
         INNER JOIN bids b ON j.id = b.job_id
         WHERE b.entrepreneur_id = f.entrepreneur_id
           AND j.status = 'completed'
        ) as completed_jobs,
        -- Get subscription info
        s.plan_type as subscription_plan,
        s.status as subscription_status,
        -- Get last job info if available
        j.title as last_job_title,
        j.category as last_job_category,
        b.amount as last_bid_amount,
        b.status as bid_status
      FROM favorites f
      INNER JOIN entrepreneur_profiles ep ON f.entrepreneur_id = ep.id
      INNER JOIN users u ON ep.user_id = u.id
      LEFT JOIN subscriptions s ON f.entrepreneur_id = s.entrepreneur_profile_id AND s.status = 'active'
      LEFT JOIN bids b ON f.bid_id = b.id
      LEFT JOIN jobs j ON b.job_id = j.id
      WHERE f.manager_id = $1
      ORDER BY f.created_at DESC
    `;

    const result = await pool.query(query, [managerId]);
    return result.rows;
  },

  /**
   * Check if a specific bid is favorited by a manager
   * @param {string} managerId - Property manager ID
   * @param {string} bidId - Bid ID
   * @returns {boolean} Is favorited
   */
  async isFavorited(managerId, bidId) {
    const query = `
      SELECT EXISTS(
        SELECT 1 FROM favorites
        WHERE manager_id = $1 AND bid_id = $2
      ) as is_favorited
    `;

    const result = await pool.query(query, [managerId, bidId]);
    return result.rows[0].is_favorited;
  },

  /**
   * Get favorite count for a manager
   * @param {string} managerId - Property manager ID
   * @returns {number} Number of favorites
   */
  async getFavoriteCount(managerId) {
    const query = `
      SELECT COUNT(*) as count
      FROM favorites
      WHERE manager_id = $1
    `;

    const result = await pool.query(query, [managerId]);
    return parseInt(result.rows[0].count);
  },

  /**
   * Get all jobs where the entrepreneur has bid (for favorites page)
   * @param {string} managerId - Property manager ID
   * @param {string} entrepreneurId - Entrepreneur Profile ID
   * @returns {Array} List of jobs
   */
  async getEntrepreneurJobHistory(managerId, entrepreneurId) {
    const query = `
      SELECT
        j.id as job_id,
        j.title,
        j.description,
        j.category,
        j.status,
        j.created_at,
        b.amount as bid_amount,
        b.status as bid_status,
        b.message as bid_message,
        COALESCE(p.building_name, p.address) as property_name,
        p.address as property_address,
        p.city as property_city
      FROM jobs j
      INNER JOIN bids b ON j.id = b.job_id
      LEFT JOIN properties p ON j.property_id = p.id
      WHERE j.manager_id = $1
        AND b.entrepreneur_id = $2
      ORDER BY j.created_at DESC
      LIMIT 10
    `;

    const result = await pool.query(query, [managerId, entrepreneurId]);
    return result.rows;
  },

  /**
   * Get favorite with detailed entrepreneur info
   * @param {string} favoriteId - Favorite ID
   * @returns {Object} Favorite details
   */
  async getFavoriteById(favoriteId) {
    const query = `
      SELECT
        f.*,
        ep.company_name,
        ep.license_number,
        ep.years_in_business,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        j.title as job_title,
        b.amount as bid_amount,
        b.status as bid_status
      FROM favorites f
      INNER JOIN entrepreneur_profiles ep ON f.entrepreneur_id = ep.id
      INNER JOIN users u ON ep.user_id = u.id
      LEFT JOIN jobs j ON f.job_id = j.id
      LEFT JOIN bids b ON f.bid_id = b.id
      WHERE f.id = $1
    `;

    const result = await pool.query(query, [favoriteId]);
    return result.rows[0];
  },

  /**
   * Update favorite notes
   * @param {string} favoriteId - Favorite ID
   * @param {string} notes - Updated notes
   * @returns {Object} Updated favorite
   */
  async updateNotes(favoriteId, notes) {
    const query = `
      UPDATE favorites
      SET notes = $2
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [favoriteId, notes]);
    return result.rows[0];
  }
};

export default favoriteModel;
