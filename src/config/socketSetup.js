// ============================================
// socketSetup.js (FIXED VERSION - Emit to Conversation Room)
// ============================================

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import messageModel from '../models/messageModel.js'; // ✅ your DB model

let io = null;

/**
 * Initialize Socket.io server
 * Called from server.js
 */
const setupSocket = (server) => {
  // Allow multiple origins for Socket.io
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // ============================================
  // AUTH MIDDLEWARE
  // ============================================
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error: No token provided'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch (error) {
      console.error('❌ Socket auth error:', error.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // ============================================
  // CONNECTION HANDLER
  // ============================================
  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.userId} (Socket ID: ${socket.id})`);
    socket.join(socket.userId.toString()); // personal room

    // ============================================
    // JOIN / LEAVE CONVERSATION
    // ============================================
    socket.on('join_conversation', (conversationId) => {
      socket.join(conversationId.toString());
      console.log(`👥 User ${socket.userId} joined conversation ${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(conversationId.toString());
      console.log(`👋 User ${socket.userId} left conversation ${conversationId}`);
    });

    // ============================================
    // 📨 SEND MESSAGE (FIXED!)
    // ============================================
    socket.on('send_message', async (data) => {
      try {
        const { receiverId, content, conversationId, jobId = null } = data;

        if (!receiverId || !content) {
          return socket.emit('error', { message: 'Missing receiver or content' });
        }

        // 🔒 Check if sender can message receiver
        const canMessage = await messageModel.canUserMessage(socket.userId, receiverId);
        if (!canMessage) {
          console.warn(`🚫 User ${socket.userId} not allowed to message ${receiverId}`);
          return socket.emit('error', { message: 'Not authorized to message this user' });
        }

        // ✅ Create message
        const message = await messageModel.sendMessage(
          conversationId,
          socket.userId,
          receiverId,
          content,
          jobId
        );

        console.log(`💬 Message saved: ${socket.userId} → ${receiverId}`);
        console.log(`📤 Emitting to conversation room: ${conversationId}`);

        // ✅ FIX: Emit to CONVERSATION ROOM (both users receive it)
        io.to(conversationId.toString()).emit('new_message', {
          conversationId,
          message: {
            id: message.id,
            content: message.content,
            sender_id: socket.userId,
            receiver_id: receiverId,
            created_at: message.created_at,
          },
        });

        console.log(`✅ new_message event emitted to room ${conversationId}`);

        // 📬 Also send confirmation to sender
        socket.emit('message_sent', {
          conversationId,
          message: {
            id: message.id,
            content: message.content,
            created_at: message.created_at,
          },
        });

        // 🔔 Notify receiver's personal room for notifications (if they're not in the conversation)
        io.to(receiverId.toString()).emit('message_notification', {
          conversationId,
          senderId: socket.userId,
        });

        console.log(`✅ Message delivery complete`);
      } catch (error) {
        console.error('❌ Error in send_message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ============================================
    // 📖 MARK AS READ
    // ============================================
    socket.on('mark_as_read', async (data) => {
      try {
        const { conversationId } = data;
        
        // Update database to mark messages as read
        await messageModel.markMessagesAsRead(conversationId, socket.userId);
        
        // Notify the conversation that messages were read
        io.to(conversationId.toString()).emit('messages_read', {
          conversationId,
          readBy: socket.userId,
        });
        
        console.log(`📖 Messages marked as read in ${conversationId} by ${socket.userId}`);
      } catch (error) {
        console.error('❌ Error marking as read:', error);
      }
    });

    // ============================================
    // ✏️ TYPING INDICATORS
    // ============================================
    socket.on('typing_start', (data) => {
      socket.to(data.conversationId.toString()).emit('user_typing', {
        userId: socket.userId,
        conversationId: data.conversationId,
      });
    });

    socket.on('typing_stop', (data) => {
      socket.to(data.conversationId.toString()).emit('user_stopped_typing', {
        userId: socket.userId,
        conversationId: data.conversationId,
      });
    });

    // ============================================
    // DISCONNECTION
    // ============================================
    socket.on('disconnect', (reason) => {
      console.log(`❌ User disconnected: ${socket.userId} - Reason: ${reason}`);
    });

    socket.on('error', (error) => {
      console.error('⚠️ Socket error:', error);
    });
  });

  console.log('✅ Socket.io initialized and ready');
  return io;
};

export default setupSocket;