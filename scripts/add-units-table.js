import pg from "pg";
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

const addUnitsTable = async () => {
  const client = await pool.connect();

  try {
    console.log("🚀 Adding Units Table...\n");

    // Create units table
    console.log("📦 Creating units table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS units (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
        unit_number VARCHAR(50) NOT NULL,
        floor INT,
        bedrooms INT,
        bathrooms NUMERIC(3,1),
        square_feet INT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(property_id, unit_number)
      );
    `);
    console.log("✅ units table created\n");

    // Update properties table
    console.log("🏢 Updating properties table...");
    await client.query(`
      ALTER TABLE properties 
      ADD COLUMN IF NOT EXISTS building_name VARCHAR(255);
    `);
    console.log("✅ properties updated\n");

    // Add unit_id to jobs
    console.log("🏗️ Updating jobs table...");
    await client.query(`
      ALTER TABLE jobs 
      ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE SET NULL;
    `);
    console.log("✅ jobs updated\n");

    // Add unit_id to residents
    console.log("👥 Updating resident_profiles...");
    await client.query(`
      ALTER TABLE resident_profiles 
      ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE SET NULL;
    `);
    console.log("✅ residents updated\n");

    console.log("🎉 Done! Units table added successfully!");

  } catch (err) {
    console.error("❌ Error:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

addUnitsTable();