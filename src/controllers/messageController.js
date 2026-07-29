import messageModel from '../models/messageModel.js';
import pool from '../config/db.js';
import { sendEmail } from '../services/mailerService.js';

// Truncate a message body to a safe preview length for the email subject/body.
// Strips newlines and collapses whitespace so the preview reads as a single line.
const previewText = (raw, max = 140) => {
  if (!raw) return '';
  const flat = String(raw).replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
};

// HTML-escape a string for safe inclusion in the email HTML body. Message
// bodies are arbitrary user input; without escaping, `<script>` etc. would land
// in the recipient's inbox as live markup.
const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Fire-and-forget email dispatch on every new chat message. Runs after the
// message has been persisted + socket-broadcast, so a mailer failure never
// blocks the API response.
//
// Guards:
//   * Recipient must have users.email_notifications = TRUE.
//   * Recipient must have a non-empty email address.
//   * No throttle — user explicitly asked "email every time".
const dispatchMessageEmail = async ({ senderId, receiverId, message, jobId }) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         r.email          AS to_email,
         r.first_name     AS to_first,
         r.last_name      AS to_last,
         r.email_notifications AS to_opt_in,
         s.first_name     AS from_first,
         s.last_name      AS from_last,
         COALESCE(mp.company_name, ep.company_name, NULL) AS from_company,
         j.title          AS job_title
       FROM users r
       CROSS JOIN users s
       LEFT JOIN manager_profiles      mp ON mp.user_id = s.id
       LEFT JOIN entrepreneur_profiles ep ON ep.user_id = s.id
       LEFT JOIN jobs j ON j.id = $3
       WHERE r.id = $1 AND s.id = $2`,
      [receiverId, senderId, jobId || null]
    );
    const row = rows[0];
    if (!row) return;
    if (row.to_opt_in === false) return;         // opted out
    if (!row.to_email) return;                    // no address on file

    const senderName =
      row.from_company ||
      [row.from_first, row.from_last].filter(Boolean).join(' ') ||
      'Someone';
    const recipientName = row.to_first || row.to_last || 'there';
    const messagePreview = previewText(message.content, 140);
    const inboxUrl = `${process.env.FRONTEND_URL || ''}/messages`;

    const subject = row.job_title
      ? `New message from ${senderName} — ${row.job_title}`
      : `New message from ${senderName}`;

    const text = [
      `Hi ${recipientName},`,
      '',
      `${senderName} just sent you a message${row.job_title ? ` about "${row.job_title}"` : ''} on Intervos:`,
      '',
      messagePreview || '(sent an attachment)',
      '',
      inboxUrl ? `Reply here: ${inboxUrl}` : '',
      '',
      '— Intervos',
    ].filter(Boolean).join('\n');

    const html = `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#0f223d;">
        <p>Hi ${escapeHtml(recipientName)},</p>
        <p><strong>${escapeHtml(senderName)}</strong> just sent you a message${row.job_title ? ` about <em>${escapeHtml(row.job_title)}</em>` : ''} on Intervos:</p>
        <blockquote style="margin:12px 0;padding:12px 16px;border-left:4px solid #00A5A9;background:#f4fafa;border-radius:6px;font-size:15px;line-height:1.5;">
          ${messagePreview ? escapeHtml(messagePreview) : '<em>(sent an attachment)</em>'}
        </blockquote>
        ${inboxUrl ? `<p style="margin-top:24px"><a href="${inboxUrl}" style="display:inline-block;background:#00A5A9;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Open your inbox</a></p>` : ''}
        <p style="margin-top:32px;color:#6b7280;font-size:12px;">You're receiving this because email notifications are enabled on your Intervos account. You can turn them off in your profile settings.</p>
      </div>
    `;

    await sendEmail(row.to_email, subject, text, html);
  } catch (err) {
    // Never let a mail error surface — the message API already succeeded.
    console.error('⚠️ Message-email dispatch failed:', err.message);
  }
};

const messageController = {
  // ============================================
  // GET USER CONVERSATIONS
  // ============================================
  async getConversations(req, res) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const { filterByRole } = req.query; // Optional: 'resident', 'entrepreneur', or undefined for all

      console.log(`📋 getConversations called for userId: ${userId}, role: ${userRole}`);

      const conversations = await messageModel.getUserConversations(userId, userRole);

      console.log(`📋 Found ${conversations.length} conversations`);
      if (conversations.length > 0) {
        conversations.forEach(conv => {
          console.log(`  - Conv with ${conv.other_user_name} (${conv.other_user_role}): "${conv.last_message?.substring(0, 30) || 'No messages'}"`);
        });
      }

      res.json({
        success: true,
        conversations
      });
    } catch (error) {
      console.error('❌ Error getting conversations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get conversations'
      });
    }
  },

  // ============================================
  // GET CONVERSATION MESSAGES
  // ============================================
  async getMessages(req, res) {
    try {
      const { conversationId } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      const userId = req.user.id;

      // Get messages (conversation access is verified by checking if user is sender or receiver)
      const messages = await messageModel.getConversationMessages(
        conversationId,
        parseInt(limit),
        parseInt(offset)
      );

      // Mark messages as read
      await messageModel.markMessagesAsRead(conversationId, userId);

      res.json({
        success: true,
        messages
      });
    } catch (error) {
      console.error('❌ Error getting messages:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get messages'
      });
    }
  },

  // ============================================
  // SEND MESSAGE
  // ============================================
  async sendMessage(req, res) {
    try {
      const senderId = req.user.id;
      const { receiverId, content, jobId, imageUrl, attachments } = req.body;

      // Validate input
      if (!receiverId || (!content && !imageUrl && (!attachments || attachments.length === 0))) {
        return res.status(400).json({
          success: false,
          message: 'Receiver ID and content/image/attachments are required'
        });
      }

      // Check if sender can message receiver (ACCESS CONTROL)
      console.log(`🔍 Checking authorization: Sender ${senderId} → Receiver ${receiverId}`);
      const canMessage = await messageModel.canUserMessage(senderId, receiverId);
      console.log(`🔐 Authorization result: ${canMessage}`);

      if (!canMessage) {
        console.log(`❌ Authorization denied for ${senderId} → ${receiverId}`);
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to message this user. Entrepreneurs can only message property managers after bid approval.'
        });
      }

      // Get or create conversation
      const conversation = await messageModel.getOrCreateConversation(
        senderId,
        receiverId,
        jobId
      );

      // Send message
      const message = await messageModel.sendMessage(
        conversation.id,
        senderId,
        receiverId,
        content,
        jobId,
        imageUrl,
        attachments
      );

      // Emit socket event for real-time delivery
      const io = req.app.get('io');
      if (io) {
        io.to(receiverId).emit('new_message', {
          message,
          conversationId: conversation.id
        });
      }

      // Fire-and-forget email notification — respects the recipient's
      // users.email_notifications preference. Not awaited: any mailer hiccup
      // must not block the API response.
      dispatchMessageEmail({ senderId, receiverId, message, jobId });

      res.status(201).json({
        success: true,
        message,
        conversationId: conversation.id
      });
    } catch (error) {
      console.error('❌ Error sending message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send message'
      });
    }
  },

  // ============================================
  // START CONVERSATION
  // ============================================
  async startConversation(req, res) {
    try {
      const userId = req.user.id;
      const { otherUserId, jobId } = req.body;

      // Check if user can message the other user
      const canMessage = await messageModel.canUserMessage(userId, otherUserId);
      
      if (!canMessage) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to start a conversation with this user'
        });
      }

      // Get or create conversation
      const conversation = await messageModel.getOrCreateConversation(
        userId,
        otherUserId,
        jobId
      );

      res.json({
        success: true,
        conversation
      });
    } catch (error) {
      console.error('❌ Error starting conversation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start conversation'
      });
    }
  },

  // ============================================
  // GET UNREAD COUNT
  // ============================================
  async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;
      const count = await messageModel.getUnreadCount(userId);

      res.json({
        success: true,
        unreadCount: count
      });
    } catch (error) {
      console.error('❌ Error getting unread count:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get unread count'
      });
    }
  },

  // ============================================
  // MARK CONVERSATION AS READ
  // ============================================
  async markAsRead(req, res) {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;

      const updatedMessages = await messageModel.markMessagesAsRead(conversationId, userId);

      // Emit socket event for read receipts
      const io = req.app.get('io');
      if (io) {
        io.to(conversationId).emit('messages_read', {
          conversationId,
          userId,
          count: updatedMessages.length
        });
      }

      res.json({
        success: true,
        message: 'Messages marked as read',
        count: updatedMessages.length
      });
    } catch (error) {
      console.error('❌ Error marking messages as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark messages as read'
      });
    }
  },

  // ============================================
  // DELETE MESSAGE
  // ============================================
  async deleteMessage(req, res) {
    try {
      const { messageId } = req.params;
      const userId = req.user.id;

      const deletedMessage = await messageModel.deleteMessage(messageId, userId);

      if (!deletedMessage) {
        return res.status(404).json({
          success: false,
          message: 'Message not found or you are not the sender'
        });
      }

      // Emit socket event for message deletion
      const io = req.app.get('io');
      if (io) {
        io.to(deletedMessage.conversation_id).emit('message_deleted', {
          messageId,
          conversationId: deletedMessage.conversation_id
        });
      }

      res.json({
        success: true,
        message: 'Message deleted successfully'
      });
    } catch (error) {
      console.error('❌ Error deleting message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete message'
      });
    }
  },

  // ============================================
  // CHECK MESSAGE ACCESS
  // ============================================
  async checkMessageAccess(req, res) {
    try {
      const userId = req.user.id;
      const { otherUserId } = req.params;

      const canMessage = await messageModel.canUserMessage(userId, otherUserId);

      res.json({
        success: true,
        canMessage,
        message: canMessage 
          ? 'You can message this user' 
          : 'You cannot message this user. Entrepreneurs need an approved bid first.'
      });
    } catch (error) {
      console.error('❌ Error checking message access:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check message access'
      });
    }
  },

  // Upload attachment for messages
  uploadAttachment: async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file provided'
        });
      }

      const { uploadMessageFile, validateMessageFile } = await import('../utils/messageFileUpload.js');

      // Validate file
      const validation = validateMessageFile(req.file.size, req.file.mimetype);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.error
        });
      }

      // Upload to Supabase
      const fileData = await uploadMessageFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        req.user.id
      );

      res.json({
        success: true,
        file: fileData
      });
    } catch (error) {
      console.error('Upload attachment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload attachment'
      });
    }
  },

  // ============================================
  // DIRECT MESSAGE ENDPOINTS (Now using unified conversations/messages tables)
  // These endpoints are kept for backward compatibility but now use
  // the same tables as entrepreneur messaging for a unified experience
  // ============================================
  async getDirectMessageConversations(req, res) {
    try {
      const userId = req.user.id;

      // Get all conversations with residents from the unified conversations table
      const conversationsQuery = await pool.query(
        `SELECT
          c.id,
          c.last_message_at,
          CASE
            WHEN c.participant1_id = $1 THEN c.participant2_id
            ELSE c.participant1_id
          END as other_user_id,
          u.first_name,
          u.last_name,
          u.role,
          rp.unit_number,
          (
            SELECT content
            FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
          ) as last_message,
          (
            SELECT COUNT(*)
            FROM messages m
            WHERE m.conversation_id = c.id
              AND m.receiver_id = $1
              AND m.is_read = FALSE
          ) as unread_count
        FROM conversations c
        JOIN users u ON (
          CASE
            WHEN c.participant1_id = $1 THEN c.participant2_id
            ELSE c.participant1_id
          END = u.id
        )
        LEFT JOIN resident_profiles rp ON rp.user_id = u.id
        WHERE (c.participant1_id = $1 OR c.participant2_id = $1)
          AND u.role = 'resident'
        ORDER BY c.last_message_at DESC`,
        [userId]
      );

      const conversations = conversationsQuery.rows.map(conv => ({
        id: conv.id,
        user_id: conv.other_user_id,
        other_user_id: conv.other_user_id,
        first_name: conv.first_name,
        last_name: conv.last_name,
        other_user_name: `${conv.first_name} ${conv.last_name}`,
        other_user_role: conv.role,
        unit_number: conv.unit_number,
        last_message: conv.last_message,
        last_message_at: conv.last_message_at,
        last_message_time: conv.last_message_at,
        unread_count: parseInt(conv.unread_count) || 0,
        is_resident: conv.role === 'resident'
      }));

      console.log(`📋 Found ${conversations.length} resident conversations for PM ${userId}`);

      res.json({
        success: true,
        conversations
      });
    } catch (error) {
      console.error('❌ Error getting DM conversations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get conversations'
      });
    }
  },

  async getDirectMessages(req, res) {
    try {
      const userId = req.user.id;
      const { recipientId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      console.log(`📧 Fetching messages between ${userId} and ${recipientId}`);

      // Find the conversation between these two users
      const convQuery = await pool.query(
        `SELECT id FROM conversations
         WHERE (participant1_id = $1 AND participant2_id = $2)
            OR (participant1_id = $2 AND participant2_id = $1)
         LIMIT 1`,
        [userId, recipientId]
      );

      if (convQuery.rows.length === 0) {
        return res.json({
          success: true,
          messages: []
        });
      }

      const conversationId = convQuery.rows[0].id;

      // Get messages from unified messages table
      const messagesQuery = await pool.query(
        `SELECT m.*,
                u.first_name || ' ' || u.last_name as sender_name
         FROM messages m
         JOIN users u ON m.sender_id = u.id
         WHERE m.conversation_id = $1
         ORDER BY m.created_at ASC
         LIMIT $2 OFFSET $3`,
        [conversationId, parseInt(limit), parseInt(offset)]
      );

      // Mark messages as read
      await pool.query(
        `UPDATE messages
         SET is_read = TRUE, read_at = NOW()
         WHERE conversation_id = $1 AND receiver_id = $2 AND is_read = FALSE`,
        [conversationId, userId]
      );

      res.json({
        success: true,
        messages: messagesQuery.rows
      });
    } catch (error) {
      console.error('❌ Error getting direct messages:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get messages'
      });
    }
  },

  async sendDirectMessage(req, res) {
    try {
      const userId = req.user.id;
      const { recipientId } = req.params;
      const { message_text } = req.body;

      if (!message_text || !message_text.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Message text is required'
        });
      }

      console.log(`📧 PM ${userId} sending message to ${recipientId}`);

      // Get or create conversation in unified conversations table
      let convQuery = await pool.query(
        `SELECT id FROM conversations
         WHERE (participant1_id = $1 AND participant2_id = $2)
            OR (participant1_id = $2 AND participant2_id = $1)
         LIMIT 1`,
        [userId, recipientId]
      );

      let conversationId;
      if (convQuery.rows.length === 0) {
        const newConv = await pool.query(
          `INSERT INTO conversations (participant1_id, participant2_id, last_message_at)
           VALUES ($1, $2, NOW())
           RETURNING id`,
          [userId, recipientId]
        );
        conversationId = newConv.rows[0].id;
        console.log(`📧 Created new conversation ${conversationId}`);
      } else {
        conversationId = convQuery.rows[0].id;
      }

      // Insert message into unified messages table
      const messageResult = await pool.query(
        `INSERT INTO messages (conversation_id, sender_id, receiver_id, content)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [conversationId, userId, recipientId, message_text.trim()]
      );

      const message = messageResult.rows[0];

      // Update conversation last_message_at
      await pool.query(
        `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`,
        [conversationId]
      );

      // Get sender info for socket notification
      const senderInfo = await pool.query(
        'SELECT first_name, last_name FROM users WHERE id = $1',
        [userId]
      );
      const senderName = senderInfo.rows[0]
        ? `${senderInfo.rows[0].first_name} ${senderInfo.rows[0].last_name}`
        : 'Unknown';

      // Emit socket event using the standard new_message event
      const io = req.app.get('io');
      if (io) {
        io.to(recipientId).emit('new_message', {
          message: {
            ...message,
            sender_name: senderName
          },
          conversationId: conversationId
        });

        io.to(userId).emit('new_message', {
          message: {
            ...message,
            sender_name: senderName
          },
          conversationId: conversationId
        });

        console.log(`📨 Sent message notification to ${recipientId} and ${userId}`);
      }

      res.status(201).json({
        success: true,
        message,
        conversationId
      });
    } catch (error) {
      console.error('❌ Error sending direct message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send message'
      });
    }
  },

  // ============================================
  // ARCHIVE CONVERSATION
  // ============================================
  async archiveConversation(req, res) {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;

      const result = await messageModel.archiveConversation(conversationId, userId);
      if (!result) {
        return res.status(404).json({ success: false, message: 'Conversation not found or already archived' });
      }

      res.json({ success: true, message: 'Conversation archived' });
    } catch (error) {
      console.error('Archive conversation error:', error);
      res.status(500).json({ success: false, message: 'Failed to archive conversation' });
    }
  },

  // ============================================
  // UNARCHIVE CONVERSATION
  // ============================================
  async unarchiveConversation(req, res) {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;

      const result = await messageModel.unarchiveConversation(conversationId, userId);
      if (!result) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }

      res.json({ success: true, message: 'Conversation restored' });
    } catch (error) {
      console.error('Unarchive conversation error:', error);
      res.status(500).json({ success: false, message: 'Failed to restore conversation' });
    }
  },

  // ============================================
  // GET ARCHIVED CONVERSATIONS
  // ============================================
  async getArchivedConversations(req, res) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      const conversations = await messageModel.getArchivedConversations(userId, userRole);
      res.json({ success: true, conversations });
    } catch (error) {
      console.error('Get archived conversations error:', error);
      res.status(500).json({ success: false, message: 'Failed to get archived conversations' });
    }
  }
};

export default messageController;