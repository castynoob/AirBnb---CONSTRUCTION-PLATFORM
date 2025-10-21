// src/scripts/seedSafeData.js
import pool from "../config/db.js";

const seedSafeData = async () => {
  console.log("🌱 Starting safe data seeding...");

  try {
    // --- 1️⃣ USERS ---
    await pool.query(`
      INSERT INTO users (id, name, email, password, role)
      VALUES 
        (gen_random_uuid(), 'Manager One', 'manager1@example.com', '123456', 'manager'),
        (gen_random_uuid(), 'Contractor One', 'contractor1@example.com', '123456', 'contractor')
      ON CONFLICT (email) DO NOTHING;
    `);
    console.log("✅ Users inserted (safe)");

    // --- 2️⃣ MANAGER PROFILES ---
    await pool.query(`
      INSERT INTO manager_profiles (user_id, company_name, phone_number)
      SELECT u.id, 'Alpha Property Management', '+639171234567'
      FROM users u
      WHERE u.email = 'manager1@example.com'
      ON CONFLICT (user_id) DO NOTHING;
    `);
    console.log("✅ Manager profile inserted (safe)");

    // --- 3️⃣ PROPERTIES ---
    await pool.query(`
      INSERT INTO properties (
        manager_id, address, city, province, postal_code,
        num_units, building_type, latitude, longitude
      )
      SELECT 
        mp.id, 
        '123 Main Street', 
        'Makati City', 
        'Metro Manila', 
        '1200', 
        20, 
        'Condominium', 
        14.5547, 
        121.0244
      FROM manager_profiles mp
      JOIN users u ON mp.user_id = u.id
      WHERE u.email = 'manager1@example.com'
      ON CONFLICT DO NOTHING;
    `);
    console.log("✅ Property inserted (safe)");

    // --- 4️⃣ OPTIONAL: JOBS / BIDS ---
    await pool.query(`
      INSERT INTO jobs (property_id, title, description, status)
      SELECT p.id, 'Roof Repair', 'Fix leaks on the main roof', 'pending'
      FROM properties p
      LIMIT 1
      ON CONFLICT DO NOTHING;
    `);
    console.log("✅ Job inserted (safe)");

    await pool.query(`
      INSERT INTO bids (job_id, contractor_id, amount, status)
      SELECT 
        j.id,
        (SELECT id FROM contractor_profiles cp JOIN users u2 ON cp.user_id = u2.id WHERE u2.email = 'contractor1@example.com' LIMIT 1),
        50000,
        'submitted'
      FROM jobs j
      LIMIT 1
      ON CONFLICT DO NOTHING;
    `);
    console.log("✅ Bid inserted (safe)");

    console.log("🎉 Safe seeding completed successfully!");
  } catch (err) {
    console.error("❌ Error during seeding:", err.message);
  } finally {
    await pool.end();
  }
};

seedSafeData();
