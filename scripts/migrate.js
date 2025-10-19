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

const runMigration = async () => {
  const client = await pool.connect();

  try {
    console.log("🚀 Starting migration...");
    console.log(`📊 Database: ${process.env.PG_DB}`);
    console.log(`🖥️  Host: ${process.env.PG_HOST}:${process.env.PG_PORT}\n`);

    // Add email verification columns
    console.log("📧 Adding email verification columns...");
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP;
    `);
    console.log("✅ Email verification columns added\n");

    // Add password reset columns
    console.log("🔐 Adding password reset columns...");
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;
    `);
    console.log("✅ Password reset columns added\n");

    // Create refresh tokens table
    console.log("🔄 Creating refresh_tokens table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✅ refresh_tokens table created\n");

    // Add indexes
    console.log("⚡ Creating indexes...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    `);
    console.log("✅ Indexes created\n");

    console.log("🎉 Migration completed successfully!");
    console.log("\n📋 Summary:");
    console.log("  • Added 5 columns to users table");
    console.log("  • Created refresh_tokens table");
    console.log("  • Created 5 indexes for performance");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    console.error("\n💡 Troubleshooting:");
    console.error("  1. Make sure PostgreSQL is running");
    console.error("  2. Verify your .env file has correct credentials");
    console.error("  3. Check if database 'construction_platform' exists");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

runMigration();