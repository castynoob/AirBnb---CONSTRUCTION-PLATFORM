import pool from '../config/db.js';

const residentModel = {
  // ============================================
  // RESIDENT PROFILE METHODS
  // ============================================

  /**
   * Get or create resident profile
   */
  async getOrCreateProfile(userId) {
    const checkQuery = `
      SELECT rp.*, u.email, u.first_name, u.last_name, u.phone,
             p.building_name, p.address
      FROM resident_profiles rp
      JOIN users u ON rp.user_id = u.id
      LEFT JOIN properties p ON rp.property_id = p.id
      WHERE rp.user_id = $1
    `;

    const checkResult = await pool.query(checkQuery, [userId]);

    if (checkResult.rows.length > 0) {
      return checkResult.rows[0];
    }

    // Create new profile
    const createQuery = `
      INSERT INTO resident_profiles (user_id)
      VALUES ($1)
      RETURNING *
    `;
    const createResult = await pool.query(createQuery, [userId]);

    // Get full profile data
    const fullProfileResult = await pool.query(checkQuery, [userId]);
    return fullProfileResult.rows[0];
  },

  /**
   * Update resident profile
   */
  async updateProfile(userId, profileData) {
    const {
      property_id, unit_number, floor, building_section, move_in_date, bio, profile_picture,
      show_email, show_phone, show_unit, show_move_in_date, allow_messages, show_online_status,
      contact_via_email, contact_via_phone, contact_via_message
    } = profileData;

    const query = `
      UPDATE resident_profiles
      SET
        property_id = COALESCE($2, property_id),
        unit_number = COALESCE($3, unit_number),
        floor = COALESCE($4, floor),
        building_section = COALESCE($5, building_section),
        move_in_date = COALESCE($6, move_in_date),
        bio = COALESCE($7, bio),
        profile_picture = COALESCE($8, profile_picture),
        show_email = COALESCE($9, show_email),
        show_phone = COALESCE($10, show_phone),
        show_unit = COALESCE($11, show_unit),
        show_move_in_date = COALESCE($12, show_move_in_date),
        allow_messages = COALESCE($13, allow_messages),
        show_online_status = COALESCE($14, show_online_status),
        contact_via_email = COALESCE($15, contact_via_email),
        contact_via_phone = COALESCE($16, contact_via_phone),
        contact_via_message = COALESCE($17, contact_via_message),
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [
      userId, property_id, unit_number, floor, building_section, move_in_date, bio, profile_picture,
      show_email, show_phone, show_unit, show_move_in_date, allow_messages, show_online_status,
      contact_via_email, contact_via_phone, contact_via_message
    ]);

    return result.rows[0];
  },

  /**
   * Update online status
   */
  async updateOnlineStatus(userId, isOnline) {
    const query = `
      UPDATE resident_profiles
      SET is_online = $2, last_seen = NOW()
      WHERE user_id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [userId, isOnline]);
    return result.rows[0];
  },

  // ============================================
  // EMERGENCY CONTACTS METHODS
  // ============================================

  /**
   * Get emergency contacts for a resident
   */
  async getEmergencyContacts(userId) {
    const query = `
      SELECT ec.*
      FROM emergency_contacts ec
      JOIN resident_profiles rp ON ec.resident_profile_id = rp.id
      WHERE rp.user_id = $1
      ORDER BY ec.created_at ASC
    `;

    const result = await pool.query(query, [userId]);
    return result.rows;
  },

  /**
   * Add emergency contact
   */
  async addEmergencyContact(userId, contactData) {
    const { name, relationship, phone, email } = contactData;

    // Get resident profile id
    const profileQuery = `SELECT id FROM resident_profiles WHERE user_id = $1`;
    const profileResult = await pool.query(profileQuery, [userId]);

    if (profileResult.rows.length === 0) {
      throw new Error('Resident profile not found');
    }

    const residentProfileId = profileResult.rows[0].id;

    const query = `
      INSERT INTO emergency_contacts (resident_profile_id, name, relationship, phone, email)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await pool.query(query, [residentProfileId, name, relationship, phone, email]);
    return result.rows[0];
  },

  /**
   * Update emergency contact
   */
  async updateEmergencyContact(contactId, userId, contactData) {
    const { name, relationship, phone, email } = contactData;

    const query = `
      UPDATE emergency_contacts ec
      SET
        name = COALESCE($3, name),
        relationship = COALESCE($4, relationship),
        phone = COALESCE($5, phone),
        email = COALESCE($6, email),
        updated_at = NOW()
      FROM resident_profiles rp
      WHERE ec.id = $1 AND ec.resident_profile_id = rp.id AND rp.user_id = $2
      RETURNING ec.*
    `;

    const result = await pool.query(query, [contactId, userId, name, relationship, phone, email]);
    return result.rows[0];
  },

  /**
   * Delete emergency contact
   */
  async deleteEmergencyContact(contactId, userId) {
    const query = `
      DELETE FROM emergency_contacts ec
      USING resident_profiles rp
      WHERE ec.id = $1 AND ec.resident_profile_id = rp.id AND rp.user_id = $2
      RETURNING ec.*
    `;

    const result = await pool.query(query, [contactId, userId]);
    return result.rows[0];
  },

  // ============================================
  // RESIDENT DIRECTORY METHODS
  // ============================================

  /**
   * Get all residents in a building (respecting privacy settings)
   */
  async getBuildingResidents(propertyId, filters = {}) {
    const { search, status, floor, sortBy = 'name' } = filters;

    let query = `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        CASE WHEN rp.show_email THEN u.email ELSE NULL END as email,
        CASE WHEN rp.show_phone THEN u.phone ELSE NULL END as phone,
        CASE WHEN rp.show_unit THEN rp.unit_number ELSE NULL END as unit_number,
        CASE WHEN rp.show_unit THEN rp.floor ELSE NULL END as floor,
        rp.building_section,
        CASE WHEN rp.show_move_in_date THEN rp.move_in_date ELSE NULL END as move_in_date,
        rp.bio,
        rp.profile_picture,
        CASE WHEN rp.show_online_status THEN rp.is_online ELSE false END as is_online,
        CASE WHEN rp.show_online_status THEN rp.last_seen ELSE NULL END as last_seen,
        rp.allow_messages,
        rp.contact_via_email,
        rp.contact_via_phone,
        rp.contact_via_message
      FROM resident_profiles rp
      JOIN users u ON rp.user_id = u.id
      WHERE rp.property_id = $1
    `;

    const params = [propertyId];
    let paramCount = 1;

    // Add search filter
    if (search) {
      paramCount++;
      query += ` AND (
        u.first_name ILIKE $${paramCount} OR
        u.last_name ILIKE $${paramCount} OR
        rp.unit_number ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
    }

    // Add online status filter
    if (status === 'online') {
      query += ` AND rp.is_online = true`;
    } else if (status === 'offline') {
      query += ` AND rp.is_online = false`;
    }

    // Add floor filter
    if (floor) {
      paramCount++;
      query += ` AND rp.floor = $${paramCount}`;
      params.push(floor);
    }

    // Add sorting
    if (sortBy === 'name') {
      query += ` ORDER BY u.first_name, u.last_name`;
    } else if (sortBy === 'unit') {
      query += ` ORDER BY rp.unit_number`;
    } else if (sortBy === 'recently_active') {
      query += ` ORDER BY rp.last_seen DESC NULLS LAST`;
    }

    const result = await pool.query(query, params);
    return result.rows;
  },

  /**
   * Get building residents by property_name (user's text input)
   */
  async getBuildingResidentsByName(propertyName, options = {}) {
    const { search, status, floor, sortBy } = options;

    let query = `
      SELECT
        rp.user_id,
        u.first_name,
        u.last_name,
        CASE WHEN rp.show_email THEN u.email ELSE NULL END as email,
        CASE WHEN rp.show_phone THEN u.phone ELSE NULL END as phone,
        CASE WHEN rp.show_unit THEN rp.unit_number ELSE NULL END as unit_number,
        CASE WHEN rp.show_unit THEN rp.floor ELSE NULL END as floor,
        rp.building_section,
        CASE WHEN rp.show_move_in_date THEN rp.move_in_date ELSE NULL END as move_in_date,
        rp.bio,
        rp.profile_picture,
        CASE WHEN rp.show_online_status THEN rp.is_online ELSE false END as is_online,
        CASE WHEN rp.show_online_status THEN rp.last_seen ELSE NULL END as last_seen,
        rp.allow_messages,
        rp.contact_via_email,
        rp.contact_via_phone,
        rp.contact_via_message,
        rp.show_email,
        rp.show_phone,
        rp.show_unit,
        rp.show_move_in_date,
        rp.show_online_status
      FROM resident_profiles rp
      JOIN users u ON rp.user_id = u.id
      WHERE rp.property_name = $1
    `;

    const params = [propertyName];
    let paramCount = 1;

    // Add search filter
    if (search) {
      paramCount++;
      query += ` AND (
        u.first_name ILIKE $${paramCount} OR
        u.last_name ILIKE $${paramCount} OR
        rp.unit_number ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
    }

    // Add online status filter
    if (status === 'online') {
      query += ` AND rp.is_online = true`;
    } else if (status === 'offline') {
      query += ` AND rp.is_online = false`;
    }

    // Add floor filter
    if (floor) {
      paramCount++;
      query += ` AND rp.floor = $${paramCount}`;
      params.push(floor);
    }

    // Add sorting
    if (sortBy === 'name') {
      query += ` ORDER BY u.first_name, u.last_name`;
    } else if (sortBy === 'unit') {
      query += ` ORDER BY rp.unit_number`;
    } else if (sortBy === 'recently_active') {
      query += ` ORDER BY rp.last_seen DESC NULLS LAST`;
    } else {
      query += ` ORDER BY u.first_name, u.last_name`;
    }

    const result = await pool.query(query, params);
    return result.rows;
  },

  /**
   * Get single resident profile (for directory view)
   */
  async getResidentProfile(residentUserId, viewerUserId) {
    const query = `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        CASE WHEN rp.show_email THEN u.email ELSE NULL END as email,
        CASE WHEN rp.show_phone THEN u.phone ELSE NULL END as phone,
        CASE WHEN rp.show_unit THEN rp.unit_number ELSE NULL END as unit_number,
        CASE WHEN rp.show_unit THEN rp.floor ELSE NULL END as floor,
        rp.building_section,
        CASE WHEN rp.show_move_in_date THEN rp.move_in_date ELSE NULL END as move_in_date,
        rp.bio,
        rp.profile_picture,
        CASE WHEN rp.show_online_status THEN rp.is_online ELSE false END as is_online,
        CASE WHEN rp.show_online_status THEN rp.last_seen ELSE NULL END as last_seen,
        rp.allow_messages,
        rp.contact_via_email,
        rp.contact_via_phone,
        rp.contact_via_message,
        COALESCE(rp.property_name, p.building_name) as building_name,
        p.address
      FROM resident_profiles rp
      JOIN users u ON rp.user_id = u.id
      LEFT JOIN properties p ON rp.property_id = p.id
      WHERE u.id = $1
    `;

    const result = await pool.query(query, [residentUserId]);
    return result.rows[0];
  },

  // ============================================
  // ANNOUNCEMENTS METHODS
  // ============================================

  /**
   * Get announcements for a building
   */
  async getAnnouncements(propertyId, filters = {}) {
    const { type, search, limit = 50, offset = 0 } = filters;

    let query = `
      SELECT
        a.*,
        u.first_name || ' ' || u.last_name as posted_by_name,
        u.role as posted_by_role
      FROM announcements a
      JOIN users u ON a.posted_by_id = u.id
      WHERE a.property_id = $1
    `;

    const params = [propertyId];
    let paramCount = 1;

    if (type && type !== 'All') {
      paramCount++;
      query += ` AND a.type = $${paramCount}`;
      params.push(type);
    }

    if (search) {
      paramCount++;
      query += ` AND (a.title ILIKE $${paramCount} OR a.content ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY a.is_pinned DESC, a.created_at DESC`;

    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await pool.query(query, params);
    return result.rows;
  },

  /**
   * Create announcement (property managers only)
   */
  async createAnnouncement(announcementData) {
    const { property_id, posted_by_id, title, content, type, priority, is_pinned } = announcementData;

    const query = `
      INSERT INTO announcements (property_id, posted_by_id, title, content, type, priority, is_pinned)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await pool.query(query, [
      property_id, posted_by_id, title, content, type,
      priority || 'normal', is_pinned || false
    ]);

    return result.rows[0];
  },

  /**
   * Update announcement
   */
  async updateAnnouncement(announcementId, updateData) {
    const { title, content, type, priority, is_pinned } = updateData;

    const query = `
      UPDATE announcements
      SET
        title = COALESCE($2, title),
        content = COALESCE($3, content),
        type = COALESCE($4, type),
        priority = COALESCE($5, priority),
        is_pinned = COALESCE($6, is_pinned),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [
      announcementId, title, content, type, priority, is_pinned
    ]);

    return result.rows[0];
  },

  /**
   * Delete announcement
   */
  async deleteAnnouncement(announcementId) {
    const query = `DELETE FROM announcements WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [announcementId]);
    return result.rows[0];
  },

  // ============================================
  // GROUP CHAT METHODS
  // ============================================

  /**
   * Get or create building group chat
   */
  async getOrCreateBuildingChat(propertyId, createdById) {
    // Check if building chat exists
    const checkQuery = `
      SELECT * FROM group_chats
      WHERE property_id = $1 AND chat_type = 'building'
      LIMIT 1
    `;

    const checkResult = await pool.query(checkQuery, [propertyId]);

    if (checkResult.rows.length > 0) {
      return checkResult.rows[0];
    }

    // Get property name
    const propertyQuery = `SELECT building_name, address FROM properties WHERE id = $1`;
    const propertyResult = await pool.query(propertyQuery, [propertyId]);
    const property = propertyResult.rows[0];

    const chatName = property?.building_name || property?.address || 'Building Community';

    // Create building chat
    const createQuery = `
      INSERT INTO group_chats (property_id, name, description, chat_type, created_by_id)
      VALUES ($1, $2, $3, 'building', $4)
      RETURNING *
    `;

    const result = await pool.query(createQuery, [
      propertyId,
      chatName,
      'Community chat for all building residents',
      createdById
    ]);

    return result.rows[0];
  },

  /**
   * Add member to group chat
   */
  async addChatMember(groupChatId, userId, isAdmin = false) {
    const query = `
      INSERT INTO group_chat_members (group_chat_id, user_id, is_admin)
      VALUES ($1, $2, $3)
      ON CONFLICT (group_chat_id, user_id) DO NOTHING
      RETURNING *
    `;

    const result = await pool.query(query, [groupChatId, userId, isAdmin]);
    return result.rows[0];
  },

  /**
   * Get group chat members
   */
  async getChatMembers(groupChatId) {
    const query = `
      SELECT
        gcm.*,
        u.first_name,
        u.last_name,
        rp.profile_picture,
        rp.is_online,
        rp.show_online_status
      FROM group_chat_members gcm
      JOIN users u ON gcm.user_id = u.id
      LEFT JOIN resident_profiles rp ON rp.user_id = u.id
      WHERE gcm.group_chat_id = $1
      ORDER BY u.first_name, u.last_name
    `;

    const result = await pool.query(query, [groupChatId]);
    return result.rows;
  },

  /**
   * Get group messages
   */
  async getGroupMessages(groupChatId, limit = 50, offset = 0) {
    const query = `
      SELECT
        gm.*,
        u.first_name || ' ' || u.last_name as sender_name,
        rp.profile_picture as sender_picture
      FROM group_messages gm
      JOIN users u ON gm.sender_id = u.id
      LEFT JOIN resident_profiles rp ON rp.user_id = u.id
      WHERE gm.group_chat_id = $1
      ORDER BY gm.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [groupChatId, limit, offset]);
    return result.rows.reverse(); // Return oldest first
  },

  /**
   * Send group message
   */
  async sendGroupMessage(groupChatId, senderId, content, messageType = 'text') {
    const query = `
      INSERT INTO group_messages (group_chat_id, sender_id, content, message_type)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await pool.query(query, [groupChatId, senderId, content, messageType]);

    // Get full message with sender info
    const fullMessageQuery = `
      SELECT
        gm.*,
        u.first_name || ' ' || u.last_name as sender_name,
        rp.profile_picture as sender_picture
      FROM group_messages gm
      JOIN users u ON gm.sender_id = u.id
      LEFT JOIN resident_profiles rp ON rp.user_id = u.id
      WHERE gm.id = $1
    `;

    const fullResult = await pool.query(fullMessageQuery, [result.rows[0].id]);
    return fullResult.rows[0];
  },

  /**
   * Update last read timestamp for user in group chat
   */
  async updateLastRead(groupChatId, userId) {
    const query = `
      UPDATE group_chat_members
      SET last_read_at = NOW()
      WHERE group_chat_id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [groupChatId, userId]);
    return result.rows[0];
  },

  /**
   * Get unread message count
   */
  async getUnreadCount(groupChatId, userId) {
    const query = `
      SELECT COUNT(*) as unread_count
      FROM group_messages gm
      JOIN group_chat_members gcm ON gm.group_chat_id = gcm.group_chat_id
      WHERE gm.group_chat_id = $1
        AND gcm.user_id = $2
        AND gm.created_at > COALESCE(gcm.last_read_at, '1970-01-01')
        AND gm.sender_id != $2
    `;

    const result = await pool.query(query, [groupChatId, userId]);
    return parseInt(result.rows[0].unread_count);
  },

  /**
   * Get user's group chats
   */
  async getUserGroupChats(userId) {
    const query = `
      SELECT
        gc.id,
        gc.property_id,
        gc.name,
        gc.description,
        gc.building_name,
        gc.chat_type,
        gc.created_by_id,
        gc.created_at,
        gc.updated_at,
        gc.is_active,
        gcm.is_admin,
        gcm.last_read_at,
        (
          SELECT COUNT(*)
          FROM group_messages gm
          WHERE gm.group_chat_id = gc.id
            AND gm.created_at > COALESCE(gcm.last_read_at, '1970-01-01')
            AND gm.sender_id != $1
        ) as unread_count,
        (
          SELECT content
          FROM group_messages
          WHERE group_chat_id = gc.id
          ORDER BY created_at DESC
          LIMIT 1
        ) as last_message,
        (
          SELECT created_at
          FROM group_messages
          WHERE group_chat_id = gc.id
          ORDER BY created_at DESC
          LIMIT 1
        ) as last_message_at,
        (
          SELECT COUNT(*)
          FROM group_chat_members
          WHERE group_chat_id = gc.id
        ) as member_count
      FROM group_chats gc
      JOIN group_chat_members gcm ON gc.id = gcm.group_chat_id
      WHERE gcm.user_id = $1
      ORDER BY last_message_at DESC NULLS LAST
    `;

    const result = await pool.query(query, [userId]);
    return result.rows;
  },

  // ============================================
  // ANNOUNCEMENTS MODEL FUNCTIONS
  // ============================================

  /**
   * Get announcements for a property (legacy - by property_id)
   */
  async getAnnouncements(propertyId, options = {}) {
    const { type, search, limit = 50, offset = 0 } = options;

    let query = `
      SELECT
        a.*,
        u.first_name || ' ' || u.last_name as posted_by_name,
        u.role as posted_by_role
      FROM announcements a
      JOIN users u ON a.posted_by_id = u.id
      WHERE a.property_id = $1
    `;

    const params = [propertyId];
    let paramIndex = 2;

    // Filter by type if specified (and not 'All')
    if (type && type !== 'All') {
      query += ` AND a.type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    // Search in title and content
    if (search) {
      query += ` AND (a.title ILIKE $${paramIndex} OR a.content ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Order by pinned first, then by date
    query += `
      ORDER BY a.is_pinned DESC, a.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  },

  /**
   * Get announcements by building_name (new method)
   * Matches announcements based on building name instead of property_id
   */
  async getAnnouncementsByBuildingName(buildingName, options = {}) {
    const { type, search, limit = 50, offset = 0 } = options;

    let query = `
      SELECT
        a.*,
        u.first_name || ' ' || u.last_name as posted_by_name,
        u.role as posted_by_role
      FROM announcements a
      JOIN users u ON a.posted_by_id = u.id
      WHERE a.building_name = $1
    `;

    const params = [buildingName];
    let paramIndex = 2;

    // Filter by type if specified (and not 'All')
    if (type && type !== 'All') {
      query += ` AND a.type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    // Search in title and content
    if (search) {
      query += ` AND (a.title ILIKE $${paramIndex} OR a.content ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Order by pinned first, then by date
    query += `
      ORDER BY a.is_pinned DESC, a.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  },

  /**
   * Create a new announcement
   */
  async createAnnouncement(announcementData) {
    const {
      property_id,
      posted_by_id,
      title,
      content,
      type,
      priority,
      is_pinned
    } = announcementData;

    // Get building_name from property_id
    const propertyQuery = await pool.query(
      'SELECT building_name FROM properties WHERE id = $1',
      [property_id]
    );

    const building_name = propertyQuery.rows[0]?.building_name;

    const query = `
      INSERT INTO announcements (
        property_id, posted_by_id, title, content, type, priority, is_pinned, building_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await pool.query(query, [
      property_id,
      posted_by_id,
      title,
      content,
      type,
      priority,
      is_pinned,
      building_name
    ]);

    return result.rows[0];
  },

  /**
   * Update an announcement
   */
  async updateAnnouncement(announcementId, userId, updateData) {
    const { title, content, type, priority, is_pinned } = updateData;

    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      params.push(title);
      paramIndex++;
    }
    if (content !== undefined) {
      updates.push(`content = $${paramIndex}`);
      params.push(content);
      paramIndex++;
    }
    if (type !== undefined) {
      updates.push(`type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex}`);
      params.push(priority);
      paramIndex++;
    }
    if (is_pinned !== undefined) {
      updates.push(`is_pinned = $${paramIndex}`);
      params.push(is_pinned);
      paramIndex++;
    }

    if (updates.length === 0) {
      return null;
    }

    updates.push(`updated_at = NOW()`);

    const query = `
      UPDATE announcements
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND posted_by_id = $${paramIndex + 1}
      RETURNING *
    `;

    params.push(announcementId, userId);

    const result = await pool.query(query, params);
    return result.rows[0] || null;
  },

  /**
   * Delete an announcement
   */
  async deleteAnnouncement(announcementId, userId) {
    const query = `
      DELETE FROM announcements
      WHERE id = $1 AND posted_by_id = $2
      RETURNING id
    `;

    const result = await pool.query(query, [announcementId, userId]);
    return result.rows.length > 0;
  },

  // ============================================
  // GROUP CHAT MANAGEMENT
  // ============================================

  /**
   * Create a new group chat
   */
  async createGroupChat({ name, description, property_id, created_by_id }) {
    const query = `
      INSERT INTO group_chats (name, description, property_id, created_by_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await pool.query(query, [name, description, property_id, created_by_id]);
    return result.rows[0];
  },

  // ============================================
  // DIRECT MESSAGE OPERATIONS
  // ============================================

  /**
   * Get all DM conversations for a user (with last message preview)
   */
  async getDirectMessageConversations(userId, propertyId) {
    const query = `
      SELECT DISTINCT ON (other_user_id)
        other_user_id AS user_id,
        u.first_name,
        u.last_name,
        rp.unit_number,
        dm.message_text AS last_message,
        dm.created_at AS last_message_time,
        (
          SELECT COUNT(*)
          FROM direct_messages
          WHERE recipient_id = $1
            AND sender_id = other_user_id
            AND is_read = FALSE
        ) AS unread_count
      FROM (
        SELECT
          CASE
            WHEN sender_id = $1 THEN recipient_id
            ELSE sender_id
          END AS other_user_id,
          id,
          message_text,
          created_at
        FROM direct_messages
        WHERE sender_id = $1 OR recipient_id = $1
      ) AS conversations
      JOIN users u ON u.id = other_user_id
      JOIN resident_profiles rp ON rp.user_id = other_user_id
      LEFT JOIN direct_messages dm ON dm.id = conversations.id
      WHERE rp.property_id = $2
      ORDER BY other_user_id, dm.created_at DESC
    `;

    const result = await pool.query(query, [userId, propertyId]);
    return result.rows;
  },

  /**
   * Get direct messages between two users
   */
  async getDirectMessages(userId, recipientId, { limit = 50, offset = 0 }) {
    const query = `
      SELECT
        dm.*,
        u.first_name || ' ' || u.last_name AS sender_name
      FROM direct_messages dm
      JOIN users u ON u.id = dm.sender_id
      WHERE (dm.sender_id = $1 AND dm.recipient_id = $2)
         OR (dm.sender_id = $2 AND dm.recipient_id = $1)
      ORDER BY dm.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const result = await pool.query(query, [userId, recipientId, limit, offset]);
    return result.rows.reverse(); // Return in chronological order
  },

  /**
   * Send a direct message
   */
  async sendDirectMessage({ sender_id, recipient_id, message_text }) {
    const query = `
      INSERT INTO direct_messages (sender_id, recipient_id, message_text)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await pool.query(query, [sender_id, recipient_id, message_text]);
    return result.rows[0];
  },

  /**
   * Mark all messages from a user as read
   */
  async markDMAsRead(userId, senderId) {
    const query = `
      UPDATE direct_messages
      SET is_read = TRUE, read_at = NOW()
      WHERE recipient_id = $1 AND sender_id = $2 AND is_read = FALSE
    `;

    await pool.query(query, [userId, senderId]);
  }
};

export default residentModel;