import pool from '../config/db.js';

const typingIndicatorModel = {
  // ============================================
  // START TYPING (DIRECT MESSAGE)
  // ============================================
  async startTypingDirect(userId, conversationId) {
    const query = `
      INSERT INTO typing_indicators (user_id, conversation_id, started_at, expires_at)
      VALUES ($1, $2, NOW(), NOW() + INTERVAL '10 seconds')
      ON CONFLICT ON CONSTRAINT typing_indicators_pkey
      DO UPDATE SET
        started_at = NOW(),
        expires_at = NOW() + INTERVAL '10 seconds'
      RETURNING *
    `;
    const result = await pool.query(query, [userId, conversationId]);
    return result.rows[0];
  },

  // ============================================
  // START TYPING (GROUP CHAT)
  // ============================================
  async startTypingGroup(userId, groupChatId) {
    const query = `
      INSERT INTO typing_indicators (user_id, group_chat_id, started_at, expires_at)
      VALUES ($1, $2, NOW(), NOW() + INTERVAL '10 seconds')
      RETURNING *
    `;
    const result = await pool.query(query, [userId, groupChatId]);
    return result.rows[0];
  },

  // ============================================
  // STOP TYPING
  // ============================================
  async stopTyping(userId, conversationId = null, groupChatId = null) {
    let query = `
      DELETE FROM typing_indicators
      WHERE user_id = $1
    `;
    const params = [userId];

    if (conversationId) {
      query += ` AND conversation_id = $2`;
      params.push(conversationId);
    } else if (groupChatId) {
      query += ` AND group_chat_id = $2`;
      params.push(groupChatId);
    }

    await pool.query(query, params);
  },

  // ============================================
  // GET TYPING USERS (DIRECT MESSAGE)
  // ============================================
  async getTypingUsersDirect(conversationId) {
    const query = `
      SELECT
        ti.*,
        u.first_name || ' ' || u.last_name as user_name
      FROM typing_indicators ti
      JOIN users u ON ti.user_id = u.id
      WHERE ti.conversation_id = $1
        AND ti.expires_at > NOW()
    `;
    const result = await pool.query(query, [conversationId]);
    return result.rows;
  },

  // ============================================
  // GET TYPING USERS (GROUP CHAT)
  // ============================================
  async getTypingUsersGroup(groupChatId) {
    const query = `
      SELECT
        ti.*,
        u.first_name || ' ' || u.last_name as user_name
      FROM typing_indicators ti
      JOIN users u ON ti.user_id = u.id
      WHERE ti.group_chat_id = $1
        AND ti.expires_at > NOW()
    `;
    const result = await pool.query(query, [groupChatId]);
    return result.rows;
  },

  // ============================================
  // CLEANUP EXPIRED TYPING INDICATORS
  // ============================================
  async cleanupExpired() {
    const query = `
      DELETE FROM typing_indicators
      WHERE expires_at < NOW()
      RETURNING *
    `;
    const result = await pool.query(query);
    return result.rows;
  }
};

export default typingIndicatorModel;