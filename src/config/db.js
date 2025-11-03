import pg from "pg";
import dotenv from "dotenv";

const { Pool } = pg;
dotenv.config();

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DB,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  ssl: {
    rejectUnauthorized: false, // ✅ Required for Render PostgreSQL
  },
  // Connection pool configuration
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection cannot be established
  // Query timeout
  query_timeout: 30000, // 30 seconds query timeout
});

// Test connection
pool.on("connect", () => {
  console.log("✅ Connected to PostgreSQL database");
});

// Handle connection errors gracefully without crashing the app
pool.on("error", (err) => {
  console.error("❌ Unexpected database error:", err.message);
  // Don't exit the process - let the pool handle reconnection
});

// Test initial connection
pool.query("SELECT NOW()")
  .then(() => {
    console.log("✅ Database connection verified");
  })
  .catch((err) => {
    console.error("❌ Failed to verify database connection:", err.message);
  });

export default pool;