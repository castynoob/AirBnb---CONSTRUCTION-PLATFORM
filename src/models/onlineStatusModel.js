import pool from '../config/db.js';

const onlineStatusModel = {
  // ============================================
  // SET USER ONLINE
  // ============================================
  async setOnline(userId, socketId = null) {
    const query = `
      INSERT INTO user_online_status (user_id, is_online, socket_id, last_seen_at)
      VALUES ($1, TRUE, $2, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        is_online = TRUE,
        socket_id = $2,
        last_seen_at = NOW(),
        updated_at = NOW()
      RETURNING *
    `;
    const result = await pool.query(query, [userId, socketId]);
    return result.rows[0];
  },

  // ============================================
  // SET USER OFFLINE
  // ============================================
  async setOffline(userId) {
    const query = `
      UPDATE user_online_status
      SET is_online = FALSE,
          socket_id = NULL,
          last_seen_at = NOW(),
          updated_at = NOW()
      WHERE user_id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [userId]);
    return result.rows[0];
  },

  // ============================================
  // GET USER ONLINE STATUS
  // ============================================
  async getStatus(userId) {
    const query = `
      SELECT * FROM user_online_status
      WHERE user_id = $1
    `;
    const result = await pool.query(query, [userId]);
    return result.rows[0];
  },

  // ============================================
  // GET ONLINE USERS
  // ============================================
  async getOnlineUsers() {
    const query = `
      SELECT
        uos.*,
        u.first_name || ' ' || u.last_name as name,
        u.role
      FROM user_online_status uos
      JOIN users u ON uos.user_id = u.id
      WHERE uos.is_online = TRUE
      ORDER BY uos.last_seen_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
  },

  // ============================================
  // GET ONLINE USERS BY BUILDING
  // ============================================
  async getOnlineUsersByBuilding(buildingName) {
    const query = `
      SELECT
        uos.*,
        u.first_name || ' ' || u.last_name as name,
        u.role
      FROM user_online_status uos
      JOIN users u ON uos.user_id = u.id
      JOIN resident_profiles rp ON u.id = rp.user_id
      WHERE uos.is_online = TRUE
        AND rp.property_name = $1
      ORDER BY uos.last_seen_at DESC
    `;
    const result = await pool.query(query, [buildingName]);
    return result.rows;
  },

  // ============================================
  // UPDATE SOCKET ID
  // ============================================
  async updateSocketId(userId, socketId) {
    const query = `
      UPDATE user_online_status
      SET socket_id = $2, updated_at = NOW()
      WHERE user_id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [userId, socketId]);
    return result.rows[0];
  },

  // ============================================
  // CLEANUP STALE SESSIONS (older than 5 minutes)
  // ============================================
  async cleanupStaleSessions() {
    const query = `
      UPDATE user_online_status
      SET is_online = FALSE,
          socket_id = NULL
      WHERE is_online = TRUE
        AND last_seen_at < NOW() - INTERVAL '5 minutes'
      RETURNING *
    `;
    const result = await pool.query(query);
    return result.rows;
  }
};

export default onlineStatusModel;