import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendVerificationEmail } from "../config/emailConfig.js";

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

    // Generate verification token for local registrations
    let verificationToken = null;
    let tokenExpires = null;
    if (provider === "local") {
      verificationToken = crypto.randomBytes(32).toString('hex');
      tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    }

    // Insert new user
    const userResult = await pool.query(
          `INSERT INTO users (email, password, first_name, last_name, role, provider, provider_id, email_verified, phone, verification_token, verification_token_expires)
          VALUES ($1, $2, $3, $4, 'entrepreneur', $5, $6, $7, $8, $9, $10)
          RETURNING id, email, role, first_name, last_name, provider, provider_id`,
          [
            email,
            hashedPassword,
            first_name,
            last_name,
            provider,
            provider_id,
            provider !== "local", // email_verified is true for social login, false for local
            phone,
            verificationToken,
            tokenExpires
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

    // Send verification email for local registrations
    if (provider === "local" && verificationToken) {
      await sendVerificationEmail(email, verificationToken);
    }

    res.status(201).json({
      message: provider === "local"
        ? "Entrepreneur registered successfully. Please check your email to verify your account."
        : "Entrepreneur registered successfully",
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

    // Generate verification token for local registrations
    let verificationToken = null;
    let tokenExpires = null;
    if (provider === "local") {
      verificationToken = crypto.randomBytes(32).toString('hex');
      tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    }

    const userResult = await pool.query(
          `INSERT INTO users (email, password, first_name, last_name, role, provider, provider_id, email_verified, phone, verification_token, verification_token_expires)
          VALUES ($1, $2, $3, $4, 'property_manager', $5, $6, $7, $8, $9, $10)
          RETURNING id, email, role, first_name, last_name, provider, provider_id`,
          [
            email,
            hashedPassword,
            first_name,
            last_name,
            provider,
            provider_id,
            provider !== "local", // email_verified is true for social login, false for local
            phone,
            verificationToken,
            tokenExpires
        ]
    );

    const userId = userResult.rows[0].id;

    const profileResult = await pool.query(
      `INSERT INTO manager_profiles (user_id, company_name, address)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, company_name, address]
    );

    // Send verification email for local registrations
    if (provider === "local" && verificationToken) {
      await sendVerificationEmail(email, verificationToken);
    }

    res.status(201).json({
      message: provider === "local"
        ? "Property manager registered successfully. Please check your email to verify your account."
        : "Property manager registered successfully",
      user: userResult.rows[0],
      profile: profileResult.rows[0],
    });
  } catch (error) {
    console.error("Error registering manager:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 🟢 Register Supplier
export const registerSupplier = async (req, res) => {
  const {
    email,
    password,
    first_name,
    last_name,
    phone,
    company_name,
    address,
    website,
    years_in_business,
    delivery_areas,
    provider = "local",
    provider_id = null,
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

    // Generate verification token for local registrations
    let verificationToken = null;
    let tokenExpires = null;
    if (provider === "local") {
      verificationToken = crypto.randomBytes(32).toString('hex');
      tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    }

    // Insert new user
    const userResult = await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, role, provider, provider_id, email_verified, phone, verification_token, verification_token_expires)
       VALUES ($1, $2, $3, $4, 'supplier', $5, $6, $7, $8, $9, $10)
       RETURNING id, email, role, first_name, last_name, provider, provider_id`,
      [
        email,
        hashedPassword,
        first_name,
        last_name,
        provider,
        provider_id,
        provider !== "local", // email_verified is true for social login, false for local
        phone,
        verificationToken,
        tokenExpires
      ]
    );

    const userId = userResult.rows[0].id;

    // Convert delivery_areas string to array if needed
    let deliveryAreasArray = [];
    if (delivery_areas) {
      if (typeof delivery_areas === "string") {
        deliveryAreasArray = delivery_areas
          .split(",")
          .map((area) => area.trim())
          .filter(Boolean);
      } else if (Array.isArray(delivery_areas)) {
        deliveryAreasArray = delivery_areas;
      }
    }

    // Insert supplier profile
    const profileResult = await pool.query(
      `INSERT INTO supplier_profiles (
         user_id, company_name, address, phone, website,
         years_in_business, delivery_areas
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        company_name,
        address,
        phone,
        website || null,
        years_in_business || 0,
        deliveryAreasArray
      ]
    );

    // Send verification email for local registrations
    if (provider === "local" && verificationToken) {
      await sendVerificationEmail(email, verificationToken);
    }

    res.status(201).json({
      message: provider === "local"
        ? "Supplier registered successfully. Please check your email to verify your account."
        : "Supplier registered successfully",
      user: userResult.rows[0],
      profile: profileResult.rows[0],
    });
  } catch (error) {
    console.error("Error registering supplier:", error);
    res.status(500).json({ message: "Server error" });
  }
};
