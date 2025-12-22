import express from 'express';
import multer from 'multer';
import messageController from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';  // ✅ CORRECT NAME

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// ============================================
// ALL ROUTES REQUIRE AUTHENTICATION
// ============================================
router.use(authenticateToken);  // ✅ CHANGED THIS TOO

// ============================================
// GET USER'S CONVERSATIONS
// ============================================
router.get('/conversations', messageController.getConversations);

// ============================================
// START NEW CONVERSATION
// ============================================
router.post('/conversations', messageController.startConversation);

// ============================================
// GET MESSAGES IN A CONVERSATION
// ============================================
router.get('/conversations/:conversationId/messages', messageController.getMessages);

// ============================================
// SEND MESSAGE
// ============================================
router.post('/messages', messageController.sendMessage);

// ============================================
// MARK CONVERSATION AS READ
// ============================================
router.put('/conversations/:conversationId/read', messageController.markAsRead);

// ============================================
// DELETE MESSAGE
// ============================================
router.delete('/messages/:messageId', messageController.deleteMessage);

// ============================================
// GET UNREAD MESSAGE COUNT
// ============================================
router.get('/unread-count', messageController.getUnreadCount);

// ============================================
// CHECK IF USER CAN MESSAGE ANOTHER USER
// ============================================
router.get('/can-message/:otherUserId', messageController.checkMessageAccess);

// ============================================
// UPLOAD MESSAGE ATTACHMENT
// ============================================
router.post('/messages/upload-attachment', upload.single('file'), messageController.uploadAttachment);

// ============================================
// DIRECT MESSAGES (for property manager to access direct_messages table)
// ============================================
router.get('/direct-messages', messageController.getDirectMessageConversations);
router.get('/direct-messages/:recipientId/messages', messageController.getDirectMessages);
router.post('/direct-messages/:recipientId', messageController.sendDirectMessage);

export default router;
