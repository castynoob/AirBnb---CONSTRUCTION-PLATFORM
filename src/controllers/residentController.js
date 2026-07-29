import residentModel from '../models/residentModel.js';
import pool from '../config/db.js';
import { broadcastAnnouncementToCondoControl } from '../services/condoControlBroadcast.js';

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
      const userRole = req.user.role;
      const { search, status, floor, sortBy, property_id } = req.query;

      let buildingName = null;
      let buildingAddress = null;

      // If property manager, check their owned properties
      if (userRole === 'property_manager') {
        // Get the property manager's properties
        const propertyQuery = await pool.query(
          `SELECT id, building_name, address FROM properties WHERE manager_id = $1 ORDER BY created_at DESC`,
          [userId]
        );

        if (propertyQuery.rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'You do not own any properties'
          });
        }

        // Use specified property_id or first property
        let property;
        if (property_id) {
          property = propertyQuery.rows.find(p => p.id === property_id);
          if (!property) {
            return res.status(400).json({
              success: false,
              message: 'Property not found or you do not own it'
            });
          }
        } else {
          property = propertyQuery.rows[0];
        }

        buildingName = property.building_name;
        buildingAddress = property.address;
        console.log(`🔍 Property manager fetching directory for owned building: ${buildingName}`);
      } else {
        // For residents, use their profile
        const profile = await residentModel.getResidentProfile(userId, userId);

        if (!profile || (!profile.building_name && !profile.property_id)) {
          return res.status(400).json({
            success: false,
            message: 'Please set your building/property in your profile first'
          });
        }

        // If resident has property_id, get the building_name from the property
        if (profile.property_id) {
          const propertyQuery = await pool.query(
            `SELECT building_name, address FROM properties WHERE id = $1`,
            [profile.property_id]
          );
          if (propertyQuery.rows.length > 0) {
            buildingName = propertyQuery.rows[0].building_name;
            buildingAddress = propertyQuery.rows[0].address;
          }
        }

        // Fallback to profile building_name if property lookup failed
        if (!buildingName) {
          buildingName = profile.building_name;
          buildingAddress = profile.address;
        }

        console.log(`🔍 Resident fetching directory for building: ${buildingName} (property_id: ${profile.property_id})`);
      }

      // Get property_id if we have it (for more accurate owner lookup)
      let propertyId = null;
      if (userRole === 'property_manager') {
        // Already handled above - use the property we found
        const propertyQuery2 = await pool.query(
          `SELECT id FROM properties WHERE building_name = $1 OR address = $1 LIMIT 1`,
          [buildingName]
        );
        if (propertyQuery2.rows.length > 0) {
          propertyId = propertyQuery2.rows[0].id;
        }
      } else {
        const profile = await residentModel.getResidentProfile(userId, userId);
        propertyId = profile?.property_id;
      }

      console.log(`🔍 Calling getBuildingResidentsByName with: "${buildingName}", propertyId: ${propertyId}`);
      const residents = await residentModel.getBuildingResidentsByName(buildingName, {
        search,
        status,
        floor,
        sortBy,
        propertyId  // Pass property_id for more accurate owner lookup
      });
      console.log(`🔍 Found ${residents.length} residents, owners: ${residents.filter(r => r.is_owner).length}`);

      res.json({
        success: true,
        residents,
        building: {
          name: buildingName,
          address: buildingAddress
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
      const {
        property_id,
        title,
        content,
        type,
        priority,
        is_pinned,
        // Manager opts in per-announcement. Default false so nothing is sent
        // externally without an explicit tick, even if the property has an
        // ingestion address on file.
        broadcast_to_condo_control,
      } = req.body;

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

      // Broadcast to the property's Condo Control (or similar) inbox when the
      // manager opted in on this announcement. Fire-and-forget: broadcasting
      // must not block the create response, and any failure is surfaced to
      // logs only — the announcement is already live on INTERVOS.
      let condoControlBroadcast = null;
      if (broadcast_to_condo_control) {
        try {
          const nameRow = await pool.query(
            `SELECT COALESCE(mp.company_name, u.first_name || ' ' || u.last_name) AS sender_name
             FROM users u
             LEFT JOIN manager_profiles mp ON mp.user_id = u.id
             WHERE u.id = $1`,
            [userId]
          );
          const senderName = nameRow.rows[0]?.sender_name || 'Property Manager';
          condoControlBroadcast = await broadcastAnnouncementToCondoControl({
            announcement,
            propertyId: property_id,
            senderName,
          });
        } catch (broadcastErr) {
          console.error('⚠️ Condo Control broadcast wrapper failed:', broadcastErr.message);
          condoControlBroadcast = { ok: false, reason: 'error' };
        }
      }

      res.status(201).json({
        success: true,
        announcement,
        message: 'Announcement created successfully',
        condoControlBroadcast, // null when not requested; { ok, reason? } otherwise
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
      const userRole = req.user.role;

      // Get user's existing group chats
      let groupChats = await residentModel.getUserGroupChats(userId);

      // If property manager, also ensure they're added to their building chats
      if (userRole === 'property_manager') {
        const propertyQuery = await pool.query(
          `SELECT id, building_name FROM properties WHERE manager_id = $1`,
          [userId]
        );

        // For each owned property, ensure the building chat exists and manager is a member
        for (const property of propertyQuery.rows) {
          if (property.id) {
            try {
              const buildingChat = await residentModel.getOrCreateBuildingChat(property.id, userId);
              await residentModel.addChatMember(buildingChat.id, userId, true); // Add as admin
            } catch (err) {
              console.error(`Error ensuring manager in building chat for property ${property.id}:`, err);
            }
          }
        }

        // Re-fetch group chats after ensuring membership
        groupChats = await residentModel.getUserGroupChats(userId);
      } else {
        // For residents, ensure they are in their building chat and property manager is also added
        const profile = await residentModel.getOrCreateProfile(userId);
        if (profile.property_id) {
          try {
            console.log(`🔍 Resident fetching group chats - ensuring resident and property manager are in building chat for property ${profile.property_id}`);
            const buildingChat = await residentModel.getOrCreateBuildingChat(profile.property_id, userId);
            // Also add the resident to the building chat if not already a member
            await residentModel.addChatMember(buildingChat.id, userId, false);
            console.log(`✅ Ensured resident ${userId} is in building chat ${buildingChat.id}`);
          } catch (err) {
            console.error(`Error ensuring resident/property manager in building chat:`, err);
          }
        }
        // Re-fetch group chats after ensuring membership
        groupChats = await residentModel.getUserGroupChats(userId);
      }

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
      const userRole = req.user.role;
      const { property_id } = req.query;

      let propertyId = null;

      // If property manager, use their owned property
      if (userRole === 'property_manager') {
        const propertyQuery = await pool.query(
          `SELECT id FROM properties WHERE manager_id = $1 ORDER BY created_at DESC`,
          [userId]
        );

        if (propertyQuery.rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'You do not own any properties'
          });
        }

        // Use specified property_id or first property
        if (property_id) {
          const ownedProperty = propertyQuery.rows.find(p => p.id === property_id);
          if (!ownedProperty) {
            return res.status(400).json({
              success: false,
              message: 'Property not found or you do not own it'
            });
          }
          propertyId = ownedProperty.id;
        } else {
          propertyId = propertyQuery.rows[0].id;
        }
      } else {
        // For residents, use their profile
        const profile = await residentModel.getOrCreateProfile(userId);

        if (profile.property_id) {
          propertyId = profile.property_id;
        } else if (profile.property_name || profile.resolved_building_name) {
          // Try to find property by property_name or resolved_building_name
          const buildingName = profile.property_name || profile.resolved_building_name;
          const propertyQuery = await pool.query(
            `SELECT id FROM properties WHERE building_name = $1 OR address = $1 LIMIT 1`,
            [buildingName]
          );

          if (propertyQuery.rows.length > 0) {
            propertyId = propertyQuery.rows[0].id;
          } else {
            return res.status(400).json({
              success: false,
              message: 'No matching property found for your building. Please contact the property manager.'
            });
          }
        } else {
          return res.status(400).json({
            success: false,
            message: 'Please set your building/property in your profile first'
          });
        }
      }

      const groupChat = await residentModel.getOrCreateBuildingChat(propertyId, userId);
      await residentModel.addChatMember(groupChat.id, userId, userRole === 'property_manager');
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
  // DIRECT MESSAGE ENDPOINTS (Now using unified conversations/messages tables)
  // ============================================
  async getDirectMessageConversations(req, res) {
    try {
      const userId = req.user.id;

      // Get all conversations from the unified conversations table
      // This now uses the same table as entrepreneur messages
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
          CASE
            WHEN u.role = 'property_manager' THEN 'Property Manager'
            ELSE rp.unit_number
          END as unit_number,
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
          AND u.role IN ('resident', 'property_manager')
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
        is_property_manager: conv.role === 'property_manager'
      }));

      console.log(`📋 Found ${conversations.length} DM conversations for user ${userId}`);

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
        // No conversation exists yet
        return res.json({
          success: true,
          messages: []
        });
      }

      const conversationId = convQuery.rows[0].id;

      // Get messages from the unified messages table
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

      // Check if recipient exists
      const recipientQuery = await pool.query(
        'SELECT id, role FROM users WHERE id = $1',
        [recipientId]
      );

      if (recipientQuery.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Recipient not found'
        });
      }

      const recipientRole = recipientQuery.rows[0].role;
      console.log(`📧 User ${userId} sending message to ${recipientId} (role: ${recipientRole})`);

      // For resident-to-resident, check they're in the same building
      if (recipientRole === 'resident') {
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
      }

      // Get or create conversation in the unified conversations table
      let convQuery = await pool.query(
        `SELECT id FROM conversations
         WHERE (participant1_id = $1 AND participant2_id = $2)
            OR (participant1_id = $2 AND participant2_id = $1)
         LIMIT 1`,
        [userId, recipientId]
      );

      let conversationId;
      if (convQuery.rows.length === 0) {
        // Create new conversation
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
          sender_id: userId,
          recipient_id: recipientId
        });

        console.log(`📨 Sent message notification to ${recipientId} and ${userId}`);
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

      // Find the conversation and mark messages as read in unified table
      const convQuery = await pool.query(
        `SELECT id FROM conversations
         WHERE (participant1_id = $1 AND participant2_id = $2)
            OR (participant1_id = $2 AND participant2_id = $1)
         LIMIT 1`,
        [userId, recipientId]
      );

      if (convQuery.rows.length > 0) {
        await pool.query(
          `UPDATE messages
           SET is_read = TRUE, read_at = NOW()
           WHERE conversation_id = $1 AND receiver_id = $2 AND is_read = FALSE`,
          [convQuery.rows[0].id, userId]
        );
      }

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