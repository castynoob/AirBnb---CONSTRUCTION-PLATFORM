import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import messageModel from '../models/messageModel.js';

// ============================================
// SOCKET.IO SETUP & CONFIGURATION
// ============================================
const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Store active users (userId -> socketId mapping)
  const activeUsers = new Map();

  // ============================================
  // AUTHENTICATION MIDDLEWARE
  // ============================================
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;

      next();
    } catch (error) {
      next(new Error('Invalid authentication token'));
    }
  });

  // ============================================
  // CONNECTION EVENT
  // ============================================
  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.userId} (${socket.userRole})`);

    // Add user to active users
    activeUsers.set(socket.userId, socket.id);

    // Join user to their personal room (for receiving messages)
    socket.join(socket.userId);

    // Emit user online status
    io.emit('user_online', { userId: socket.userId });

    // ============================================
    // JOIN CONVERSATION ROOM
    // ============================================
    socket.on('join_conversation', async (conversationId) => {
      try {
        socket.join(conversationId);
        console.log(`👥 User ${socket.userId} joined conversation ${conversationId}`);

        // Mark messages as read when joining conversation
        await messageModel.markMessagesAsRead(conversationId, socket.userId);

        // Notify read receipts
        socket.to(conversationId).emit('messages_read', {
          conversationId,
          userId: socket.userId
        });
      } catch (error) {
        console.error('❌ Error joining conversation:', error);
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    // ============================================
    // LEAVE CONVERSATION ROOM
    // ============================================
    socket.on('leave_conversation', (conversationId) => {
      socket.leave(conversationId);
      console.log(`👋 User ${socket.userId} left conversation ${conversationId}`);
    });

    // ============================================
    // SEND MESSAGE (Real-time)
    // ============================================
    socket.on('send_message', async (data) => {
      try {
        const { receiverId, content, jobId, conversationId } = data;

        // Validate
        if (!receiverId || !content) {
          return socket.emit('error', { message: 'Receiver and content required' });
        }

        // Check access control
        const canMessage = await messageModel.canUserMessage(socket.userId, receiverId);
        
        if (!canMessage) {
          return socket.emit('error', { 
            message: 'You cannot message this user. Entrepreneurs need approved bid first.' 
          });
        }

        // Get or create conversation
        const conversation = await messageModel.getOrCreateConversation(
          socket.userId,
          receiverId,
          jobId
        );

        // Save message to database
        const message = await messageModel.sendMessage(
          conversation.id,
          socket.userId,
          receiverId,
          content,
          jobId
        );

        // Emit to conversation room
        io.to(conversation.id).emit('new_message', {
          message,
          conversationId: conversation.id
        });

        // Emit to receiver's personal room (notification)
        io.to(receiverId).emit('message_notification', {
          message,
          conversationId: conversation.id,
          senderId: socket.userId
        });

        // Confirm to sender
        socket.emit('message_sent', {
          message,
          conversationId: conversation.id
        });

      } catch (error) {
        console.error('❌ Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ============================================
    // TYPING INDICATOR
    // ============================================
    socket.on('typing_start', ({ conversationId, receiverId }) => {
      socket.to(conversationId).emit('user_typing', {
        userId: socket.userId,
        conversationId
      });
    });

    socket.on('typing_stop', ({ conversationId }) => {
      socket.to(conversationId).emit('user_stopped_typing', {
        userId: socket.userId,
        conversationId
      });
    });

    // ============================================
    // MARK AS READ
    // ============================================
    socket.on('mark_as_read', async ({ conversationId }) => {
      try {
        await messageModel.markMessagesAsRead(conversationId, socket.userId);

        // Notify conversation participants
        socket.to(conversationId).emit('messages_read', {
          conversationId,
          userId: socket.userId
        });

      } catch (error) {
        console.error('❌ Error marking as read:', error);
        socket.emit('error', { message: 'Failed to mark as read' });
      }
    });

    // ============================================
    // DELETE MESSAGE
    // ============================================
    socket.on('delete_message', async ({ messageId, conversationId }) => {
      try {
        const deletedMessage = await messageModel.deleteMessage(messageId, socket.userId);

        if (!deletedMessage) {
          return socket.emit('error', { message: 'Message not found or not authorized' });
        }

        // Notify conversation participants
        io.to(conversationId).emit('message_deleted', {
          messageId,
          conversationId
        });

      } catch (error) {
        console.error('❌ Error deleting message:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // ============================================
    // DISCONNECT EVENT
    // ============================================
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.userId}`);
      
      // Remove from active users
      activeUsers.delete(socket.userId);

      // Emit user offline status
      io.emit('user_offline', { userId: socket.userId });
    });

    // ============================================
    // ERROR HANDLING
    // ============================================
    socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });
  });

  // Return io instance for use in controllers
  return io;
};

export default setupSocket;