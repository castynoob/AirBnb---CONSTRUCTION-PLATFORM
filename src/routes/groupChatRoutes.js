import express from 'express';
import groupChatController from '../controllers/groupChatController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get or create building group chat
router.get('/building', groupChatController.getOrCreateBuildingGroupChat);

// Get user's group chats
router.get('/', groupChatController.getUserGroupChats);

// Get group chat details
router.get('/:groupChatId', groupChatController.getGroupChatDetails);

// Get group messages
router.get('/:groupChatId/messages', groupChatController.getGroupMessages);

// Send group message
router.post('/:groupChatId/messages', groupChatController.sendGroupMessage);

// Update group chat
router.put('/:groupChatId', groupChatController.updateGroupChat);

// Add member to group chat
router.post('/:groupChatId/members', groupChatController.addMember);

// Remove member from group chat
router.delete('/:groupChatId/members/:memberId', groupChatController.removeMember);

// Typing indicators
router.post('/:groupChatId/typing/start', groupChatController.startTyping);
router.post('/:groupChatId/typing/stop', groupChatController.stopTyping);

export default router;