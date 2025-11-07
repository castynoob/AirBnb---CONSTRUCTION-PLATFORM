import messageModel from '../models/messageModel.js';

const messageController = {
  // ============================================
  // GET USER CONVERSATIONS
  // ============================================
  async getConversations(req, res) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const conversations = await messageModel.getUserConversations(userId, userRole);

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
  }
};

export default messageController;