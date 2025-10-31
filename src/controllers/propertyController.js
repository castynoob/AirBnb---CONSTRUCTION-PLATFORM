// src/controllers/propertyController.js
import pool from "../config/db.js";
import * as Property from "../models/propertyModel.js";
import { uploadToSupabase, deleteFromSupabase, getPublicUrl, extractFilePathFromUrl, generateUniqueFileName } from '../utils/supabaseHelpers.js';
import { BUCKETS } from '../config/supabase.js';

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
      longitude
    } = req.body;

    // Validate required fields
    if (!address || !city) {
      return res.status(400).json({ 
        message: "Address and city are required" 
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
        num_units: num_units || 0,
        building_type: building_type || "Apartment",
        building_name: building_name,
        latitude: latitude || null,
        longitude: longitude || null
    });

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
