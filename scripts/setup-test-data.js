import pg from "pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

const { Pool } = pg;
dotenv.config();

const pool = new Pool({
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DB,
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
});

const setupTestData = async () => {
  const client = await pool.connect();

  try {
    console.log("🚀 Setting up test data...\n");

    // Hash password
    const hashedPassword = await bcrypt.hash("password123", 10);

    // ========================================
    // 1. CREATE ENTREPRENEUR USER
    // ========================================
    console.log("👷 Creating entrepreneur user...");
    const entrepreneurUser = await client.query(
      `INSERT INTO users (email, password, first_name, last_name, role, email_verified)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      ["entrepreneur@test.com", hashedPassword, "John", "Builder", "entrepreneur"]
    );
    console.log("✅ Entrepreneur user created");

    // Create entrepreneur profile
    console.log("📋 Creating entrepreneur profile...");
    const entrepreneurProfile = await client.query(
      `INSERT INTO entrepreneur_profiles (
        user_id, company_name, license_number, years_in_business, 
        num_employees, address, specializations, average_rating, total_reviews
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id) DO UPDATE SET company_name = EXCLUDED.company_name
       RETURNING id`,
      [
        entrepreneurUser.rows[0].id,
        "John's Construction Co.",
        "LIC-12345",
        10,
        5,
        "123 Builder St, Montreal",
        ["Roofing", "Plumbing", "Electrical"],
        4.8,
        45
      ]
    );
    console.log("✅ Entrepreneur profile created\n");

    // ========================================
    // 2. CREATE PROPERTY MANAGER USER
    // ========================================
    console.log("👔 Creating property manager user...");
    const managerUser = await client.query(
      `INSERT INTO users (email, password, first_name, last_name, role, email_verified)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      ["manager@test.com", hashedPassword, "Jane", "Manager", "property_manager"]
    );
    console.log("✅ Manager user created");

    // Create manager profile
    console.log("📋 Creating manager profile...");
    const managerProfile = await client.query(
      `INSERT INTO manager_profiles (user_id, company_name, address, total_properties)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET company_name = EXCLUDED.company_name
       RETURNING id`,
      [
        managerUser.rows[0].id,
        "ABC Property Management",
        "456 Manager Ave, Montreal",
        3
      ]
    );
    console.log("✅ Manager profile created\n");

    // ========================================
    // 3. CREATE PROPERTY
    // ========================================
    console.log("🏢 Creating property...");
    const property = await client.query(
      `INSERT INTO properties (
        manager_id, address, city, province, postal_code, 
        num_units, building_type
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        managerProfile.rows[0].id,
        "789 Sunset Apartments",
        "Montreal",
        "Quebec",
        "H3A 1A1",
        10,
        "Apartment"
      ]
    );
    console.log("✅ Property created\n");

    // ========================================
    // 4. CREATE JOBS
    // ========================================
    console.log("🏗️ Creating test jobs...");
    
    const job1 = await client.query(
      `INSERT INTO jobs (
        property_id, manager_id, title, description, category, 
        urgency, due_date, estimated_duration_days, 
        budget_min, budget_max, is_budget_hidden, status
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        property.rows[0].id,
        managerProfile.rows[0].id,
        "Roof Repair Needed",
        "Replace damaged shingles on building roof",
        "Roofing",
        "Urgent (Current Year)",
        "2025-12-31",
        5,
        5000,
        8000,
        true,
        "Open"
      ]
    );

    const job2 = await client.query(
      `INSERT INTO jobs (
        property_id, manager_id, title, description, category, 
        urgency, due_date, estimated_duration_days, 
        budget_min, budget_max, is_budget_hidden, status
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        property.rows[0].id,
        managerProfile.rows[0].id,
        "Plumbing Fix in Unit 302",
        "Fix leaking pipes in kitchen",
        "Plumbing",
        "Next Year",
        "2026-06-30",
        2,
        1000,
        2000,
        false,
        "Open"
      ]
    );

    const job3 = await client.query(
      `INSERT INTO jobs (
        property_id, manager_id, title, description, category, 
        urgency, due_date, estimated_duration_days, 
        budget_min, budget_max, is_budget_hidden, status
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        property.rows[0].id,
        managerProfile.rows[0].id,
        "Electrical Upgrade",
        "Upgrade electrical panel in basement",
        "Electrical",
        "Urgent (Current Year)",
        "2025-08-30",
        3,
        3000,
        5000,
        true,
        "Open"
      ]
    );

    console.log("✅ 3 jobs created\n");

    // ========================================
    // SUMMARY
    // ========================================
    console.log("🎉 Test data setup complete!\n");
    console.log("📋 SUMMARY:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("👷 ENTREPRENEUR ACCOUNT:");
    console.log("   Email: entrepreneur@test.com");
    console.log("   Password: password123");
    console.log("   Company: John's Construction Co.");
    console.log(`   Profile ID: ${entrepreneurProfile.rows[0].id}`);
    console.log("");
    console.log("👔 PROPERTY MANAGER ACCOUNT:");
    console.log("   Email: manager@test.com");
    console.log("   Password: password123");
    console.log("   Company: ABC Property Management");
    console.log(`   Profile ID: ${managerProfile.rows[0].id}`);
    console.log("");
    console.log("🏢 PROPERTY:");
    console.log("   Address: 789 Sunset Apartments, Montreal");
    console.log(`   Property ID: ${property.rows[0].id}`);
    console.log("");
    console.log("🏗️ JOBS:");
    console.log(`   Job 1: Roof Repair - ${job1.rows[0].id}`);
    console.log(`   Job 2: Plumbing Fix - ${job2.rows[0].id}`);
    console.log(`   Job 3: Electrical Upgrade - ${job3.rows[0].id}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n✅ You can now test bidding!");

  } catch (err) {
    console.error("❌ Error setting up test data:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

setupTestData();