// ✅ src/controllers/userController.js
import pool from "../config/db.js";
import { uploadToSupabase, deleteFromSupabase, getPublicUrl, extractFilePathFromUrl, generateUniqueFileName } from '../utils/supabaseHelpers.js';
import { BUCKETS } from '../config/supabase.js';

// Existing controllers (keep them)
export const getProfile = async (req, res) => {
  try {
    const user = await pool.query(
      "SELECT id, email, first_name, last_name, role FROM users WHERE id = $1",
      [req.user.id]
    );
    res.json(user.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get entrepreneur profile (for entrepreneur or property manager)
export const getEntrepreneurProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const userResult = await pool.query(
      "SELECT id, role FROM users WHERE id = $1",
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const userRole = userResult.rows[0].role;

    // Allow both entrepreneurs and property managers
    if (userRole !== "entrepreneur" && userRole !== "property_manager") {
      return res.status(403).json({
        message: "Access denied: Only entrepreneurs or property managers can access this resource",
      });
    }

    const entrepreneur = await pool.query(
      `SELECT ep.*, u.email, u.first_name, u.last_name, u.phone
       FROM entrepreneur_profiles ep
       JOIN users u ON ep.user_id = u.id
       WHERE ep.user_id = $1`,
      [userId]
    );

    if (entrepreneur.rows.length === 0) {
      return res.status(404).json({ message: "Entrepreneur profile not found" });
    }

    res.status(200).json({
      message: "Entrepreneur profile fetched successfully",
      profile: entrepreneur.rows[0],
    });
  } catch (error) {
    console.error("Error fetching entrepreneur profile:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 🆕 NEW ENDPOINT: Get entrepreneur profile by ID
export const getEntrepreneurProfileById = async (req, res) => {
  try {
    const entrepreneurId = req.params.id;

    // Fetch entrepreneur profile by its ID
    const entrepreneur = await pool.query(
      `SELECT ep.*, 
              u.email, 
              u.first_name, 
              u.last_name, 
              u.role 
       FROM entrepreneur_profiles ep
       JOIN users u ON ep.user_id = u.id
       WHERE ep.id = $1`,
      [entrepreneurId]
    );

    if (entrepreneur.rows.length === 0) {
      return res.status(404).json({ message: "Entrepreneur profile not found" });
    }

    res.status(200).json({
      message: "Entrepreneur profile fetched successfully",
      profile: entrepreneur.rows[0],
    });
  } catch (error) {
    console.error("Error fetching entrepreneur profile by ID:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Get Manager Profile by User ID
export const getManagerProfileByUserId = async (req, res) => {
  try {
    const userId = req.params.userId;

    // Check if user exists
    const userCheck = await pool.query(
      "SELECT id, role FROM users WHERE id = $1",
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const userRole = userCheck.rows[0].role;
    if (userRole !== "property_manager") {
      return res.status(403).json({
        message: "Access denied: The provided user is not a manager",
      });
    }

    // Fetch the manager profile (assuming you have `manager_profiles` table)
    const manager = await pool.query(
      `SELECT mp.*, 
              u.email, 
              u.first_name, 
              u.last_name, 
              u.role 
       FROM manager_profiles mp
       JOIN users u ON mp.user_id = u.id
       WHERE mp.user_id = $1`,
      [userId]
    );

    if (manager.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Manager profile not found" });
    }

    res.status(200).json({
      message: "Manager profile fetched successfully",
      profile: manager.rows[0],
    });
  } catch (error) {
    console.error("Error fetching manager profile by user ID:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 🆕 Get Entrepreneur Profile by User ID
export const getEntrepreneurProfileByUserId = async (req, res) => {
  try {
    const userId = req.params.userId;

    // Check if user exists
    const userResult = await pool.query(
      "SELECT id, role FROM users WHERE id = $1",
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const userRole = userResult.rows[0].role;
    if (userRole !== "entrepreneur") {
      return res.status(403).json({
        message: "Access denied: The provided user is not an entrepreneur",
      });
    }

    // Fetch entrepreneur profile by the user_id
    const entrepreneur = await pool.query(
      `SELECT ep.*, 
              u.email, 
              u.first_name, 
              u.last_name, 
              u.role 
       FROM entrepreneur_profiles ep
       JOIN users u ON ep.user_id = u.id
       WHERE ep.user_id = $1`,
      [userId]
    );

    if (entrepreneur.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Entrepreneur profile not found for this user" });
    }

    res.status(200).json({
      message: "Entrepreneur profile fetched successfully by user ID",
      profile: entrepreneur.rows[0],
    });
  } catch (error) {
    console.error("Error fetching entrepreneur profile by user ID:", error);
    res.status(500).json({ message: "Server error" });
  }
};
// 🆕 Get manager profile by manager ID
export const getManagerProfileById = async (req, res) => {
  try {
    const managerId = req.params.managerId;
    console.log(managerId)

    const result = await pool.query(
      `SELECT *
       FROM manager_profiles
       WHERE id = $1`,
      [managerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Manager profile not found" });
    }

    res.status(200).json({
      message: "Manager profile fetched successfully",
      profile: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching manager by id:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ========================================
// 📸 PROFILE IMAGE UPLOAD FUNCTIONS
// ========================================

/**
 * Upload Manager Profile Picture
 * POST /api/users/manager/profile-picture
 *
 * Uploads profile image to Supabase and updates manager_profiles table
 */
export const uploadManagerProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate file exists
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide an image file',
      });
    }

    // Get manager profile
    const managerResult = await pool.query(
      'SELECT id, image FROM manager_profiles WHERE user_id = $1',
      [userId]
    );

    if (managerResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Manager profile not found'
      });
    }

    const managerProfile = managerResult.rows[0];
    const oldImageUrl = managerProfile.image;

    // Generate unique filename
    const uniqueFileName = generateUniqueFileName(req.file.originalname);
    const filePath = `managers/${userId}/${uniqueFileName}`;

    // Upload to Supabase
    const uploadResult = await uploadToSupabase({
      fileBuffer: req.file.buffer,
      bucket: BUCKETS.PROFILE_IMAGES,
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
    const imageUrl = getPublicUrl(BUCKETS.PROFILE_IMAGES, uploadResult.data.path);

    // Update database
    await pool.query(
      'UPDATE manager_profiles SET image = $1, updated_at = NOW() WHERE id = $2',
      [imageUrl, managerProfile.id]
    );

    // Delete old image if exists
    if (oldImageUrl) {
      const oldFilePath = extractFilePathFromUrl(oldImageUrl, BUCKETS.PROFILE_IMAGES);
      if (oldFilePath) {
        await deleteFromSupabase(BUCKETS.PROFILE_IMAGES, oldFilePath);
      }
    }

    console.log(`[Upload] ✓ Manager profile picture uploaded: ${userId}`);

    res.status(200).json({
      message: 'Profile picture uploaded successfully',
      imageUrl: imageUrl,
    });

  } catch (error) {
    console.error('[Upload] Manager profile picture error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Upload Entrepreneur Profile Picture
 * POST /api/users/entrepreneur/profile-picture
 *
 * Uploads profile image to Supabase and updates entrepreneur_profiles table
 */
export const uploadEntrepreneurProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate file exists
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide an image file',
      });
    }

    // Get entrepreneur profile
    const entrepreneurResult = await pool.query(
      'SELECT id, image FROM entrepreneur_profiles WHERE user_id = $1',
      [userId]
    );

    if (entrepreneurResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Entrepreneur profile not found'
      });
    }

    const entrepreneurProfile = entrepreneurResult.rows[0];
    const oldImageUrl = entrepreneurProfile.image;

    // Generate unique filename
    const uniqueFileName = generateUniqueFileName(req.file.originalname);
    const filePath = `entrepreneurs/${userId}/${uniqueFileName}`;

    // Upload to Supabase
    const uploadResult = await uploadToSupabase({
      fileBuffer: req.file.buffer,
      bucket: BUCKETS.PROFILE_IMAGES,
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
    const imageUrl = getPublicUrl(BUCKETS.PROFILE_IMAGES, uploadResult.data.path);

    // Update database
    await pool.query(
      'UPDATE entrepreneur_profiles SET image = $1, updated_at = NOW() WHERE id = $2',
      [imageUrl, entrepreneurProfile.id]
    );

    // Delete old image if exists
    if (oldImageUrl) {
      const oldFilePath = extractFilePathFromUrl(oldImageUrl, BUCKETS.PROFILE_IMAGES);
      if (oldFilePath) {
        await deleteFromSupabase(BUCKETS.PROFILE_IMAGES, oldFilePath);
      }
    }

    console.log(`[Upload] ✓ Entrepreneur profile picture uploaded: ${userId}`);

    res.status(200).json({
      message: 'Profile picture uploaded successfully',
      imageUrl: imageUrl,
    });

  } catch (error) {
    console.error('[Upload] Entrepreneur profile picture error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Delete Manager Profile Picture
 * DELETE /api/users/manager/profile-picture
 *
 * Removes profile image from Supabase and database
 */
export const deleteManagerProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get manager profile
    const managerResult = await pool.query(
      'SELECT id, image FROM manager_profiles WHERE user_id = $1',
      [userId]
    );

    if (managerResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Manager profile not found'
      });
    }

    const managerProfile = managerResult.rows[0];
    const imageUrl = managerProfile.image;

    if (!imageUrl) {
      return res.status(400).json({
        message: 'No profile picture to delete'
      });
    }

    // Extract file path from URL
    const filePath = extractFilePathFromUrl(imageUrl, BUCKETS.PROFILE_IMAGES);

    if (filePath) {
      // Delete from Supabase
      await deleteFromSupabase(BUCKETS.PROFILE_IMAGES, filePath);
    }

    // Update database
    await pool.query(
      'UPDATE manager_profiles SET image = NULL, updated_at = NOW() WHERE id = $1',
      [managerProfile.id]
    );

    console.log(`[Upload] ✓ Manager profile picture deleted: ${userId}`);

    res.status(200).json({
      message: 'Profile picture deleted successfully',
    });

  } catch (error) {
    console.error('[Upload] Delete manager profile picture error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Delete Entrepreneur Profile Picture
 * DELETE /api/users/entrepreneur/profile-picture
 *
 * Removes profile image from Supabase and database
 */
export const deleteEntrepreneurProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get entrepreneur profile
    const entrepreneurResult = await pool.query(
      'SELECT id, image FROM entrepreneur_profiles WHERE user_id = $1',
      [userId]
    );

    if (entrepreneurResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Entrepreneur profile not found'
      });
    }

    const entrepreneurProfile = entrepreneurResult.rows[0];
    const imageUrl = entrepreneurProfile.image;

    if (!imageUrl) {
      return res.status(400).json({
        message: 'No profile picture to delete'
      });
    }

    // Extract file path from URL
    const filePath = extractFilePathFromUrl(imageUrl, BUCKETS.PROFILE_IMAGES);

    if (filePath) {
      // Delete from Supabase
      await deleteFromSupabase(BUCKETS.PROFILE_IMAGES, filePath);
    }

    // Update database
    await pool.query(
      'UPDATE entrepreneur_profiles SET image = NULL, updated_at = NOW() WHERE id = $1',
      [entrepreneurProfile.id]
    );

    console.log(`[Upload] ✓ Entrepreneur profile picture deleted: ${userId}`);

    res.status(200).json({
      message: 'Profile picture deleted successfully',
    });

  } catch (error) {
    console.error('[Upload] Delete entrepreneur profile picture error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Update Entrepreneur Profile
 * PUT /api/users/entrepreneur/profile
 *
 * Updates entrepreneur profile information
 */
export const updateEntrepreneurProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      company_name,
      license_number,
      years_in_business,
      num_employees,
      address,
      specializations
    } = req.body;

    // Validate required fields
    if (!company_name || !license_number || !years_in_business || !num_employees || !address) {
      return res.status(400).json({
        message: 'Missing required fields',
        required: ['company_name', 'license_number', 'years_in_business', 'num_employees', 'address']
      });
    }

    // Check if entrepreneur profile exists
    const entrepreneurCheck = await pool.query(
      'SELECT id FROM entrepreneur_profiles WHERE user_id = $1',
      [userId]
    );

    if (entrepreneurCheck.rows.length === 0) {
      return res.status(404).json({
        message: 'Entrepreneur profile not found'
      });
    }

    // Update entrepreneur profile
    const updateResult = await pool.query(
      `UPDATE entrepreneur_profiles
       SET company_name = $1,
           license_number = $2,
           years_in_business = $3,
           num_employees = $4,
           address = $5,
           specializations = $6,
           updated_at = NOW()
       WHERE user_id = $7
       RETURNING *`,
      [
        company_name,
        license_number,
        years_in_business,
        num_employees,
        address,
        specializations || [],
        userId
      ]
    );

    console.log(`[Update] ✓ Entrepreneur profile updated: ${userId}`);

    res.status(200).json({
      message: 'Profile updated successfully',
      profile: updateResult.rows[0]
    });

  } catch (error) {
    console.error('[Update] Entrepreneur profile error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Update User Phone Number
 * PUT /api/users/phone
 *
 * Updates user's phone number in users table
 */
export const updateUserPhone = async (req, res) => {
  try {
    const userId = req.user.id;
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        message: 'Phone number is required'
      });
    }

    // Update phone in users table
    await pool.query(
      'UPDATE users SET phone = $1 WHERE id = $2',
      [phone, userId]
    );

    console.log(`[Update] ✓ User phone updated: ${userId}`);

    res.status(200).json({
      message: 'Phone number updated successfully',
      phone: phone
    });

  } catch (error) {
    console.error('[Update] User phone error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};
