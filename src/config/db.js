import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  query_timeout: 30000,
});

pool.on("connect", async (client) => {
  console.log("✅ Connected to PostgreSQL database");
  // Store all timestamps in UTC. Frontend localizes for display.
  await client.query("SET timezone = 'UTC'");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected database error:", err.message);
});

// Verify connection (no timeout needed)
(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Database connection verified");
  } catch (err) {
    console.error("❌ Failed to verify database connection:", err.message);
  }
})();

export default pool;
