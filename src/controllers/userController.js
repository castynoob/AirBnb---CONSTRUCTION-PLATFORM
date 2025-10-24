// ✅ src/controllers/userController.js
import pool from "../config/db.js";

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
      `SELECT ep.*, u.email, u.first_name, u.last_name
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
