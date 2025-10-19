// src/controllers/propertyController.js
import pool from "../config/db.js";
import * as Property from "../models/propertyModel.js";

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