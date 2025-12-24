import pool from '../config/db.js';

const messageModel = {
  // ============================================
  // CREATE CONVERSATION
  // ============================================
  async createConversation(participant1Id, participant2Id, jobId = null) {
    // Validate that participants are different users
    if (participant1Id === participant2Id) {
      throw new Error(`Cannot create conversation: both participants are the same user (${participant1Id})`);
    }

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
    // Validate that participants are different users
    if (userId1 === userId2) {
      throw new Error(`Cannot create conversation: both participants are the same user (${userId1})`);
    }

    // Check if conversation exists between these two users (ignore job_id to prevent duplicates)
    const query = `
      SELECT * FROM conversations
      WHERE (participant1_id = $1 AND participant2_id = $2)
         OR (participant1_id = $2 AND participant2_id = $1)
      ORDER BY last_message_at DESC
      LIMIT 1
    `;
    const params = [userId1, userId2];

    let result = await pool.query(query, params);

    // If conversation exists, update job_id if provided and return it
    if (result.rows.length > 0) {
      const existingConv = result.rows[0];

      // Optionally update job_id if a new one is provided and current is null
      if (jobId && !existingConv.job_id) {
        await pool.query(
          `UPDATE conversations SET job_id = $1 WHERE id = $2`,
          [jobId, existingConv.id]
        );
        existingConv.job_id = jobId;
      }

      return existingConv;
    }

    // Otherwise, create new conversation
    return await this.createConversation(userId1, userId2, jobId);
  },

  // ============================================
  // GET USER CONVERSATIONS
  // ============================================
  async getUserConversations(userId, userRole = null) {
    // Build the query with optional role filtering and job/bid information
    let query = `
      SELECT
        c.*,
        CASE
          WHEN c.participant1_id = $1 THEN c.participant2_id
          ELSE c.participant1_id
        END as other_user_id,
        u.first_name || ' ' || u.last_name as other_user_name,
        u.role as other_user_role,
        (
          SELECT
            CASE
              WHEN content IS NOT NULL AND content != '' THEN content
              WHEN image_url IS NOT NULL THEN '📷 Photo'
              WHEN attachments IS NOT NULL THEN '📎 Attachment'
              ELSE ''
            END
          FROM messages
          WHERE conversation_id = c.id
          ORDER BY created_at DESC
          LIMIT 1
        ) as last_message,
        (
          SELECT COUNT(*) FROM messages
          WHERE conversation_id = c.id
            AND receiver_id = $1
            AND is_read = FALSE
        ) as unread_count,
        j.id as job_id,
        j.title as job_title,
        j.description as job_description,
        j.category as job_category,
        j.budget_min as job_budget_min,
        j.budget_max as job_budget_max,
        j.due_date as job_due_date,
        j.urgency as job_urgency,
        p.address as job_property_address,
        p.city as job_city,
        b.id as bid_id,
        b.amount as bid_amount,
        b.message as bid_message,
        b.status as bid_status,
        b.created_at as bid_created_at
      FROM conversations c
      LEFT JOIN users u ON (
        CASE
          WHEN c.participant1_id = $1 THEN c.participant2_id
          ELSE c.participant1_id
        END = u.id
      )
      LEFT JOIN jobs j ON c.job_id = j.id
      LEFT JOIN properties p ON j.property_id = p.id
      LEFT JOIN bids b ON b.job_id = j.id
        AND b.status = 'approved'
        AND (
          (b.entrepreneur_id IN (SELECT id FROM entrepreneur_profiles WHERE user_id = $1))
          OR (b.entrepreneur_id IN (
            SELECT ep.id FROM entrepreneur_profiles ep
            WHERE ep.user_id = (
              CASE
                WHEN c.participant1_id = $1 THEN c.participant2_id
                ELSE c.participant1_id
              END
            )
          ))
        )
      WHERE (c.participant1_id = $1 OR c.participant2_id = $1)
    `;

    // Filter for property managers: only show residents and entrepreneurs
    if (userRole === 'property_manager') {
      query += ` AND u.role IN ('resident', 'entrepreneur')`;
    }

    query += ` ORDER BY c.last_message_at DESC`;

    console.log(`🔍 getUserConversations - userId: ${userId}, userRole: ${userRole}`);

    // Debug: Check all conversations for this user
    const debugQuery = await pool.query(
      `SELECT c.id, c.participant1_id, c.participant2_id, c.last_message_at,
              u1.role as p1_role, u2.role as p2_role
       FROM conversations c
       LEFT JOIN users u1 ON c.participant1_id = u1.id
       LEFT JOIN users u2 ON c.participant2_id = u2.id
       WHERE c.participant1_id = $1 OR c.participant2_id = $1`,
      [userId]
    );
    console.log(`🔍 Debug - All conversations for user ${userId}:`, debugQuery.rows);

    const result = await pool.query(query, [userId]);
    console.log(`🔍 getUserConversations - found ${result.rows.length} filtered conversations`);
    if (result.rows.length > 0) {
      result.rows.forEach(r => {
        console.log(`  - Conv ${r.id}: with ${r.other_user_name} (${r.other_user_role})`);
      });
    }

    return result.rows;
  },

  // ============================================
  // SEND MESSAGE
  // ============================================
  async sendMessage(conversationId, senderId, receiverId, content, jobId = null, imageUrl = null, attachments = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert message
      const insertQuery = `
        INSERT INTO messages (conversation_id, sender_id, receiver_id, content, job_id, image_url, attachments)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      const messageResult = await client.query(insertQuery, [
        conversationId,
        senderId,
        receiverId,
        content || '',
        jobId,
        imageUrl,
        attachments ? JSON.stringify(attachments) : null
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

    console.log(`[canUserMessage] Sender:`, sender);
    console.log(`[canUserMessage] Receiver:`, receiver);

    if (!sender || !receiver) {
      console.log(`[canUserMessage] Missing user - sender: ${!!sender}, receiver: ${!!receiver}`);
      return false;
    }

    // RULE 1: Residents can always message property managers
    if (sender.role === 'resident' && receiver.role === 'property_manager') {
      console.log('[canUserMessage] ✅ RULE 1 matched: Resident → Property Manager');
      return true;
    }

    // RULE 2: Property managers can always message residents
    if (sender.role === 'property_manager' && receiver.role === 'resident') {
      console.log('[canUserMessage] ✅ RULE 2 matched: Property Manager → Resident');
      return true;
    }

    // RULE 3: Residents can message other residents
    if (sender.role === 'resident' && receiver.role === 'resident') {
      console.log('[canUserMessage] ✅ RULE 3 matched: Resident → Resident');
      return true;
    }

    // RULE 4 & 5: Supplier <-> Entrepreneur (RESTRICTED!)
    // Only allowed if supplier has ACCEPTED a material request from the entrepreneur
    // Note: "Accept" sets status to 'in-progress', "Complete" sets to 'completed'
    if (
      (sender.role === 'supplier' && receiver.role === 'entrepreneur') ||
      (sender.role === 'entrepreneur' && receiver.role === 'supplier')
    ) {
      console.log('[canUserMessage] Checking RULE 4/5: Supplier ↔ Entrepreneur (requires accepted request)');
      const supplierId = sender.role === 'supplier' ? senderId : receiverId;
      const entrepreneurId = sender.role === 'entrepreneur' ? senderId : receiverId;

      // Check for accepted/in-progress/completed supplier requests
      // 'in-progress' = accepted, 'completed' = finished
      const requestQuery = `
        SELECT sr.id
        FROM supplier_requests sr
        JOIN supplier_profiles sp ON sr.supplier_id = sp.id
        JOIN entrepreneur_profiles ep ON sr.entrepreneur_id = ep.id
        WHERE sp.user_id = $1
          AND ep.user_id = $2
          AND sr.status IN ('in-progress', 'completed')
        LIMIT 1
      `;

      const requestResult = await pool.query(requestQuery, [supplierId, entrepreneurId]);
      const hasAcceptedRequest = requestResult.rows.length > 0;
      console.log(`[canUserMessage] Accepted request check: ${hasAcceptedRequest ? '✅ Found' : '❌ Not found'}`);
      return hasAcceptedRequest;
    }

    // RULE 6: Entrepreneur <-> Property Manager (RESTRICTED!)
    // Only allowed if entrepreneur has APPROVED bid
    if (
        (sender.role === 'entrepreneur' && receiver.role === 'property_manager') ||
        (sender.role === 'property_manager' && receiver.role === 'entrepreneur')
        ) {
        console.log('[canUserMessage] Checking RULE 6: Entrepreneur ↔ Property Manager (requires approved bid)');
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
        const hasApprovedBid = bidResult.rows.length > 0;
        console.log(`[canUserMessage] Approved bid check: ${hasApprovedBid ? '✅ Found' : '❌ Not found'}`);
        return hasApprovedBid;
    }

    // Default: deny access
    console.log(`[canUserMessage] ❌ No rules matched - ${sender.role} → ${receiver.role}`);
    return false;
  }
};

export default messageModel;