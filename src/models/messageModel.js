import pool from '../config/db.js';

const messageModel = {
  // ============================================
  // CREATE CONVERSATION
  // ============================================
  async createConversation(participant1Id, participant2Id, jobId = null) {
    const query = `
      INSERT INTO conversations (participant1_id, participant2_id, job_id, last_message_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *
    `;
    const result = await pool.query(query, [participant1Id, participant2Id, jobId]);
    return result.rows[0];
  },

  // ============================================
  // GET OR CREATE CONVERSATION
  // ============================================
  async getOrCreateConversation(userId1, userId2, jobId = null) {
    // Check if conversation exists (bidirectional)
    let query = `
      SELECT * FROM conversations
      WHERE (participant1_id = $1 AND participant2_id = $2)
         OR (participant1_id = $2 AND participant2_id = $1)
    `;
    const params = [userId1, userId2];

    if (jobId) {
      query += ` AND job_id = $3`;
      params.push(jobId);
    }

    let result = await pool.query(query, params);

    // If conversation exists, return it
    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Otherwise, create new conversation
    return await this.createConversation(userId1, userId2, jobId);
  },

  // ============================================
  // GET USER CONVERSATIONS
  // ============================================
  async getUserConversations(userId) {
    const query = `
      SELECT 
        c.*,
        CASE 
          WHEN c.participant1_id = $1 THEN c.participant2_id
          ELSE c.participant1_id
        END as other_user_id,
        u.first_name || ' ' || u.last_name as other_user_name,
        u.role as other_user_role,
        (
          SELECT content FROM messages 
          WHERE conversation_id = c.id 
          ORDER BY created_at DESC 
          LIMIT 1
        ) as last_message,
        (
          SELECT COUNT(*) FROM messages
          WHERE conversation_id = c.id 
            AND receiver_id = $1 
            AND is_read = FALSE
        ) as unread_count
      FROM conversations c
      LEFT JOIN users u ON (
        CASE 
          WHEN c.participant1_id = $1 THEN c.participant2_id
          ELSE c.participant1_id
        END = u.id
      )
      WHERE c.participant1_id = $1 OR c.participant2_id = $1
      ORDER BY c.last_message_at DESC
    `;

    const result = await pool.query(query, [userId]);
    return result.rows;
  },

  // ============================================
  // SEND MESSAGE
  // ============================================
  async sendMessage(conversationId, senderId, receiverId, content, jobId = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert message
      const insertQuery = `
        INSERT INTO messages (conversation_id, sender_id, receiver_id, content, job_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const messageResult = await client.query(insertQuery, [
        conversationId,
        senderId,
        receiverId,
        content,
        jobId
      ]);

      // Update conversation last_message_at
      const updateQuery = `
        UPDATE conversations 
        SET last_message_at = NOW() 
        WHERE id = $1
      `;
      await client.query(updateQuery, [conversationId]);

      await client.query('COMMIT');
      return messageResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // ============================================
  // GET CONVERSATION MESSAGES
  // ============================================
  async getConversationMessages(conversationId, limit = 50, offset = 0) {
    const query = `
      SELECT 
        m.*,
        sender.first_name || ' ' || sender.last_name as sender_name,
        sender.role as sender_role
      FROM messages m
      LEFT JOIN users sender ON m.sender_id = sender.id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [conversationId, limit, offset]);
    return result.rows.reverse(); // Return in chronological order
  },

  // ============================================
  // MARK MESSAGES AS READ
  // ============================================
  async markMessagesAsRead(conversationId, userId) {
    const query = `
      UPDATE messages 
      SET is_read = TRUE, read_at = NOW()
      WHERE conversation_id = $1 
        AND receiver_id = $2 
        AND is_read = FALSE
      RETURNING *
    `;

    const result = await pool.query(query, [conversationId, userId]);
    return result.rows;
  },

  // ============================================
  // GET UNREAD MESSAGE COUNT
  // ============================================
  async getUnreadCount(userId) {
    const query = `
      SELECT COUNT(*) as count
      FROM messages
      WHERE receiver_id = $1 AND is_read = FALSE
    `;

    const result = await pool.query(query, [userId]);
    return parseInt(result.rows[0].count);
  },

  // ============================================
  // DELETE MESSAGE
  // ============================================
  async deleteMessage(messageId, userId) {
    const query = `
      DELETE FROM messages
      WHERE id = $1 AND sender_id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [messageId, userId]);
    return result.rows[0];
  },

  // ============================================
  // CHECK IF USER CAN MESSAGE (ACCESS CONTROL)
  // ============================================
  async canUserMessage(senderId, receiverId) {
    // Get both users' roles
    const userQuery = `
      SELECT id, role FROM users WHERE id IN ($1, $2)
    `;
    const userResult = await pool.query(userQuery, [senderId, receiverId]);
    
    const sender = userResult.rows.find(u => u.id === senderId);
    const receiver = userResult.rows.find(u => u.id === receiverId);

    if (!sender || !receiver) return false;

    // RULE 1: Residents can always message property managers
    if (sender.role === 'resident' && receiver.role === 'property_manager') {
      return true;
    }

    // RULE 2: Property managers can always message residents
    if (sender.role === 'property_manager' && receiver.role === 'resident') {
      return true;
    }

    // RULE 3: Residents can message other residents
    if (sender.role === 'resident' && receiver.role === 'resident') {
      return true;
    }

    // RULE 4: Suppliers can message entrepreneurs
    if (sender.role === 'supplier' && receiver.role === 'entrepreneur') {
      return true;
    }

    // RULE 5: Entrepreneurs can message suppliers
    if (sender.role === 'entrepreneur' && receiver.role === 'supplier') {
      return true;
    }

    // RULE 6: Entrepreneur <-> Property Manager (RESTRICTED!)
    // Only allowed if entrepreneur has APPROVED bid
    if (
        (sender.role === 'entrepreneur' && receiver.role === 'property_manager') ||
        (sender.role === 'property_manager' && receiver.role === 'entrepreneur')
        ) {
        const entrepreneurId = sender.role === 'entrepreneur' ? senderId : receiverId;
        const managerId = sender.role === 'property_manager' ? senderId : receiverId;

        // Check for approved bids (FIXED - join through jobs table)
        const bidQuery = `
            SELECT b.id 
            FROM bids b
            JOIN entrepreneur_profiles ep ON b.entrepreneur_id = ep.id
            JOIN jobs j ON b.job_id = j.id
            JOIN manager_profiles mp ON j.manager_id = mp.id
            WHERE ep.user_id = $1 
            AND mp.user_id = $2 
            AND b.status = 'approved'
            LIMIT 1
        `;

        const bidResult = await pool.query(bidQuery, [entrepreneurId, managerId]);
        return bidResult.rows.length > 0;
    }

    // Default: deny access
    return false;
  }
};

export default messageModel;