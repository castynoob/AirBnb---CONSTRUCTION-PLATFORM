import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendVerificationEmail } from "../config/emailConfig.js";
import groupChatModel from "../models/groupChatModel.js";
import {
  validateRBQLicense,
  persistRBQResult,
  isRBQValidationEnabled,
  normaliseRBQLicense,
} from "../services/rbqValidationService.js";
import { attemptReferralAttribution } from "./referralController.js";

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
    city,
    state,
    province,
    zip_code,
    postal_code,
    country,
    specializations,
    provider = "local", // default provider
    provider_id = null, // e.g. Google user ID
    terms_accepted_at,
    referral_code, // optional — attributes the signup to the code's owner
  } = req.body;

  try {
    // Check if email already has an entrepreneur account
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND role = 'entrepreneur'",
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "You already have an Entrepreneur account with this email." });
    }

    // Check if this email already has another role account (for password sync & auto-verify)
    const existingAccount = await pool.query(
      "SELECT password, email_verified FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );
    const hasExistingAccount = existingAccount.rows.length > 0 && existingAccount.rows[0].password;

    // Handle password logic
    let hashedPassword = null;
    if (provider === "local") {
      if (hasExistingAccount) {
        hashedPassword = existingAccount.rows[0].password;
      } else if (!password) {
        return res.status(400).json({ message: "Password is required for local registration" });
      } else {
        hashedPassword = await bcrypt.hash(password, 10);
      }
    }

    // Generate verification token for local registrations
    let verificationToken = null;
    let tokenExpires = null;
    if (provider === "local") {
      if (existingAccount.rows.length > 0 && existingAccount.rows[0].email_verified) {
        // Already verified with another role - skip verification
      } else {
        verificationToken = crypto.randomBytes(32).toString('hex');
        tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      }
    }

    // Validate years_in_business (must be between 0 and 100)
    const parsedYearsInBusiness = parseInt(years_in_business) || 0;
    if (parsedYearsInBusiness < 0 || parsedYearsInBusiness > 100) {
      return res.status(400).json({
        message: "Years in business must be between 0 and 100"
      });
    }

    // Validate num_employees (must be between 0 and 100)
    const parsedNumEmployees = parseInt(num_employees) || 0;
    if (parsedNumEmployees < 0 || parsedNumEmployees > 100) {
      return res.status(400).json({
        message: "Number of employees must be between 0 and 100"
      });
    }

    // -----------------------------------------------------------------
    // RBQ license gate — hard block per the product decision. Only runs
    // when the feature flag is on AND the queryRBQRegistry integration is
    // wired to a real endpoint (otherwise the service returns 'unavailable'
    // and we don't want to brick every signup).
    //
    // The result is captured in `rbqResult` so we can persist it onto the
    // freshly created profile a few lines below.
    // -----------------------------------------------------------------
    let rbqResult = null;
    if (isRBQValidationEnabled()) {
      if (!normaliseRBQLicense(license_number)) {
        return res.status(400).json({
          code: "rbq_format",
          message:
            "The RBQ license must be 10 digits, formatted as NNNN-NNNN-NN.",
        });
      }
      rbqResult = await validateRBQLicense(license_number);
      if (!rbqResult.ok) {
        // Only 'unavailable' would earn a retry; both cases block registration
        // per the "hard block" product decision. Include reason so the frontend
        // can differentiate copy.
        return res.status(400).json({
          code: rbqResult.reason === "unavailable" ? "rbq_unavailable" : "rbq_error",
          message:
            rbqResult.reason === "unavailable"
              ? "We couldn't reach the RBQ registry to verify your licence. Please try again in a few minutes."
              : "RBQ licence check failed. Please double-check your licence number and try again.",
        });
      }
      if (rbqResult.status === "invalid") {
        return res.status(400).json({
          code: "rbq_invalid",
          message:
            "The RBQ registry has no record of this licence number. Please verify and try again.",
        });
      }
      if (rbqResult.status === "restricted") {
        return res.status(400).json({
          code: "rbq_restricted",
          message:
            "This RBQ licence has active restrictions and cannot be used to register. Contact support if you believe this is a mistake.",
          restrictions: rbqResult.restrictions || [],
        });
      }
    }

    // Insert new user
    const userResult = await pool.query(
          `INSERT INTO users (email, password, first_name, last_name, role, provider, provider_id, email_verified, phone, verification_token, verification_token_expires, address, city, province, postal_code, country, terms_accepted, terms_accepted_at)
          VALUES ($1, $2, $3, $4, 'entrepreneur', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          RETURNING id, email, role, first_name, last_name, provider, provider_id`,
          [
            email,
            hashedPassword,
            first_name,
            last_name,
            provider,
            provider_id,
            provider !== "local" || !verificationToken, // auto-verify if social login or existing verified account
            phone,
            verificationToken,
            tokenExpires,
            address || null,
            city || null,
            state || province || null,
            zip_code || postal_code || null,
            country || null,
            !!terms_accepted_at,
            terms_accepted_at || null
        ]
  );

    const userId = userResult.rows[0].id;

    // Referral attribution — non-fatal. Awaited so the outcome (pending or
    // blocked) can be returned in the response and surfaced to the user.
    let referralOutcome = null;
    if (referral_code) {
      // Prefer X-Forwarded-For's leftmost IP (originating client) when behind
      // Render/Cloudflare's proxy; fall back to Express's req.ip.
      const forwarded = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim();
      const signupIp = forwarded || req.ip || null;
      referralOutcome = await attemptReferralAttribution({
        newUserId: userId, referralCodeInput: referral_code, signupIp,
      }).catch((err) => {
        console.error("⚠️ referral hook failed (entrepreneur):", err.message);
        return null;
      });
    }

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
        parsedYearsInBusiness,
        parsedNumEmployees,
        address,
        specializations || [],
        "none",
      ]
    );

    // Persist the RBQ result onto the profile so managers see the badge and
    // admins can audit. Only runs when we actually did a check above; done in
    // a try/catch so a persistence hiccup doesn't fail the whole registration
    // (the account is created regardless).
    if (rbqResult) {
      try {
        await persistRBQResult(profileResult.rows[0].id, rbqResult);
      } catch (persistErr) {
        console.error("⚠️ RBQ persist failed (registration continues):", persistErr.message);
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

    const autoVerified = provider === "local" && !verificationToken;
    res.status(201).json({
      message: provider !== "local" || autoVerified
        ? "Entrepreneur registered successfully."
        : emailSent
          ? "Entrepreneur registered successfully. Please check your email to verify your account."
          : "Entrepreneur registered successfully. Verification email will be sent shortly.",
      user: userResult.rows[0],
      profile: profileResult.rows[0],
      emailSent,
      autoVerified,
      // Referral outcome so the frontend can toast the user if the code was
      // silently rejected. Shape: { pending: true } | { blocked: "reason" } | null
      referral: referralOutcome,
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
    city,
    state,
    province,
    zip_code,
    postal_code,
    country,
    provider = "local",
    provider_id = null,
    terms_accepted_at,
    referral_code, // optional — attributes the signup to the code's owner
  } = req.body;

  try {
    // Check if email already has a property manager account
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND role = 'property_manager'",
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "You already have a Property Manager account with this email." });
    }

    // Check if this email already has another role account (for password sync & auto-verify)
    const existingAccount = await pool.query(
      "SELECT password, email_verified FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );
    const hasExistingAccount = existingAccount.rows.length > 0 && existingAccount.rows[0].password;

    let hashedPassword = null;
    if (provider === "local") {
      if (hasExistingAccount) {
        hashedPassword = existingAccount.rows[0].password;
      } else if (!password) {
        return res.status(400).json({ message: "Password is required for local registration" });
      } else {
        hashedPassword = await bcrypt.hash(password, 10);
      }
    }

    // Generate verification token for local registrations
    let verificationToken = null;
    let tokenExpires = null;
    if (provider === "local") {
      if (existingAccount.rows.length > 0 && existingAccount.rows[0].email_verified) {
        // Already verified with another role - skip verification
      } else {
        verificationToken = crypto.randomBytes(32).toString('hex');
        tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      }
    }

    const userResult = await pool.query(
          `INSERT INTO users (email, password, first_name, last_name, role, provider, provider_id, email_verified, phone, verification_token, verification_token_expires, address, city, province, postal_code, country, terms_accepted, terms_accepted_at)
          VALUES ($1, $2, $3, $4, 'property_manager', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          RETURNING id, email, role, first_name, last_name, provider, provider_id`,
          [
            email,
            hashedPassword,
            first_name,
            last_name,
            provider,
            provider_id,
            provider !== "local" || !verificationToken, // auto-verify if social login or existing verified account
            phone,
            verificationToken,
            tokenExpires,
            address || null,
            city || null,
            state || province || null,
            zip_code || postal_code || null,
            country || null,
            !!terms_accepted_at,
            terms_accepted_at || null
        ]
    );

    const userId = userResult.rows[0].id;

    // Referral attribution — non-fatal. If a valid referral_code was passed,
    // record the referral row and issue the new user's welcome promo.
    let referralOutcome = null;
    if (referral_code) {
      const forwarded = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim();
      const signupIp = forwarded || req.ip || null;
      referralOutcome = await attemptReferralAttribution({
        newUserId: userId, referralCodeInput: referral_code, signupIp,
      }).catch((err) => {
        console.error("⚠️ referral hook failed (manager):", err.message);
        return null;
      });
    }

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

    const autoVerified = provider === "local" && !verificationToken;
    res.status(201).json({
      message: provider !== "local" || autoVerified
        ? "Property manager registered successfully."
        : emailSent
          ? "Property manager registered successfully. Please check your email to verify your account."
          : "Property manager registered successfully. Verification email will be sent shortly.",
      user: userResult.rows[0],
      profile: profileResult.rows[0],
      emailSent,
      autoVerified,
      // Referral outcome, mirroring the entrepreneur endpoint. Only ever
      // non-null when referrals get expanded to PMs (contractors-only today).
      referral: referralOutcome,
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
    city,
    state,
    province,
    zip_code,
    postal_code,
    country,
    website,
    years_in_business,
    delivery_areas,
    provider = "local",
    provider_id = null,
  } = req.body;

  try {
    // Check if email already has a supplier account
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND role = 'supplier'",
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "You already have a Supplier account with this email." });
    }

    // Check if this email already has another role account (for password sync & auto-verify)
    const existingAccount = await pool.query(
      "SELECT password, email_verified FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );
    const hasExistingAccount = existingAccount.rows.length > 0 && existingAccount.rows[0].password;

    // Handle password logic
    let hashedPassword = null;
    if (provider === "local") {
      if (hasExistingAccount) {
        hashedPassword = existingAccount.rows[0].password;
      } else if (!password) {
        return res.status(400).json({ message: "Password is required for local registration" });
      } else {
        hashedPassword = await bcrypt.hash(password, 10);
      }
    }

    // Generate verification token for local registrations
    let verificationToken = null;
    let tokenExpires = null;
    if (provider === "local") {
      if (existingAccount.rows.length > 0 && existingAccount.rows[0].email_verified) {
        // Already verified with another role - skip verification
      } else {
        verificationToken = crypto.randomBytes(32).toString('hex');
        tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      }
    }

    // Validate years_in_business (must be between 0 and 100)
    const parsedYearsInBusiness = parseInt(years_in_business) || 0;
    if (parsedYearsInBusiness < 0 || parsedYearsInBusiness > 100) {
      return res.status(400).json({
        message: "Years in business must be between 0 and 100"
      });
    }

    // Insert new user
    const userResult = await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, role, provider, provider_id, email_verified, phone, verification_token, verification_token_expires, address, city, province, postal_code, country)
       VALUES ($1, $2, $3, $4, 'supplier', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, email, role, first_name, last_name, provider, provider_id`,
      [
        email,
        hashedPassword,
        first_name,
        last_name,
        provider,
        provider_id,
        provider !== "local" || !verificationToken, // auto-verify if social login or existing verified account
        phone,
        verificationToken,
        tokenExpires,
        address || null,
        city || null,
        state || province || null,
        zip_code || postal_code || null,
        country || null
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
        parsedYearsInBusiness,
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

    const autoVerified = provider === "local" && !verificationToken;
    res.status(201).json({
      message: provider !== "local" || autoVerified
        ? "Supplier registered successfully."
        : emailSent
          ? "Supplier registered successfully. Please check your email to verify your account."
          : "Supplier registered successfully. Verification email will be sent shortly.",
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
    terms_accepted_at,
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

    // Check if email already has a resident account
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND role = 'resident'",
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "You already have a Resident account with this email." });
    }

    // Check if this email already has another role account (for password sync & auto-verify)
    const existingAccount = await pool.query(
      "SELECT password, email_verified FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );
    const hasExistingAccount = existingAccount.rows.length > 0 && existingAccount.rows[0].password;

    // Handle password logic
    let hashedPassword = null;
    if (provider === "local") {
      if (hasExistingAccount) {
        hashedPassword = existingAccount.rows[0].password;
      } else if (!password) {
        return res.status(400).json({ message: "Password is required for local registration" });
      } else {
        hashedPassword = await bcrypt.hash(password, 10);
      }
    }

    // Generate verification token for local registrations
    let verificationToken = null;
    let tokenExpires = null;
    if (provider === "local") {
      if (existingAccount.rows.length > 0 && existingAccount.rows[0].email_verified) {
        // Already verified with another role - skip verification
      } else {
        verificationToken = crypto.randomBytes(32).toString('hex');
        tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      }
    }

    // Insert new user
    const userResult = await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, role, provider, provider_id, email_verified, phone, verification_token, verification_token_expires, terms_accepted, terms_accepted_at)
       VALUES ($1, $2, $3, $4, 'resident', $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, email, role, first_name, last_name, provider, provider_id`,
      [
        email,
        hashedPassword,
        first_name,
        last_name,
        provider,
        provider_id,
        provider !== "local" || !verificationToken,
        phone,
        verificationToken,
        tokenExpires,
        !!terms_accepted_at,
        terms_accepted_at || null
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

    const autoVerified = provider === "local" && !verificationToken;
    res.status(201).json({
      message: provider !== "local" || autoVerified
        ? "Resident registered successfully."
        : emailSent
          ? "Resident registered successfully. Please check your email to verify your account."
          : "Resident registered successfully. Verification email will be sent shortly.",
      user: userResult.rows[0],
      profile: profileResult.rows[0],
      emailSent,
    });
  } catch (error) {
    console.error("Error registering resident:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// 🟢 Check if email already has an account (for multi-role registration)
export const checkEmailExists = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const result = await pool.query(
      "SELECT role, first_name, last_name, phone FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );
    const roles = result.rows.map(r => r.role);
    const user = result.rows[0] || null;
    res.status(200).json({
      exists: roles.length > 0,
      roles,
      first_name: user?.first_name || null,
      last_name: user?.last_name || null,
      phone: user?.phone || null,
    });
  } catch (error) {
    console.error("Error checking email:", error);
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