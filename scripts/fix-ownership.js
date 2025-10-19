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

const fixOwnership = async () => {
  const client = await pool.connect();

  try {
    console.log("🔧 Fixing table ownership...\n");

    // Drop the existing refresh_tokens table
    console.log("🗑️  Dropping old refresh_tokens table...");
    await client.query(`DROP TABLE IF EXISTS refresh_tokens CASCADE;`);
    console.log("✅ Old table dropped\n");

    // Recreate with correct owner
    console.log("🔄 Creating refresh_tokens table with correct owner...");
    await client.query(`
      CREATE TABLE refresh_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✅ Table created\n");

    // Create indexes
    console.log("⚡ Creating indexes...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    `);
    console.log("✅ Indexes created\n");

    // Verify ownership
    const ownerCheck = await client.query(`
      SELECT tableowner 
      FROM pg_tables 
      WHERE tablename = 'refresh_tokens';
    `);
    console.log("👤 Table owner:", ownerCheck.rows[0].tableowner);
    console.log("\n🎉 Ownership fixed successfully!");
  } catch (err) {
    console.error("❌ Fix failed:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
};

fixOwnership();