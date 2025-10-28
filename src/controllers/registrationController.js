import pool from "../config/db.js";
import bcrypt from "bcryptjs";

// 🟢 Register Entrepreneur
export const registerEntrepreneur = async (req, res) => {
  const {
    email,
    password,
    first_name,
    last_name,
    phone,
    company_name,
    license_number,
    years_in_business,
    num_employees,
    address,
    specializations,
    provider = "local", // default provider
    provider_id = null, // e.g. Google user ID
  } = req.body;

  try {
    // Check if email already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Handle password logic
    let hashedPassword = null;
    if (provider === "local") {
      if (!password) {
        return res
          .status(400)
          .json({ message: "Password is required for local registration" });
      }
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Insert new user
    const userResult = await pool.query(
          `INSERT INTO users (email, password, first_name, last_name, role, provider, provider_id, email_verified, phone)
          VALUES ($1, $2, $3, $4, 'entrepreneur', $5, $6, $7, $8)
          RETURNING id, email, role, first_name, last_name, provider, provider_id`,
          [
            email, 
            hashedPassword, 
            first_name, 
            last_name, 
            provider, 
            provider_id, 
            provider !== "local",
            phone
        ] 
  );

    const userId = userResult.rows[0].id;

    // Insert entrepreneur profile
    const profileResult = await pool.query(
      `INSERT INTO entrepreneur_profiles (
         user_id, company_name, license_number, years_in_business,
         num_employees, address, specializations, subscription_plan
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId,
        company_name,
        license_number,
        years_in_business || 0,
        num_employees || 0,
        address,
        specializations || [],
        "none",
      ]
    );

    res.status(201).json({
      message: "Entrepreneur registered successfully",
      user: userResult.rows[0],
      profile: profileResult.rows[0],
    });
  } catch (error) {
    console.error("Error registering entrepreneur:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 🟢 Register Property Manager
export const registerManager = async (req, res) => {
  const {
    email,
    password,
    first_name,
    last_name,
    phone,
    company_name,
    address,
    provider = "local",
    provider_id = null,
  } = req.body;

  try {
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "Email already registered" });
    }

    let hashedPassword = null;
    if (provider === "local") {
      if (!password) {
        return res
          .status(400)
          .json({ message: "Password is required for local registration" });
      }
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const userResult = await pool.query(
          `INSERT INTO users (email, password, first_name, last_name, role, provider, provider_id, email_verified, phone)
          VALUES ($1, $2, $3, $4, 'property_manager', $5, $6, $7, $8)
          RETURNING id, email, role, first_name, last_name, provider, provider_id`,
          [
            email, 
            hashedPassword, 
            first_name, 
            last_name, 
            provider, 
            provider_id, 
            provider !== "local",
            // ✅ ADD phone as the new 8th parameter
            phone
        ]
    );

    const userId = userResult.rows[0].id;

    const profileResult = await pool.query(
      `INSERT INTO manager_profiles (user_id, company_name, address)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, company_name, address]
    );

    res.status(201).json({
      message: "Property manager registered successfully",
      user: userResult.rows[0],
      profile: profileResult.rows[0],
    });
  } catch (error) {
    console.error("Error registering manager:", error);
    res.status(500).json({ message: "Server error" });
  }
};
