// ============================================
// socketSetup.js (FIXED VERSION - Emit to Conversation Room)
// ============================================

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import messageModel from '../models/messageModel.js'; // ✅ your DB model
import pool from '../config/db.js';
import { createNotification } from '../controllers/notificationController.js';

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
    'https://intervos.app',
    'https://www.intervos.app',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  console.log('🔧 Socket.IO allowed origins:', allowedOrigins);

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
          console.log('✅ Socket.IO: Allowing request with no origin');
          return callback(null, true);
        }

        // Remove trailing slash for comparison
        const normalizedOrigin = origin.replace(/\/$/, '');
        const normalizedAllowed = allowedOrigins.map(o => o.replace(/\/$/, ''));

        if (normalizedAllowed.includes(normalizedOrigin)) {
          console.log(`✅ Socket.IO: Allowing origin: ${origin}`);
          callback(null, true);
        } else if (
          normalizedOrigin.endsWith('.vercel.app') &&
          normalizedOrigin.includes('intervos')
        ) {
          console.log(`✅ Socket.IO: Allowing Vercel preview origin: ${origin}`);
          callback(null, true);
        } else {
          console.error(`❌ Socket.IO CORS blocked: ${origin}`);
          console.error(`   Allowed origins:`, allowedOrigins);
          callback(new Error(`Not allowed by CORS: ${origin}`));
        }
      },
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
    const userRoom = socket.userId.toString();
    console.log(`✅ User connected: ${socket.userId} (Socket ID: ${socket.id})`);
    console.log(`🏠 User ${socket.userId} joining personal room: "${userRoom}"`);
    socket.join(userRoom); // personal room

    // Log which rooms this socket is in
    console.log(`📋 Socket ${socket.id} rooms:`, Array.from(socket.rooms));

    // Track online status in database
    pool.query(
      `INSERT INTO user_online_status (user_id, is_online, socket_id, last_seen_at)
       VALUES ($1, true, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET is_online = true, socket_id = $2, last_seen_at = NOW()`,
      [socket.userId, socket.id]
    ).catch(err => console.error('Failed to update online status:', err));

    // ============================================
    // JOIN / LEAVE CONVERSATION
    // ============================================
    socket.on('join_conversation', (conversationId) => {
      // Don't join if conversationId is null (new conversation not yet created)
      if (conversationId) {
        socket.join(conversationId.toString());
        console.log(`👥 User ${socket.userId} joined conversation ${conversationId}`);
      } else {
        console.log(`⚠️ User ${socket.userId} attempted to join null conversation (new conversation)`);
      }
    });

    socket.on('leave_conversation', (conversationId) => {
      // Don't leave if conversationId is null
      if (conversationId) {
        socket.leave(conversationId.toString());
        console.log(`👋 User ${socket.userId} left conversation ${conversationId}`);
      }
    });

    // ============================================
    // 📨 SEND MESSAGE (FIXED!)
    // ============================================
    socket.on('send_message', async (data) => {
      try {
        const { receiverId, content, conversationId, jobId = null, imageUrl = null, attachments = null } = data;

        if (!receiverId || (!content && !imageUrl && (!attachments || attachments.length === 0))) {
          return socket.emit('error', { message: 'Missing receiver or content/image/attachments' });
        }

        // 🔒 Check if sender can message receiver
        console.log(`🔍 [Socket] Checking authorization: Sender ${socket.userId} (role: ${socket.userRole}) → Receiver ${receiverId}`);
        const canMessage = await messageModel.canUserMessage(socket.userId, receiverId);
        console.log(`🔐 [Socket] Authorization result: ${canMessage}`);
        if (!canMessage) {
          console.warn(`🚫 User ${socket.userId} (role: ${socket.userRole}) not allowed to message ${receiverId}`);
          return socket.emit('error', {
            message: 'Not authorized to message this user',
            details: 'Entrepreneurs need an approved bid to message property managers'
          });
        }

        // 🆕 Get or create conversation if conversationId is null
        let actualConversationId = conversationId;
        if (!actualConversationId) {
          console.log(`🆕 Creating new conversation between ${socket.userId} and ${receiverId}`);
          const conversation = await messageModel.getOrCreateConversation(
            socket.userId,
            receiverId,
            jobId
          );
          actualConversationId = conversation.id;
          console.log(`✅ Conversation created/found: ${actualConversationId}`);

          // Join sender to the new conversation room
          socket.join(actualConversationId.toString());
          console.log(`👥 User ${socket.userId} joined new conversation ${actualConversationId}`);
        }

        // ✅ Create message with actual conversation ID
        const message = await messageModel.sendMessage(
          actualConversationId,
          socket.userId,
          receiverId,
          content,
          jobId,
          imageUrl,
          attachments
        );

        console.log(`💬 Message saved: ${socket.userId} → ${receiverId} (Conversation: ${actualConversationId})`);
        console.log(`📤 Emitting to conversation room: ${actualConversationId}`);

        // ✅ FIX: Emit to CONVERSATION ROOM (both users receive it)
        io.to(actualConversationId.toString()).emit('new_message', {
          conversationId: actualConversationId,
          message: {
            id: message.id,
            content: message.content,
            sender_id: socket.userId,
            receiver_id: receiverId,
            created_at: message.created_at,
            image_url: message.image_url,
            attachments: message.attachments,
          },
        });

        console.log(`✅ new_message event emitted to room ${actualConversationId}`);

        // 📬 Also send confirmation to sender
        socket.emit('message_sent', {
          conversationId: actualConversationId,
          message: {
            id: message.id,
            conversation_id: actualConversationId,
            content: message.content,
            created_at: message.created_at,
            image_url: message.image_url,
            attachments: message.attachments,
          },
        });

        // Get sender details for the in-app notification
        const senderResult = await pool.query(
          `SELECT u.first_name, u.last_name, u.role, ep.company_name
           FROM users u
           LEFT JOIN entrepreneur_profiles ep ON u.id = ep.user_id AND u.role = 'entrepreneur'
           WHERE u.id = $1`,
          [socket.userId]
        );

        const sender = senderResult.rows[0];
        const senderName = sender
          ? (sender.role === 'entrepreneur' && sender.company_name ? sender.company_name : `${sender.first_name} ${sender.last_name}`)
          : 'Someone';

        // 🔔 Notify receiver's personal room for notifications (if they're not in the conversation)
        io.to(receiverId.toString()).emit('message_notification', {
          conversationId: actualConversationId,
          senderId: socket.userId,
          senderName,
          content,
        });

        // 💾 Save notification to database for persistence
        try {
          await createNotification({
            userId: receiverId,
            type: 'message',
            senderId: socket.userId,
            senderName,
            content: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
            conversationId: actualConversationId,
          });
          console.log(`💾 Message notification saved to database for user ${receiverId}`);
        } catch (notifError) {
          console.error('❌ Failed to save message notification:', notifError);
        }

        console.log(`✅ Message delivery complete`);
      } catch (error) {
        console.error('❌ Error in send_message:', error);
        console.error('❌ Error stack:', error.stack);
        socket.emit('error', {
          message: 'Failed to send message',
          error: error.message,
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
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
      // Update online status — only set offline if no other sockets for this user
      const userSockets = io.sockets.adapter.rooms.get(socket.userId.toString());
      if (!userSockets || userSockets.size === 0) {
        pool.query(
          `UPDATE user_online_status SET is_online = false, last_seen_at = NOW(), socket_id = NULL
           WHERE user_id = $1`,
          [socket.userId]
        ).catch(err => console.error('Failed to update offline status:', err));
      }
    });

    socket.on('error', (error) => {
      console.error('⚠️ Socket error:', error);
    });
  });

  console.log('✅ Socket.io initialized and ready');
  return io;
};

/**
 * Get the Socket.io instance for use in controllers
 * @returns {Server|null} The Socket.io server instance
 */
export const getIO = () => io;

export default setupSocket;