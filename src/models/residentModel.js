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
             p.building_name, p.address,
             COALESCE(rp.property_name, p.building_name) as resolved_building_name
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
   * Matches residents who have the same property_name OR are linked to a property with the same building_name
   * Also includes the property owner marked with is_owner flag
   */
  async getBuildingResidentsByName(propertyName, options = {}) {
    // Query to get residents and property owner in one result
    // Using UNION to combine residents and owner
    // The property_owner CTE finds the owner by matching building_name, address,
    // or through residents linked to a property with property_id
    const baseQuery = `
      WITH property_owner AS (
        SELECT DISTINCT
          p.manager_id as user_id,
          p.id as property_id
        FROM properties p
        WHERE p.building_name = $1
           OR p.address = $1
           OR p.id IN (
             SELECT rp.property_id FROM resident_profiles rp
             WHERE rp.property_name = $1 AND rp.property_id IS NOT NULL
           )
        LIMIT 1
      )
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
        rp.show_online_status,
        false as is_owner
      FROM resident_profiles rp
      JOIN users u ON rp.user_id = u.id
      LEFT JOIN properties p ON rp.property_id = p.id
      WHERE (rp.property_name = $1 OR p.building_name = $1)

      UNION

      SELECT
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        'Owner' as unit_number,
        NULL as floor,
        NULL as building_section,
        NULL as move_in_date,
        'Property Owner' as bio,
        NULL as profile_picture,
        false as is_online,
        NULL as last_seen,
        true as allow_messages,
        true as contact_via_email,
        true as contact_via_phone,
        true as contact_via_message,
        true as show_email,
        true as show_phone,
        true as show_unit,
        false as show_move_in_date,
        false as show_online_status,
        true as is_owner
      FROM users u
      JOIN property_owner po ON u.id = po.user_id
      WHERE NOT EXISTS (
        SELECT 1 FROM resident_profiles rp2
        LEFT JOIN properties p2 ON rp2.property_id = p2.id
        WHERE rp2.user_id = u.id
        AND (rp2.property_name = $1 OR p2.building_name = $1)
      )
    `;

    const params = [propertyName];
    let paramCount = 1;

    // Build WHERE clause for filters
    const filters = [];

    // Add search filter
    if (options.search) {
      paramCount++;
      filters.push(`(
        first_name ILIKE $${paramCount} OR
        last_name ILIKE $${paramCount} OR
        unit_number ILIKE $${paramCount}
      )`);
      params.push(`%${options.search}%`);
    }

    // Add online status filter
    if (options.status === 'online') {
      filters.push(`is_online = true`);
    } else if (options.status === 'offline') {
      filters.push(`is_online = false`);
    }

    // Add floor filter
    if (options.floor) {
      paramCount++;
      filters.push(`floor = $${paramCount}`);
      params.push(options.floor);
    }

    // Build final query with filters
    let query = `SELECT * FROM (${baseQuery}) AS combined_results`;

    if (filters.length > 0) {
      query += ` WHERE ${filters.join(' AND ')}`;
    }

    // Add sorting - owner first, then by specified sort or name
    if (options.sortBy === 'unit') {
      query += ` ORDER BY is_owner DESC, unit_number`;
    } else if (options.sortBy === 'recently_active') {
      query += ` ORDER BY is_owner DESC, last_seen DESC NULLS LAST`;
    } else {
      query += ` ORDER BY is_owner DESC, first_name, last_name`;
    }

    console.log(`🔍 getBuildingResidentsByName query for: "${propertyName}", propertyId: ${options.propertyId}`);

    // Debug: Check if property exists - use propertyId if available, otherwise match by name
    let debugQuery;
    if (options.propertyId) {
      debugQuery = await pool.query(
        `SELECT id, building_name, address, manager_id FROM properties WHERE id = $1`,
        [options.propertyId]
      );
    } else {
      debugQuery = await pool.query(
        `SELECT id, building_name, address, manager_id FROM properties WHERE building_name = $1 OR address = $1`,
        [propertyName]
      );
    }
    console.log(`🔍 Debug - Properties found:`, debugQuery.rows);

    const result = await pool.query(query, params);
    console.log(`🔍 Query returned ${result.rows.length} rows, owner count: ${result.rows.filter(r => r.is_owner).length}`);

    // ALWAYS check and add property owner if not already in results
    const ownerCount = result.rows.filter(r => r.is_owner).length;
    console.log(`🔍 Owner count in results: ${ownerCount}`);

    if (ownerCount === 0) {
      // Try to find the property and its manager
      let propertyWithManager = null;

      if (debugQuery.rows.length > 0 && debugQuery.rows[0].manager_id) {
        propertyWithManager = debugQuery.rows[0];
      }

      // If still no property found, try additional lookups
      if (!propertyWithManager && options.propertyId) {
        const directLookup = await pool.query(
          `SELECT id, building_name, address, manager_id FROM properties WHERE id = $1`,
          [options.propertyId]
        );
        if (directLookup.rows.length > 0 && directLookup.rows[0].manager_id) {
          propertyWithManager = directLookup.rows[0];
        }
      }

      if (propertyWithManager && propertyWithManager.manager_id) {
        const managerId = propertyWithManager.manager_id;
        console.log(`🔍 Adding owner manually: manager_id=${managerId} from property ${propertyWithManager.id}`);

        // properties.manager_id references manager_profiles.id, so we need to join through manager_profiles
        let ownerQuery = await pool.query(
          `SELECT u.id as user_id, u.first_name, u.last_name, u.email, u.phone
           FROM users u
           INNER JOIN manager_profiles mp ON mp.user_id = u.id
           WHERE mp.id = $1`,
          [managerId]
        );
        console.log(`🔍 Owner query (via manager_profiles) returned ${ownerQuery.rows.length} rows:`, ownerQuery.rows);

        // If manager not found by manager_profiles.id, the manager_id in properties table is stale/invalid
        if (ownerQuery.rows.length === 0) {
          console.log(`⚠️ Manager profile with ID ${managerId} not found!`);
          console.log(`⚠️ The manager_id in properties table may be stale. Trying to find a valid property_manager...`);

          // Try to find a property manager for this specific building
          let fallbackQuery = await pool.query(
            `SELECT u.id as user_id, u.first_name, u.last_name, u.email, u.phone
             FROM users u
             INNER JOIN manager_profiles mp ON mp.user_id = u.id
             INNER JOIN properties p ON p.manager_id = mp.id
             WHERE u.role = 'property_manager'
               AND (p.building_name = $1 OR p.id = $2)
             LIMIT 1`,
            [propertyName, options.propertyId || propertyWithManager.id]
          );

          // If no manager found for this building, try finding any manager with manager_profile
          if (fallbackQuery.rows.length === 0) {
            console.log(`🔍 No property_manager found for this building, trying any manager with profile...`);
            fallbackQuery = await pool.query(
              `SELECT u.id as user_id, u.first_name, u.last_name, u.email, u.phone
               FROM users u
               INNER JOIN manager_profiles mp ON mp.user_id = u.id
               WHERE u.role = 'property_manager'
               LIMIT 1`
            );
          }

          // If still no property manager with manager_profile, try without the join
          if (fallbackQuery.rows.length === 0) {
            console.log(`🔍 No property_manager with manager_profile found, trying without join...`);
            fallbackQuery = await pool.query(
              `SELECT id as user_id, first_name, last_name, email, phone
               FROM users WHERE role = 'property_manager' LIMIT 1`
            );
          }
          console.log(`🔍 Property manager fallback query returned ${fallbackQuery.rows.length} rows:`, fallbackQuery.rows);

          if (fallbackQuery.rows.length > 0) {
            ownerQuery = fallbackQuery;
          }
        }

        if (ownerQuery.rows.length > 0) {
          const owner = ownerQuery.rows[0];
          console.log(`🔍 Owner data:`, owner);

          // Check if this user is already in results (maybe without is_owner flag)
          const alreadyExists = result.rows.some(r => r.user_id === owner.user_id);

          if (!alreadyExists) {
            const ownerEntry = {
              user_id: owner.user_id,
              first_name: owner.first_name,
              last_name: owner.last_name,
              email: owner.email,
              phone: owner.phone,
              unit_number: 'Owner',
              floor: null,
              building_section: null,
              move_in_date: null,
              bio: 'Property Manager',
              profile_picture: null,
              is_online: false,
              last_seen: null,
              allow_messages: true,
              contact_via_email: true,
              contact_via_phone: true,
              contact_via_message: true,
              show_email: true,
              show_phone: true,
              show_unit: true,
              show_move_in_date: false,
              show_online_status: false,
              is_owner: true
            };
            console.log(`🔍 About to add owner entry:`, ownerEntry);
            result.rows.unshift(ownerEntry);
            console.log(`✅ Added owner ${owner.first_name} ${owner.last_name} to results. New length: ${result.rows.length}, first row is_owner: ${result.rows[0].is_owner}`);
          } else {
            console.log(`⚠️ Owner ${owner.first_name} ${owner.last_name} already in results but without is_owner flag`);
            // Mark the existing entry as owner
            const existingIndex = result.rows.findIndex(r => r.user_id === owner.user_id);
            if (existingIndex !== -1) {
              result.rows[existingIndex].is_owner = true;
              result.rows[existingIndex].bio = 'Property Manager';
              // Move to front
              const [ownerEntry] = result.rows.splice(existingIndex, 1);
              result.rows.unshift(ownerEntry);
              console.log(`✅ Marked existing entry as owner and moved to front`);
            }
          }
        }
      } else {
        console.log(`⚠️ No property with manager found for building: ${propertyName}`);
      }
    }

    if (result.rows.length > 0) {
      console.log(`🔍 Sample row:`, JSON.stringify(result.rows[0], null, 2));
    }
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
        rp.property_id,
        rp.property_name,
        COALESCE(rp.property_name, p.building_name) as building_name,
        p.address,
        p.manager_id as property_manager_id
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
   * Automatically adds the property owner as an admin member
   */
  async getOrCreateBuildingChat(propertyId, createdById) {
    // Helper function to find valid property manager
    const findValidPropertyManager = async (managerId, propId) => {
      console.log(`🔍 findValidPropertyManager called with managerId: ${managerId}, propertyId: ${propId}`);

      // First try the manager_id from properties table
      // Note: properties.manager_id references manager_profiles.id, so we need to join
      if (managerId) {
        const directQuery = await pool.query(
          `SELECT u.id as user_id
           FROM users u
           INNER JOIN manager_profiles mp ON mp.user_id = u.id
           WHERE mp.id = $1`,
          [managerId]
        );
        if (directQuery.rows.length > 0) {
          console.log(`✅ Found manager ${directQuery.rows[0].user_id} via manager_profiles.id ${managerId}`);
          return directQuery.rows[0].user_id;
        }
        console.log(`⚠️ Manager profile ${managerId} not found for group chat`);
      }

      // Second: Try to find manager via manager_profiles for THIS specific property
      if (propId) {
        const specificQuery = await pool.query(
          `SELECT u.id as user_id
           FROM users u
           INNER JOIN manager_profiles mp ON mp.user_id = u.id
           INNER JOIN properties p ON p.manager_id = mp.id
           WHERE u.role = 'property_manager' AND p.id = $1
           LIMIT 1`,
          [propId]
        );
        if (specificQuery.rows.length > 0) {
          console.log(`✅ Found manager for this property: ${specificQuery.rows[0].user_id}`);
          return specificQuery.rows[0].user_id;
        }
      }

      // Fallback: find any property manager (try with manager_profiles first, then without)
      let fallbackQuery = await pool.query(
        `SELECT u.id as user_id
         FROM users u
         INNER JOIN manager_profiles mp ON mp.user_id = u.id
         WHERE u.role = 'property_manager'
         LIMIT 1`
      );

      if (fallbackQuery.rows.length === 0) {
        console.log(`🔍 No property_manager with manager_profile found, trying without join...`);
        fallbackQuery = await pool.query(
          `SELECT id as user_id FROM users WHERE role = 'property_manager' LIMIT 1`
        );
      }

      if (fallbackQuery.rows.length > 0) {
        console.log(`🔍 Found fallback property manager: ${fallbackQuery.rows[0].user_id}`);
        return fallbackQuery.rows[0].user_id;
      }

      console.log(`⚠️ No property manager found at all!`);
      return null;
    };

    // Check if building chat exists
    const checkQuery = `
      SELECT * FROM group_chats
      WHERE property_id = $1 AND chat_type = 'building'
      LIMIT 1
    `;

    const checkResult = await pool.query(checkQuery, [propertyId]);

    if (checkResult.rows.length > 0) {
      const existingChat = checkResult.rows[0];

      // Ensure property owner is added to existing chat
      const ownerQuery = `SELECT manager_id FROM properties WHERE id = $1`;
      const ownerResult = await pool.query(ownerQuery, [propertyId]);

      const validManagerId = await findValidPropertyManager(ownerResult.rows[0]?.manager_id, propertyId);
      if (validManagerId) {
        await this.addChatMember(existingChat.id, validManagerId, true);
        console.log(`✅ Ensured property manager ${validManagerId} is in building chat ${existingChat.id}`);
      }

      return existingChat;
    }

    // Get property name and owner
    const propertyQuery = `SELECT building_name, address, manager_id FROM properties WHERE id = $1`;
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

    const newChat = result.rows[0];

    // Automatically add property owner as admin member
    const validManagerId = await findValidPropertyManager(property?.manager_id, propertyId);
    if (validManagerId) {
      await this.addChatMember(newChat.id, validManagerId, true);
      console.log(`✅ Auto-added property manager ${validManagerId} to new building chat ${newChat.id}`);
    }

    return newChat;
  },

  /**
   * Add member to group chat
   */
  async addChatMember(groupChatId, userId, isAdmin = false) {
    console.log(`🔍 addChatMember called: groupChatId=${groupChatId}, userId=${userId}, isAdmin=${isAdmin}`);

    const query = `
      INSERT INTO group_chat_members (group_chat_id, user_id, is_admin)
      VALUES ($1, $2, $3)
      ON CONFLICT (group_chat_id, user_id) DO UPDATE SET is_admin = EXCLUDED.is_admin
      RETURNING *
    `;

    const result = await pool.query(query, [groupChatId, userId, isAdmin]);
    console.log(`🔍 addChatMember result:`, result.rows[0] || 'No rows returned (conflict?)');

    // Verify the member was added
    const verifyQuery = await pool.query(
      `SELECT * FROM group_chat_members WHERE group_chat_id = $1 AND user_id = $2`,
      [groupChatId, userId]
    );
    console.log(`✅ Member verification:`, verifyQuery.rows[0] || 'NOT FOUND');

    return result.rows[0] || verifyQuery.rows[0];
  },

  /**
   * Get group chat members
   */
  async getChatMembers(groupChatId) {
    console.log(`🔍 getChatMembers called for groupChatId: ${groupChatId}`);

    const query = `
      SELECT
        gcm.*,
        u.first_name,
        u.last_name,
        u.role,
        rp.profile_picture,
        rp.is_online,
        rp.show_online_status
      FROM group_chat_members gcm
      JOIN users u ON gcm.user_id = u.id
      LEFT JOIN resident_profiles rp ON rp.user_id = u.id
      WHERE gcm.group_chat_id = $1
      ORDER BY gcm.is_admin DESC, u.first_name, u.last_name
    `;

    const result = await pool.query(query, [groupChatId]);
    console.log(`🔍 getChatMembers returned ${result.rows.length} members:`, result.rows.map(m => `${m.first_name} ${m.last_name} (${m.role}, admin=${m.is_admin})`));
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
    console.log(`🔍 getUserGroupChats for userId ${userId}: found ${result.rows.length} chats`);
    if (result.rows.length > 0) {
      result.rows.forEach(chat => {
        console.log(`  - Chat "${chat.name}" (${chat.id}): ${chat.member_count} members, is_admin=${chat.is_admin}`);
      });
    }
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