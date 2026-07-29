// src/controllers/propertyController.js
import pool from "../config/db.js";
import * as Property from "../models/propertyModel.js";
import { uploadToSupabase, deleteFromSupabase, getPublicUrl, extractFilePathFromUrl, generateUniqueFileName } from '../utils/supabaseHelpers.js';
import { BUCKETS } from '../config/supabase.js';
import { validateUUID } from '../utils/validation.js';

// 🟢 Create a new property (Manager only)
export const createProperty = async (req, res) => {
  try {
    const {
      address,
      city,
      province,
      postal_code,
      num_units,
      building_type,
      building_name,
      latitude,
      longitude,
      condo_control_email,
    } = req.body;

    // Validate required fields
    if (!address || !city) {
      return res.status(400).json({
        message: "Address and city are required"
      });
    }

    const parsedNumUnits = parseInt(num_units) || 0;
    if (parsedNumUnits < 0) {
      return res.status(400).json({
        message: "Number of units cannot be negative"
      });
    }

    // Get manager profile ID from user ID
    const managerProfile = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [req.user.id]
    );

    if (!managerProfile.rows[0]) {
      return res.status(403).json({
        message: "Property manager profile not found"
      });
    }

    const manager_id = managerProfile.rows[0].id;

    // Create property
    const newProperty = await Property.createProperty({
        manager_id,
        address,
        city,
        province: province || null,
        postal_code: postal_code || null,
        num_units: parsedNumUnits,
        building_type: building_type || "Apartment",
        building_name: building_name,
        latitude: latitude || null,
        longitude: longitude || null,
        // Optional Condo Control ingestion address for the announcement bridge.
        condo_control_email: condo_control_email?.trim() || null,
    });

    // ============================================
    // AUTO-CREATE GROUP CHAT FOR THE PROPERTY
    // ============================================
    try {
      const chatName = building_name || `${address} Community`;

      // Check if group chat already exists for this property
      const existingChat = await pool.query(
        `SELECT id FROM group_chats WHERE property_id = $1`,
        [newProperty.id]
      );

      if (existingChat.rows.length === 0) {
        // Create the group chat
        const newChat = await pool.query(
          `INSERT INTO group_chats (name, description, property_id, building_name, chat_type, created_by, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE)
           RETURNING *`,
          [
            chatName,
            'Community chat for all building residents',
            newProperty.id,
            building_name || null,
            'building',
            req.user.id
          ]
        );

        // Add property manager as admin member
        await pool.query(
          `INSERT INTO group_chat_members (group_chat_id, user_id, is_admin)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (group_chat_id, user_id) DO NOTHING`,
          [newChat.rows[0].id, req.user.id]
        );

        console.log(`✅ Auto-created group chat "${chatName}" for property ${newProperty.id}`);
      }
    } catch (chatErr) {
      // Don't fail the property creation if group chat creation fails
      console.error("⚠️ Warning: Failed to auto-create group chat:", chatErr);
    }

    res.status(201).json({
      message: "Property created successfully",
      property: newProperty
    });

  } catch (err) {
    console.error("❌ Error creating property:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🟡 Get all properties for logged-in manager
export const getMyProperties = async (req, res) => {
  try {
    // Get manager profile ID
    const managerProfile = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [req.user.id]
    );

    if (!managerProfile.rows[0]) {
      return res.status(403).json({ 
        message: "Property manager profile not found" 
      });
    }

    const properties = await Property.getPropertiesByManagerId(
      managerProfile.rows[0].id
    );

    res.json({ 
      properties,
      total: properties.length
    });

  } catch (err) {
    console.error("❌ Error getting properties:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔵 Get single property by ID
export const getPropertyById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID parameter
    if (!id || id === 'null' || id === 'undefined') {
      return res.status(400).json({
        message: "Invalid property ID"
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        message: "Invalid property ID format"
      });
    }

    // Get property
    const property = await Property.getPropertyById(id);

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    // Get manager profile to verify ownership
    const managerProfile = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [req.user.id]
    );

    if (!managerProfile.rows[0]) {
      return res.status(403).json({ 
        message: "Property manager profile not found" 
      });
    }

    // Check if manager owns this property
    if (property.manager_id !== managerProfile.rows[0].id) {
      return res.status(403).json({ 
        message: "You can only view your own properties" 
      });
    }

    // Get property with stats
    const propertyWithStats = await Property.getPropertyWithStats(id);

    res.json({ property: propertyWithStats });

  } catch (err) {
    console.error("❌ Error getting property:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🟣 Update property
export const updateProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    // Validate ID parameter
    if (!id || id === 'null' || id === 'undefined') {
      return res.status(400).json({
        message: "Invalid property ID"
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        message: "Invalid property ID format"
      });
    }

    // Get property
    const property = await Property.getPropertyById(id);

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    // Get manager profile to verify ownership
    const managerProfile = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [req.user.id]
    );

    if (!managerProfile.rows[0]) {
      return res.status(403).json({ 
        message: "Property manager profile not found" 
      });
    }

    // Check if manager owns this property
    if (property.manager_id !== managerProfile.rows[0].id) {
      return res.status(403).json({ 
        message: "You can only update your own properties" 
      });
    }

    // Remove fields that shouldn't be updated
    delete updateFields.id;
    delete updateFields.manager_id;
    delete updateFields.created_at;

    if (updateFields.num_units !== undefined) {
      const parsedNumUnits = parseInt(updateFields.num_units) || 0;
      if (parsedNumUnits < 0) {
        return res.status(400).json({
          message: "Number of units cannot be negative"
        });
      }
      updateFields.num_units = parsedNumUnits;
    }

    // Update property
    const updatedProperty = await Property.updateProperty(id, updateFields);

    res.json({ 
      message: "Property updated successfully", 
      property: updatedProperty 
    });

  } catch (err) {
    console.error("❌ Error updating property:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔴 Delete property
export const deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID parameter
    if (!id || id === 'null' || id === 'undefined') {
      return res.status(400).json({
        message: "Invalid property ID"
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        message: "Invalid property ID format"
      });
    }

    // Get property
    const property = await Property.getPropertyById(id);

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    // Get manager profile to verify ownership
    const managerProfile = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [req.user.id]
    );

    if (!managerProfile.rows[0]) {
      return res.status(403).json({ 
        message: "Property manager profile not found" 
      });
    }

    // Check if manager owns this property
    if (property.manager_id !== managerProfile.rows[0].id) {
      return res.status(403).json({ 
        message: "You can only delete your own properties" 
      });
    }

    // Check if property has jobs
    const jobs = await pool.query(
      `SELECT COUNT(*) as count FROM jobs WHERE property_id = $1`,
      [id]
    );

    if (parseInt(jobs.rows[0].count) > 0) {
      return res.status(400).json({ 
        message: `Cannot delete property with existing jobs. This property has ${jobs.rows[0].count} job(s).` 
      });
    }

    // Delete property
    await Property.deleteProperty(id);

    res.json({ message: "Property deleted successfully" });

  } catch (err) {
    console.error("❌ Error deleting property:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🟢 Get all properties (accessible by any authenticated user)
export const getAllProperties = async (req, res) => {
  try {
    const properties = await Property.getAllProperties();
    res.json({
      total: properties.length,
      properties
    });
  } catch (err) {
    console.error("❌ Error fetching all properties:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ========================================
// 🏢 PROPERTY IMAGE UPLOAD FUNCTIONS
// ========================================

/**
 * Upload Property Image
 * POST /api/properties/:id/image
 *
 * Uploads property image to Supabase and updates properties table
 */
export const uploadPropertyImage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Validate ID parameter
    if (!id || id === 'null' || id === 'undefined') {
      return res.status(400).json({
        message: "Invalid property ID"
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        message: "Invalid property ID format"
      });
    }

    // Validate file exists
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide an image file',
      });
    }

    // Get property
    const property = await Property.getPropertyById(id);

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    // Get manager profile to verify ownership
    const managerProfile = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [userId]
    );

    if (!managerProfile.rows[0]) {
      return res.status(403).json({
        message: "Property manager profile not found"
      });
    }

    // Check if manager owns this property
    if (property.manager_id !== managerProfile.rows[0].id) {
      return res.status(403).json({
        message: "You can only update your own properties"
      });
    }

    const oldImageUrl = property.image;

    // Generate unique filename
    const uniqueFileName = generateUniqueFileName(req.file.originalname);
    const filePath = `properties/${id}/${uniqueFileName}`;

    // Upload to Supabase
    const uploadResult = await uploadToSupabase({
      fileBuffer: req.file.buffer,
      bucket: BUCKETS.PROPERTY_IMAGES,
      filePath: filePath,
      contentType: req.file.mimetype,
      upsert: false,
    });

    if (!uploadResult.success) {
      return res.status(500).json({
        error: 'Upload failed',
        message: uploadResult.error,
      });
    }

    // Get public URL
    const imageUrl = getPublicUrl(BUCKETS.PROPERTY_IMAGES, uploadResult.data.path);

    // Update database
    await pool.query(
      'UPDATE properties SET image = $1, updated_at = NOW() WHERE id = $2',
      [imageUrl, id]
    );

    // Delete old image if exists
    if (oldImageUrl) {
      const oldFilePath = extractFilePathFromUrl(oldImageUrl, BUCKETS.PROPERTY_IMAGES);
      if (oldFilePath) {
        await deleteFromSupabase(BUCKETS.PROPERTY_IMAGES, oldFilePath);
      }
    }

    console.log(`[Upload] ✓ Property image uploaded: ${id}`);

    res.status(200).json({
      message: 'Property image uploaded successfully',
      imageUrl: imageUrl,
    });

  } catch (error) {
    console.error('[Upload] Property image error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Delete Property Image
 * DELETE /api/properties/:id/image
 *
 * Removes property image from Supabase and database
 */
export const deletePropertyImage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Validate ID parameter
    if (!id || id === 'null' || id === 'undefined') {
      return res.status(400).json({
        message: "Invalid property ID"
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        message: "Invalid property ID format"
      });
    }

    // Get property
    const property = await Property.getPropertyById(id);

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    // Get manager profile to verify ownership
    const managerProfile = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [userId]
    );

    if (!managerProfile.rows[0]) {
      return res.status(403).json({
        message: "Property manager profile not found"
      });
    }

    // Check if manager owns this property
    if (property.manager_id !== managerProfile.rows[0].id) {
      return res.status(403).json({
        message: "You can only update your own properties"
      });
    }

    const imageUrl = property.image;

    if (!imageUrl) {
      return res.status(400).json({
        message: 'No property image to delete'
      });
    }

    // Extract file path from URL
    const filePath = extractFilePathFromUrl(imageUrl, BUCKETS.PROPERTY_IMAGES);

    if (filePath) {
      // Delete from Supabase
      await deleteFromSupabase(BUCKETS.PROPERTY_IMAGES, filePath);
    }

    // Update database
    await pool.query(
      'UPDATE properties SET image = NULL, updated_at = NOW() WHERE id = $1',
      [id]
    );

    console.log(`[Upload] ✓ Property image deleted: ${id}`);

    res.status(200).json({
      message: 'Property image deleted successfully',
    });

  } catch (error) {
    console.error('[Upload] Delete property image error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// 🟢 Get maintenance log for a property
export const getPropertyMaintenanceLog = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateUUID(id)) return res.status(400).json({ message: 'Invalid property ID' });

    // Verify ownership
    const managerResult = await pool.query(
      'SELECT id FROM manager_profiles WHERE user_id = $1', [req.user.id]
    );
    if (!managerResult.rows[0]) return res.status(403).json({ message: 'Not a manager' });

    const propCheck = await pool.query(
      'SELECT id, building_name, address, city FROM properties WHERE id = $1 AND manager_id = $2',
      [id, managerResult.rows[0].id]
    );
    if (!propCheck.rows[0]) return res.status(404).json({ message: 'Property not found' });

    // Get all jobs for this property with contract + entrepreneur + review info
    const jobsResult = await pool.query(`
      SELECT
        j.id, j.title, j.description, j.category, j.urgency, j.status,
        j.due_date, j.estimated_duration_days, j.budget_min, j.budget_max,
        j.created_at, j.is_archived,
        c.id AS contract_id, c.contract_amount, c.status AS contract_status,
        c.work_started_at, c.work_completed_at, c.created_at AS contract_created_at,
        c.mutual_confirmation_completed_at,
        ep.company_name, ep.license_number, ep.specializations,
        u.first_name AS contractor_first_name, u.last_name AS contractor_last_name, u.email AS contractor_email,
        (SELECT COUNT(*) FROM images WHERE job_id = j.id) AS image_count,
        (SELECT json_agg(json_build_object('id', r.id, 'rating', r.rating, 'comment', r.comment, 'created_at', r.created_at, 'reviewer_id', r.reviewer_id))
         FROM reviews r WHERE r.job_id = j.id) AS reviews
      FROM jobs j
      LEFT JOIN contracts c ON c.job_id = j.id
      LEFT JOIN entrepreneur_profiles ep ON c.entrepreneur_id = ep.id
      LEFT JOIN users u ON ep.user_id = u.id
      WHERE j.property_id = $1
      ORDER BY j.created_at DESC
    `, [id]);

    const jobs = jobsResult.rows;
    const summary = {
      total: jobs.length,
      open: jobs.filter(j => j.status === 'open').length,
      ongoing: jobs.filter(j => j.status === 'ongoing' || j.status === 'accepted').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      archived: jobs.filter(j => j.is_archived).length,
    };

    // Get unique contractors
    const contractors = {};
    jobs.forEach(j => {
      if (j.company_name && j.contract_id) {
        const key = j.company_name;
        if (!contractors[key]) {
          contractors[key] = {
            company_name: j.company_name,
            license_number: j.license_number,
            contact_name: `${j.contractor_first_name || ''} ${j.contractor_last_name || ''}`.trim(),
            email: j.contractor_email,
            specializations: j.specializations,
            jobs_count: 0,
            total_spent: 0,
          };
        }
        contractors[key].jobs_count++;
        if (j.contract_amount) contractors[key].total_spent += Number(j.contract_amount);
      }
    });

    res.json({
      success: true,
      property: propCheck.rows[0],
      summary,
      jobs,
      contractors: Object.values(contractors),
    });
  } catch (error) {
    console.error('Error getting maintenance log:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
