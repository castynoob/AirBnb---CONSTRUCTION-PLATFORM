import groupChatModel from '../models/groupChatModel.js';
import residentModel from '../models/residentModel.js';
import onlineStatusModel from '../models/onlineStatusModel.js';
import typingIndicatorModel from '../models/typingIndicatorModel.js';

const groupChatController = {
  // ============================================
  // GET OR CREATE BUILDING GROUP CHAT
  // ============================================
  async getOrCreateBuildingGroupChat(req, res) {
    try {
      const userId = req.user.id;

      // Get resident profile to find their building
      const profile = await residentModel.getResidentProfile(userId, userId);

      if (!profile || !profile.building_name) {
        return res.status(400).json({
          success: false,
          message: 'Please set your building in your profile first'
        });
      }

      // Get or create group chat for this building
      const groupChat = await groupChatModel.getOrCreateBuildingGroupChat(
        profile.building_name,
        userId
      );

      // Add the user to the group chat if not already a member
      await groupChatModel.addMember(groupChat.id, userId);

      // Get all residents from the same building and add them
      const residents = await residentModel.getBuildingResidentsByName(profile.building_name);

      for (const resident of residents) {
        if (resident.user_id !== userId) {
          await groupChatModel.addMember(groupChat.id, resident.user_id);
        }
      }

      // Get updated group chat with member info
      const updatedGroupChat = await groupChatModel.getGroupChatById(groupChat.id, userId);
      const members = await groupChatModel.getGroupChatMembers(groupChat.id);

      res.json({
        success: true,
        groupChat: updatedGroupChat,
        members
      });
    } catch (error) {
      console.error('❌ Error getting/creating building group chat:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get building group chat'
      });
    }
  },

  // ============================================
  // GET USER'S GROUP CHATS
  // ============================================
  async getUserGroupChats(req, res) {
    try {
      const userId = req.user.id;

      const groupChats = await groupChatModel.getUserGroupChats(userId);

      res.json({
        success: true,
        groupChats
      });
    } catch (error) {
      console.error('❌ Error getting user group chats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get group chats'
      });
    }
  },

  // ============================================
  // GET GROUP CHAT DETAILS
  // ============================================
  async getGroupChatDetails(req, res) {
    try {
      const userId = req.user.id;
      const { groupChatId } = req.params;

      // Check if user is a member
      const isMember = await groupChatModel.isMember(groupChatId, userId);

      if (!isMember) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this group chat'
        });
      }

      const groupChat = await groupChatModel.getGroupChatById(groupChatId, userId);
      const members = await groupChatModel.getGroupChatMembers(groupChatId);

      res.json({
        success: true,
        groupChat,
        members
      });
    } catch (error) {
      console.error('❌ Error getting group chat details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get group chat details'
      });
    }
  },

  // ============================================
  // GET GROUP MESSAGES
  // ============================================
  async getGroupMessages(req, res) {
    try {
      const userId = req.user.id;
      const { groupChatId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      // Check if user is a member
      const isMember = await groupChatModel.isMember(groupChatId, userId);

      if (!isMember) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this group chat'
        });
      }

      const messages = await groupChatModel.getMessages(
        groupChatId,
        parseInt(limit),
        parseInt(offset)
      );

      // Update last read
      await groupChatModel.updateLastRead(groupChatId, userId);

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

  // ============================================
  // SEND GROUP MESSAGE
  // ============================================
  async sendGroupMessage(req, res) {
    try {
      const userId = req.user.id;
      const { groupChatId } = req.params;
      const { content } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Message content is required'
        });
      }

      // Check if user is a member
      const isMember = await groupChatModel.isMember(groupChatId, userId);

      if (!isMember) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this group chat'
        });
      }

      const message = await groupChatModel.sendMessage(groupChatId, userId, content.trim());

      // Get sender info
      const sender = await residentModel.getResidentProfile(userId, userId);

      // Emit socket event (handled by socket.io middleware)
      if (req.app.io) {
        req.app.io.to(`group_${groupChatId}`).emit('new_group_message', {
          ...message,
          sender_name: `${sender.first_name} ${sender.last_name}`,
          sender_picture: sender.profile_picture
        });
      }

      res.json({
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

  // ============================================
  // UPDATE GROUP CHAT
  // ============================================
  async updateGroupChat(req, res) {
    try {
      const userId = req.user.id;
      const { groupChatId } = req.params;
      const { name, description } = req.body;

      // Check if user is admin
      const isAdmin = await groupChatModel.isAdmin(groupChatId, userId);

      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Only admins can update group chat details'
        });
      }

      const groupChat = await groupChatModel.updateGroupChat(groupChatId, {
        name,
        description
      });

      res.json({
        success: true,
        groupChat
      });
    } catch (error) {
      console.error('❌ Error updating group chat:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update group chat'
      });
    }
  },

  // ============================================
  // ADD MEMBER TO GROUP CHAT
  // ============================================
  async addMember(req, res) {
    try {
      const userId = req.user.id;
      const { groupChatId } = req.params;
      const { memberId, isAdmin = false } = req.body;

      // Check if user is admin
      const isUserAdmin = await groupChatModel.isAdmin(groupChatId, userId);

      if (!isUserAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Only admins can add members'
        });
      }

      const member = await groupChatModel.addMember(groupChatId, memberId, isAdmin);

      res.json({
        success: true,
        member
      });
    } catch (error) {
      console.error('❌ Error adding member:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add member'
      });
    }
  },

  // ============================================
  // REMOVE MEMBER FROM GROUP CHAT
  // ============================================
  async removeMember(req, res) {
    try {
      const userId = req.user.id;
      const { groupChatId, memberId } = req.params;

      // Check if user is admin
      const isAdmin = await groupChatModel.isAdmin(groupChatId, userId);

      if (!isAdmin && userId !== memberId) {
        return res.status(403).json({
          success: false,
          message: 'Only admins can remove members, or you can leave yourself'
        });
      }

      await groupChatModel.removeMember(groupChatId, memberId);

      res.json({
        success: true,
        message: 'Member removed successfully'
      });
    } catch (error) {
      console.error('❌ Error removing member:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove member'
      });
    }
  },

  // ============================================
  // START TYPING IN GROUP CHAT
  // ============================================
  async startTyping(req, res) {
    try {
      const userId = req.user.id;
      const { groupChatId } = req.params;

      await typingIndicatorModel.startTypingGroup(userId, groupChatId);

      // Emit socket event
      if (req.app.io) {
        req.app.io.to(`group_${groupChatId}`).emit('user_typing_group', {
          groupChatId,
          userId,
          isTyping: true
        });
      }

      res.json({
        success: true
      });
    } catch (error) {
      console.error('❌ Error starting typing:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update typing status'
      });
    }
  },

  // ============================================
  // STOP TYPING IN GROUP CHAT
  // ============================================
  async stopTyping(req, res) {
    try {
      const userId = req.user.id;
      const { groupChatId } = req.params;

      await typingIndicatorModel.stopTyping(userId, null, groupChatId);

      // Emit socket event
      if (req.app.io) {
        req.app.io.to(`group_${groupChatId}`).emit('user_typing_group', {
          groupChatId,
          userId,
          isTyping: false
        });
      }

      res.json({
        success: true
      });
    } catch (error) {
      console.error('❌ Error stopping typing:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update typing status'
      });
    }
  }
};

export default groupChatController;