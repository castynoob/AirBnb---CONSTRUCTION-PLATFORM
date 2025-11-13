import pool from '../config/db.js';

const groupChatModel = {
  // ============================================
  // CREATE GROUP CHAT
  // ============================================
  async createGroupChat(name, description, createdBy, propertyId = null, buildingName = null) {
    const query = `
      INSERT INTO group_chats (name, description, created_by, property_id, building_name)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await pool.query(query, [name, description, createdBy, propertyId, buildingName]);
    return result.rows[0];
  },

  // ============================================
  // GET OR CREATE BUILDING GROUP CHAT
  // ============================================
  async getOrCreateBuildingGroupChat(buildingName, createdBy) {
    // Check if group chat exists for this building
    let query = `
      SELECT * FROM group_chats
      WHERE building_name = $1 AND is_active = TRUE
      LIMIT 1
    `;
    let result = await pool.query(query, [buildingName]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Create new group chat for the building
    const name = `${buildingName} - Community Chat`;
    const description = `Group chat for all residents of ${buildingName}`;

    return await this.createGroupChat(name, description, createdBy, null, buildingName);
  },

  // ============================================
  // ADD MEMBER TO GROUP CHAT
  // ============================================
  async addMember(groupChatId, userId, isAdmin = false) {
    const query = `
      INSERT INTO group_chat_members (group_chat_id, user_id, is_admin)
      VALUES ($1, $2, $3)
      ON CONFLICT (group_chat_id, user_id) DO NOTHING
      RETURNING *
    `;
    const result = await pool.query(query, [groupChatId, userId, isAdmin]);
    return result.rows[0];
  },

  // ============================================
  // REMOVE MEMBER FROM GROUP CHAT
  // ============================================
  async removeMember(groupChatId, userId) {
    const query = `
      DELETE FROM group_chat_members
      WHERE group_chat_id = $1 AND user_id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [groupChatId, userId]);
    return result.rows[0];
  },

  // ============================================
  // GET USER'S GROUP CHATS
  // ============================================
  async getUserGroupChats(userId) {
    const query = `
      SELECT
        gc.*,
        gcm.is_admin,
        gcm.last_read_at,
        (SELECT COUNT(*) FROM group_chat_members WHERE group_chat_id = gc.id) as member_count,
        (SELECT COUNT(*) FROM group_messages
         WHERE group_chat_id = gc.id
           AND created_at > gcm.last_read_at
           AND sender_id != $1
        ) as unread_count,
        (SELECT content FROM group_messages
         WHERE group_chat_id = gc.id
         ORDER BY created_at DESC
         LIMIT 1
        ) as last_message,
        (SELECT created_at FROM group_messages
         WHERE group_chat_id = gc.id
         ORDER BY created_at DESC
         LIMIT 1
        ) as last_message_at
      FROM group_chats gc
      JOIN group_chat_members gcm ON gc.id = gcm.group_chat_id
      WHERE gcm.user_id = $1 AND gc.is_active = TRUE
      ORDER BY last_message_at DESC NULLS LAST, gc.created_at DESC
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
  },

  // ============================================
  // GET GROUP CHAT BY ID
  // ============================================
  async getGroupChatById(groupChatId, userId = null) {
    let query = `
      SELECT
        gc.*,
        (SELECT COUNT(*) FROM group_chat_members WHERE group_chat_id = gc.id) as member_count
    `;

    if (userId) {
      query += `,
        (SELECT is_admin FROM group_chat_members
         WHERE group_chat_id = gc.id AND user_id = $2) as is_admin,
        (SELECT last_read_at FROM group_chat_members
         WHERE group_chat_id = gc.id AND user_id = $2) as last_read_at
      `;
    }

    query += `
      FROM group_chats gc
      WHERE gc.id = $1
    `;

    const params = userId ? [groupChatId, userId] : [groupChatId];
    const result = await pool.query(query, params);
    return result.rows[0];
  },

  // ============================================
  // GET GROUP CHAT MEMBERS
  // ============================================
  async getGroupChatMembers(groupChatId) {
    const query = `
      SELECT
        gcm.*,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        rp.profile_picture,
        uos.is_online,
        uos.last_seen_at
      FROM group_chat_members gcm
      JOIN users u ON gcm.user_id = u.id
      LEFT JOIN resident_profiles rp ON u.id = rp.user_id
      LEFT JOIN user_online_status uos ON u.id = uos.user_id
      WHERE gcm.group_chat_id = $1
      ORDER BY gcm.is_admin DESC, u.first_name ASC
    `;
    const result = await pool.query(query, [groupChatId]);
    return result.rows;
  },

  // ============================================
  // SEND GROUP MESSAGE
  // ============================================
  async sendMessage(groupChatId, senderId, content) {
    const query = `
      INSERT INTO group_messages (group_chat_id, sender_id, content)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await pool.query(query, [groupChatId, senderId, content]);
    return result.rows[0];
  },

  // ============================================
  // GET GROUP MESSAGES
  // ============================================
  async getMessages(groupChatId, limit = 50, offset = 0) {
    const query = `
      SELECT
        gm.*,
        u.first_name || ' ' || u.last_name as sender_name,
        u.role as sender_role,
        rp.profile_picture as sender_picture
      FROM group_messages gm
      LEFT JOIN users u ON gm.sender_id = u.id
      LEFT JOIN resident_profiles rp ON u.id = rp.user_id
      WHERE gm.group_chat_id = $1 AND gm.is_deleted = FALSE
      ORDER BY gm.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await pool.query(query, [groupChatId, limit, offset]);
    return result.rows.reverse(); // Return in chronological order
  },

  // ============================================
  // UPDATE LAST READ
  // ============================================
  async updateLastRead(groupChatId, userId) {
    const query = `
      UPDATE group_chat_members
      SET last_read_at = NOW()
      WHERE group_chat_id = $1 AND user_id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [groupChatId, userId]);
    return result.rows[0];
  },

  // ============================================
  // DELETE GROUP MESSAGE
  // ============================================
  async deleteMessage(messageId, userId) {
    const query = `
      UPDATE group_messages
      SET is_deleted = TRUE
      WHERE id = $1 AND sender_id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [messageId, userId]);
    return result.rows[0];
  },

  // ============================================
  // CHECK IF USER IS MEMBER
  // ============================================
  async isMember(groupChatId, userId) {
    const query = `
      SELECT EXISTS(
        SELECT 1 FROM group_chat_members
        WHERE group_chat_id = $1 AND user_id = $2
      ) as is_member
    `;
    const result = await pool.query(query, [groupChatId, userId]);
    return result.rows[0].is_member;
  },

  // ============================================
  // CHECK IF USER IS ADMIN
  // ============================================
  async isAdmin(groupChatId, userId) {
    const query = `
      SELECT is_admin FROM group_chat_members
      WHERE group_chat_id = $1 AND user_id = $2
    `;
    const result = await pool.query(query, [groupChatId, userId]);
    return result.rows[0]?.is_admin || false;
  },

  // ============================================
  // UPDATE GROUP CHAT
  // ============================================
  async updateGroupChat(groupChatId, updates) {
    const { name, description } = updates;
    const query = `
      UPDATE group_chats
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;
    const result = await pool.query(query, [name, description, groupChatId]);
    return result.rows[0];
  },

  // ============================================
  // DEACTIVATE GROUP CHAT
  // ============================================
  async deactivateGroupChat(groupChatId) {
    const query = `
      UPDATE group_chats
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [groupChatId]);
    return result.rows[0];
  }
};

export default groupChatModel;