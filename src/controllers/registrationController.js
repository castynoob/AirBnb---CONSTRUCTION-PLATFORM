import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendVerificationEmail } from "../config/emailConfig.js";
import groupChatModel from "../models/groupChatModel.js";

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

    // Send verification email for local registrations (non-blocking)
    let emailSent = false;
    if (provider === "local" && verificationToken) {
      try {
        await sendVerificationEmail(email, verificationToken);
        emailSent = true;
        console.log(`✅ Verification email sent to ${email}`);
      } catch (emailError) {
        console.error("❌ Failed to send verification email:", emailError);
        // Don't block registration if email fails
        emailSent = false;
      }
    }

    res.status(201).json({
      message: provider === "local"
        ? emailSent
          ? "Entrepreneur registered successfully. Please check your email to verify your account."
          : "Entrepreneur registered successfully. Verification email will be sent shortly."
        : "Entrepreneur registered successfully",
      user: userResult.rows[0],
      profile: profileResult.rows[0],
      emailSent,
    });
  } catch (error) {
    console.error("Error registering entrepreneur:", error);
    res.status(500).json({ message: "Server error", error: error.message });
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

    // Send verification email for local registrations (non-blocking)
    let emailSent = false;
    if (provider === "local" && verificationToken) {
      try {
        await sendVerificationEmail(email, verificationToken);
        emailSent = true;
        console.log(`✅ Verification email sent to ${email}`);
      } catch (emailError) {
        console.error("❌ Failed to send verification email:", emailError);
        // Don't block registration if email fails
        emailSent = false;
      }
    }

    res.status(201).json({
      message: provider === "local"
        ? emailSent
          ? "Property manager registered successfully. Please check your email to verify your account."
          : "Property manager registered successfully. Verification email will be sent shortly."
        : "Property manager registered successfully",
      user: userResult.rows[0],
      profile: profileResult.rows[0],
      emailSent,
    });
  } catch (error) {
    console.error("Error registering manager:", error);
    res.status(500).json({ message: "Server error", error: error.message });
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

    // Send verification email for local registrations (non-blocking)
    let emailSent = false;
    if (provider === "local" && verificationToken) {
      try {
        await sendVerificationEmail(email, verificationToken);
        emailSent = true;
        console.log(`✅ Verification email sent to ${email}`);
      } catch (emailError) {
        console.error("❌ Failed to send verification email:", emailError);
        // Don't block registration if email fails
        emailSent = false;
      }
    }

    res.status(201).json({
      message: provider === "local"
        ? emailSent
          ? "Supplier registered successfully. Please check your email to verify your account."
          : "Supplier registered successfully. Verification email will be sent shortly."
        : "Supplier registered successfully",
      user: userResult.rows[0],
      profile: profileResult.rows[0],
      emailSent,
    });
  } catch (error) {
    console.error("Error registering supplier:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// 🟢 Register Resident
export const registerResident = async (req, res) => {
  const {
    email,
    password,
    first_name,
    last_name,
    phone,
    property_id,
    property_name,  // NEW: Free text input for building name
    unit_number,
    floor,
    building_section,
    move_in_date,
    provider = "local",
    provider_id = null,
  } = req.body;

  try {
    // Validate required fields
    if (!email || !first_name || !last_name || !phone) {
      return res.status(400).json({
        message: "Missing required fields: email, first_name, last_name, and phone are required"
      });
    }

    if (!property_id && !property_name) {
      return res.status(400).json({
        message: "Property information is required. Please provide either property_id or property_name"
      });
    }

    if (!unit_number) {
      return res.status(400).json({
        message: "Unit number is required"
      });
    }

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
       VALUES ($1, $2, $3, $4, 'resident', $5, $6, $7, $8, $9, $10)
       RETURNING id, email, role, first_name, last_name, provider, provider_id`,
      [
        email,
        hashedPassword,
        first_name,
        last_name,
        provider,
        provider_id,
        provider !== "local",
        phone,
        verificationToken,
        tokenExpires
      ]
    );

    const userId = userResult.rows[0].id;

    // Get building_name from the selected property if property_id is provided
    let building_name = property_name || null;
    if (property_id) {
      const propertyQuery = await pool.query(
        'SELECT building_name FROM properties WHERE id = $1',
        [property_id]
      );
      if (propertyQuery.rows.length > 0 && propertyQuery.rows[0].building_name) {
        building_name = propertyQuery.rows[0].building_name;
      }
    }

    // Insert resident profile
    const profileResult = await pool.query(
      `INSERT INTO resident_profiles (
         user_id, property_id, property_name, building_name, unit_number, floor, building_section, move_in_date
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId,
        property_id || null,
        property_name || null,  // Save the user's text input for building name
        building_name,  // Use the building_name from property or property_name
        unit_number || null,
        floor || null,
        building_section || null,
        move_in_date || null
      ]
    );

    // Automatically add resident to building group chat
    if (building_name) {
      try {
        console.log(`➕ Adding resident to building group chat: ${building_name}`);

        // Get or create the building group chat
        const groupChat = await groupChatModel.getOrCreateBuildingGroupChat(building_name, userId);
        console.log(`✅ Group chat found/created: ${groupChat.name} (ID: ${groupChat.id})`);

        // Add the new resident as a member
        await groupChatModel.addMember(groupChat.id, userId, false);
        console.log(`✅ Resident ${userId} added to group chat ${groupChat.id}`);
      } catch (groupChatError) {
        console.error('⚠️ Error adding resident to group chat:', groupChatError.message);
        // Don't fail registration if group chat addition fails
      }
    }

    // Send verification email for local registrations (non-blocking)
    let emailSent = false;
    if (provider === "local" && verificationToken) {
      try {
        await sendVerificationEmail(email, verificationToken);
        emailSent = true;
        console.log(`✅ Verification email sent to ${email}`);
      } catch (emailError) {
        console.error("❌ Failed to send verification email:", emailError);
        // Don't block registration if email fails
        emailSent = false;
      }
    }

    res.status(201).json({
      message: provider === "local"
        ? emailSent
          ? "Resident registered successfully. Please check your email to verify your account."
          : "Resident registered successfully. Verification email will be sent shortly."
        : "Resident registered successfully",
      user: userResult.rows[0],
      profile: profileResult.rows[0],
      emailSent,
    });
  } catch (error) {
    console.error("Error registering resident:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// 🟢 Check for duplicate license number or phone number
export const checkDuplicates = async (req, res) => {
  const { license_number, phone } = req.body;

  try {
    const duplicates = {
      license_number: false,
      phone: false
    };

    // Check for duplicate license number in entrepreneur_profiles
    if (license_number) {
      const licenseCheck = await pool.query(
        "SELECT id FROM entrepreneur_profiles WHERE license_number = $1",
        [license_number]
      );
      duplicates.license_number = licenseCheck.rows.length > 0;
    }

    // Check for duplicate phone number in users table
    if (phone) {
      // Normalize phone number for comparison (remove spaces, dashes, etc.)
      const normalizedPhone = phone.replace(/[\s\-()]/g, '');
      const phoneCheck = await pool.query(
        "SELECT id FROM users WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = $1",
        [normalizedPhone]
      );
      duplicates.phone = phoneCheck.rows.length > 0;
    }

    res.status(200).json({
      duplicates,
      message: duplicates.license_number || duplicates.phone
        ? "Duplicate found"
        : "No duplicates"
    });
  } catch (error) {
    console.error("Error checking duplicates:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};