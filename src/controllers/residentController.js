import residentModel from '../models/residentModel.js';
import pool from '../config/db.js';

const residentController = {
  // ============================================
  // RESIDENT PROFILE ENDPOINTS
  // ============================================
  async getProfile(req, res) {
    try {
      const userId = req.user.id;
      const profile = await residentModel.getOrCreateProfile(userId);
      const emergencyContacts = await residentModel.getEmergencyContacts(userId);
      
      res.json({
        success: true,
        profile: {
          ...profile,
          emergency_contacts: emergencyContacts,
          property_id: profile.property_id  // ✅ Explicitly include this
        }
      });
    } catch (error) {
      console.error('❌ Error getting resident profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get profile'
      });
    }
  },

  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const profileData = req.body;
      const existingProfile = await residentModel.getOrCreateProfile(userId);
      const updatedProfile = await residentModel.updateProfile(userId, profileData);

      // If property_id was updated, add resident to building group chat
      if (profileData.property_id && profileData.property_id !== existingProfile.property_id) {
        try {
          const buildingChat = await pool.query(`
            SELECT id, name
            FROM group_chats
            WHERE property_id = $1 AND chat_type = 'building'
            LIMIT 1
          `, [profileData.property_id]);

          if (buildingChat.rows.length > 0) {
            // FIX: Use addChatMember instead of addMemberToGroupChat
            await residentModel.addChatMember(buildingChat.rows[0].id, userId);
            console.log(`✅ Auto-added resident ${userId} to building group chat: ${buildingChat.rows[0].name}`);
          }
        } catch (groupChatError) {
          console.error('⚠️ Error adding resident to building group chat:', groupChatError);
        }
      }

      res.json({
        success: true,
        profile: updatedProfile,
        message: 'Profile updated successfully'
      });
    } catch (error) {
      console.error('❌ Error updating resident profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile'
      });
    }
  },

  async updateOnlineStatus(req, res) {
    try {
      const userId = req.user.id;
      const { is_online } = req.body;
      const profile = await residentModel.updateOnlineStatus(userId, is_online);
      res.json({
        success: true,
        profile,
        message: 'Online status updated'
      });
    } catch (error) {
      console.error('❌ Error updating online status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update online status'
      });
    }
  },

  // ============================================
  // EMERGENCY CONTACTS ENDPOINTS
  // ============================================
  async getEmergencyContacts(req, res) {
    try {
      const userId = req.user.id;
      const contacts = await residentModel.getEmergencyContacts(userId);
      res.json({
        success: true,
        contacts
      });
    } catch (error) {
      console.error('❌ Error getting emergency contacts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get emergency contacts'
      });
    }
  },

  async addEmergencyContact(req, res) {
    try {
      const userId = req.user.id;
      const contactData = req.body;
      await residentModel.getOrCreateProfile(userId);
      const contact = await residentModel.addEmergencyContact(userId, contactData);
      res.status(201).json({
        success: true,
        contact,
        message: 'Emergency contact added'
      });
    } catch (error) {
      console.error('❌ Error adding emergency contact:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add emergency contact'
      });
    }
  },

  async updateEmergencyContact(req, res) {
    try {
      const userId = req.user.id;
      const { contactId } = req.params;
      const contactData = req.body;
      const contact = await residentModel.updateEmergencyContact(contactId, userId, contactData);
      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Emergency contact not found'
        });
      }
      res.json({
        success: true,
        contact,
        message: 'Emergency contact updated'
      });
    } catch (error) {
      console.error('❌ Error updating emergency contact:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update emergency contact'
      });
    }
  },

  async deleteEmergencyContact(req, res) {
    try {
      const userId = req.user.id;
      const { contactId } = req.params;
      const contact = await residentModel.deleteEmergencyContact(contactId, userId);
      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Emergency contact not found'
        });
      }
      res.json({
        success: true,
        message: 'Emergency contact deleted'
      });
    } catch (error) {
      console.error('❌ Error deleting emergency contact:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete emergency contact'
      });
    }
  },

  // ============================================
  // RESIDENT DIRECTORY ENDPOINTS
  // ============================================
  async getDirectory(req, res) {
    try {
      const userId = req.user.id;
      const { search, status, floor, sortBy } = req.query;
      const profile = await residentModel.getResidentProfile(userId, userId);

      if (!profile || !profile.building_name) {
        return res.status(400).json({
          success: false,
          message: 'Please set your building/property in your profile first'
        });
      }

      console.log(`🔍 Fetching directory for building: ${profile.building_name}`);
      const residents = await residentModel.getBuildingResidentsByName(profile.building_name, {
        search,
        status,
        floor,
        sortBy
      });

      res.json({
        success: true,
        residents,
        building: {
          name: profile.building_name,
          address: profile.address
        }
      });
    } catch (error) {
      console.error('❌ Error getting resident directory:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get resident directory'
      });
    }
  },

  async getResidentProfile(req, res) {
    try {
      const viewerUserId = req.user.id;
      const { residentId } = req.params;
      const resident = await residentModel.getResidentProfile(residentId, viewerUserId);

      if (!resident) {
        return res.status(404).json({
          success: false,
          message: 'Resident not found'
        });
      }

      res.json({
        success: true,
        resident
      });
    } catch (error) {
      console.error('❌ Error getting resident profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get resident profile'
      });
    }
  },

  // ============================================
  // ANNOUNCEMENTS ENDPOINTS (SIMPLIFIED - NO DUPLICATE)
  // ============================================
  async getAnnouncements(req, res) {
    try {
      const userId = req.user.id;
      const { type, search, limit = 50, offset = 0 } = req.query;

      // Get user's resident profile with building_name
      const profile = await residentModel.getResidentProfile(userId, userId);

      if (!profile || !profile.building_name) {
        return res.json({
          success: true,
          announcements: [],
          message: 'No building assigned to your profile'
        });
      }

      console.log(`🔍 Fetching announcements for building: ${profile.building_name}`);

      const announcements = await residentModel.getAnnouncementsByBuildingName(
        profile.building_name,
        {
          type,
          search,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      );

      res.json({
        success: true,
        announcements
      });
    } catch (error) {
      console.error('❌ Error getting announcements:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get announcements'
      });
    }
  },

  async createAnnouncement(req, res) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const { property_id, title, content, type, priority, is_pinned } = req.body;

      if (userRole !== 'property_manager') {
        return res.status(403).json({
          success: false,
          message: 'Only property managers can create announcements'
        });
      }

      if (!property_id || !title || !content || !type) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: property_id, title, content, type'
        });
      }

      const announcement = await residentModel.createAnnouncement({
        property_id,
        posted_by_id: userId,
        title,
        content,
        type,
        priority: priority || 'normal',
        is_pinned: is_pinned || false
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      if (io) {
        io.to(`property_${property_id}`).emit('new_announcement', announcement);
      }

      res.status(201).json({
        success: true,
        announcement,
        message: 'Announcement created successfully'
      });
    } catch (error) {
      console.error('❌ Error creating announcement:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create announcement'
      });
    }
  },

  async updateAnnouncement(req, res) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const { announcementId } = req.params;
      const updateData = req.body;

      if (userRole !== 'property_manager') {
        return res.status(403).json({
          success: false,
          message: 'Only property managers can update announcements'
        });
      }

      const announcement = await residentModel.updateAnnouncement(
        announcementId,
        userId,
        updateData
      );

      if (!announcement) {
        return res.status(404).json({
          success: false,
          message: 'Announcement not found or you do not have permission to update it'
        });
      }

      res.json({
        success: true,
        announcement,
        message: 'Announcement updated successfully'
      });
    } catch (error) {
      console.error('❌ Error updating announcement:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update announcement'
      });
    }
  },

  async deleteAnnouncement(req, res) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const { announcementId } = req.params;

      if (userRole !== 'property_manager') {
        return res.status(403).json({
          success: false,
          message: 'Only property managers can delete announcements'
        });
      }

      const deleted = await residentModel.deleteAnnouncement(announcementId, userId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Announcement not found or you do not have permission to delete it'
        });
      }

      res.json({
        success: true,
        message: 'Announcement deleted successfully'
      });
    } catch (error) {
      console.error('❌ Error deleting announcement:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete announcement'
      });
    }
  },

  // ============================================
  // GROUP CHAT ENDPOINTS
  // ============================================
  async getGroupChats(req, res) {
    try {
      const userId = req.user.id;
      const groupChats = await residentModel.getUserGroupChats(userId);
      res.json({
        success: true,
        group_chats: groupChats
      });
    } catch (error) {
      console.error('❌ Error getting group chats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get group chats'
      });
    }
  },

  async getBuildingGroupChat(req, res) {
    try {
      const userId = req.user.id;
      const profile = await residentModel.getOrCreateProfile(userId);

      if (!profile.property_id) {
        return res.status(400).json({
          success: false,
          message: 'Please set your building/property in your profile first'
        });
      }

      const groupChat = await residentModel.getOrCreateBuildingChat(profile.property_id, userId);
      await residentModel.addChatMember(groupChat.id, userId);
      const members = await residentModel.getChatMembers(groupChat.id);

      res.json({
        success: true,
        group_chat: {
          ...groupChat,
          members
        }
      });
    } catch (error) {
      console.error('❌ Error getting building group chat:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get building group chat'
      });
    }
  },

  async getGroupMessages(req, res) {
    try {
      const { chatId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const messages = await residentModel.getGroupMessages(
        chatId,
        parseInt(limit),
        parseInt(offset)
      );

      res.json({
        success: true,
        messages
      });
    } catch (error) {
      console.error('❌ Error getting group messages:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get messages'
      });
    }
  },

  async sendGroupMessage(req, res) {
    try {
      const userId = req.user.id;
      const { chatId } = req.params;
      const { content, message_type } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          message: 'Message content is required'
        });
      }

      const message = await residentModel.sendGroupMessage(
        chatId,
        userId,
        content,
        message_type
      );

      await residentModel.updateLastRead(chatId, userId);

      const io = req.app.get('io');
      if (io) {
        io.to(`group_${chatId}`).emit('new_group_message', message);
      }

      res.status(201).json({
        success: true,
        message
      });
    } catch (error) {
      console.error('❌ Error sending group message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send message'
      });
    }
  },

  async markGroupChatAsRead(req, res) {
    try {
      const userId = req.user.id;
      const { chatId } = req.params;

      await residentModel.updateLastRead(chatId, userId);

      res.json({
        success: true,
        message: 'Chat marked as read'
      });
    } catch (error) {
      console.error('❌ Error marking chat as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark chat as read'
      });
    }
  },

  async getGroupChatMembers(req, res) {
    try {
      const { chatId } = req.params;
      const members = await residentModel.getChatMembers(chatId);

      res.json({
        success: true,
        members
      });
    } catch (error) {
      console.error('❌ Error getting chat members:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get chat members'
      });
    }
  },

  async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;
      const { chatId } = req.params;
      const unreadCount = await residentModel.getUnreadCount(chatId, userId);

      res.json({
        success: true,
        unread_count: unreadCount
      });
    } catch (error) {
      console.error('❌ Error getting unread count:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get unread count'
      });
    }
  },

  async createGroupChat(req, res) {
    try {
      const userId = req.user.id;
      const { name, description } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Group name is required'
        });
      }

      const profile = await residentModel.getOrCreateProfile(userId);

      if (!profile.property_id) {
        return res.status(400).json({
          success: false,
          message: 'You must be assigned to a property to create a group chat'
        });
      }

      const groupChat = await residentModel.createGroupChat({
        name: name.trim(),
        description: description?.trim() || null,
        property_id: profile.property_id,
        created_by_id: userId
      });

      res.status(201).json({
        success: true,
        groupChat,
        message: 'Group chat created successfully'
      });
    } catch (error) {
      console.error('❌ Error creating group chat:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create group chat'
      });
    }
  },

  // ============================================
  // DIRECT MESSAGE ENDPOINTS
  // ============================================
  async getDirectMessageConversations(req, res) {
    try {
      const userId = req.user.id;
      const profile = await residentModel.getOrCreateProfile(userId);

      if (!profile.property_id) {
        return res.json({
          success: true,
          conversations: []
        });
      }

      const conversations = await residentModel.getDirectMessageConversations(
        userId,
        profile.property_id
      );

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

      const messages = await residentModel.getDirectMessages(userId, recipientId, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        messages
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

      const senderProfile = await residentModel.getOrCreateProfile(userId);
      const recipientProfile = await residentModel.getOrCreateProfile(recipientId);

      if (!senderProfile.property_id || !recipientProfile.property_id) {
        return res.status(400).json({
          success: false,
          message: 'Both users must be assigned to a property'
        });
      }

      if (senderProfile.property_id !== recipientProfile.property_id) {
        return res.status(403).json({
          success: false,
          message: 'You can only message residents in your building'
        });
      }

      const message = await residentModel.sendDirectMessage({
        sender_id: userId,
        recipient_id: recipientId,
        message_text: message_text.trim()
      });

      const io = req.app.get('io');
      if (io) {
        const senderInfo = await pool.query(
          'SELECT first_name, last_name FROM users WHERE id = $1',
          [userId]
        );
        const senderName = senderInfo.rows[0]
          ? `${senderInfo.rows[0].first_name} ${senderInfo.rows[0].last_name}`
          : 'Unknown';

        io.to(recipientId).emit('new_direct_message', {
          message: {
            ...message,
            sender_name: senderName
          },
          sender_id: userId,
          recipient_id: recipientId
        });

        io.to(userId).emit('new_direct_message', {
          message: {
            ...message,
            sender_name: senderName
          },
          sender_id: userId,
          recipient_id: recipientId
        });

        console.log(`📨 Sent DM notification to ${recipientId} and ${userId}`);
      }

      res.status(201).json({
        success: true,
        message
      });
    } catch (error) {
      console.error('❌ Error sending direct message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send message'
      });
    }
  },

  async markDMAsRead(req, res) {
    try {
      const userId = req.user.id;
      const { recipientId } = req.params;

      await residentModel.markDMAsRead(userId, recipientId);

      res.json({
        success: true,
        message: 'Messages marked as read'
      });
    } catch (error) {
      console.error('❌ Error marking DM as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark messages as read'
      });
    }
  }
};

export default residentController;