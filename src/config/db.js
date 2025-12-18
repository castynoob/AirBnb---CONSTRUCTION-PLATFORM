import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pg;

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST, // MUST be .internal on Render
  database: process.env.PG_DB,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  query_timeout: 30000,
});

pool.on("connect", () => {
  console.log("✅ Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected database error:", err.message);
});

// Delay verification for Render startup
setTimeout(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Database connection verified");
  } catch (err) {
    console.error("❌ Failed to verify database connection:", err.message);
  }
}, 3000);

export default pool;
