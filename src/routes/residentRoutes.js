import express from 'express';
import residentController from '../controllers/residentController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticateToken);

// ============================================
// RESIDENT PROFILE ROUTES
// ============================================
router.get('/profile', residentController.getProfile);
router.put('/profile', residentController.updateProfile);
router.put('/profile/online-status', residentController.updateOnlineStatus);

// ============================================
// EMERGENCY CONTACTS ROUTES
// ============================================
router.get('/emergency-contacts', residentController.getEmergencyContacts);
router.post('/emergency-contacts', residentController.addEmergencyContact);
router.put('/emergency-contacts/:contactId', residentController.updateEmergencyContact);
router.delete('/emergency-contacts/:contactId', residentController.deleteEmergencyContact);

// ============================================
// RESIDENT DIRECTORY ROUTES
// ============================================
router.get('/directory', residentController.getDirectory);
router.get('/directory/:residentId', residentController.getResidentProfile);

// ============================================
// ANNOUNCEMENTS ROUTES
// ============================================
router.get('/announcements', residentController.getAnnouncements);
router.post('/announcements', residentController.createAnnouncement);
router.put('/announcements/:announcementId', residentController.updateAnnouncement);
router.delete('/announcements/:announcementId', residentController.deleteAnnouncement);

// ============================================
// GROUP CHAT ROUTES (building BEFORE :chatId)
// ============================================
router.get('/group-chats', residentController.getGroupChats);
router.post('/group-chats', residentController.createGroupChat);
router.get('/group-chats/building', residentController.getBuildingGroupChat); // MUST BE BEFORE :chatId
router.get('/group-chats/:chatId/messages', residentController.getGroupMessages);
router.post('/group-chats/:chatId/messages', residentController.sendGroupMessage);
router.put('/group-chats/:chatId/read', residentController.markGroupChatAsRead);
router.get('/group-chats/:chatId/members', residentController.getGroupChatMembers);
router.get('/group-chats/:chatId/unread-count', residentController.getUnreadCount);

// ============================================
// DIRECT MESSAGE ROUTES
// ============================================
router.get('/direct-messages', residentController.getDirectMessageConversations);
router.get('/direct-messages/:recipientId/messages', residentController.getDirectMessages);
router.post('/direct-messages/:recipientId/messages', residentController.sendDirectMessage);
router.put('/direct-messages/:recipientId/read', residentController.markDMAsRead);

export default router;