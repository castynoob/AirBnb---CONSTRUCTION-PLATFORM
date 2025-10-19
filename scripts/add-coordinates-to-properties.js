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

const addCoordinates = async () => {
  const client = await pool.connect();

  try {
    console.log("🗺️  Adding coordinates to properties table...\n");

    // Add latitude and longitude columns
    console.log("📍 Adding latitude column...");
    await client.query(`
      ALTER TABLE properties 
      ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);
    `);
    console.log("✅ Latitude column added\n");

    console.log("📍 Adding longitude column...");
    await client.query(`
      ALTER TABLE properties 
      ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
    `);
    console.log("✅ Longitude column added\n");

    // Add index for geospatial queries (performance boost!)
    console.log("⚡ Creating geospatial index...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_properties_coordinates 
      ON properties(latitude, longitude);
    `);
    console.log("✅ Index created\n");

    // (Optional) Add PostGIS geography column for advanced queries
    console.log("🌍 Checking if PostGIS is available...");
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
      console.log("✅ PostGIS extension enabled");
      
      await client.query(`
        ALTER TABLE properties 
        ADD COLUMN IF NOT EXISTS location geography(POINT, 4326);
      `);
      console.log("✅ PostGIS location column added");
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_properties_location 
        ON properties USING GIST(location);
      `);
      console.log("✅ PostGIS GIST index created\n");
    } catch (err) {
      console.log("⚠️  PostGIS not available (optional feature)");
      console.log("   You can still use lat/lng for basic distance calculations\n");
    }

    console.log("🎉 Migration completed successfully!");
    console.log("\n📋 Summary:");
    console.log("  • Added latitude column (DECIMAL 10,8)");
    console.log("  • Added longitude column (DECIMAL 11,8)");
    console.log("  • Created geospatial index");
    console.log("  • PostGIS geography column (if available)");
    console.log("\n✅ Properties table now supports coordinates!");
    console.log("\n💡 Next steps:");
    console.log("  1. Update existing properties with coordinates");
    console.log("  2. Include lat/lng in property creation");
    console.log("  3. Use for map-based job search");

  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

addCoordinates();