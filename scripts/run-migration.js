import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const { Pool } = pg;

async function runMigration() {
  const pool = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DB,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    console.log('🔄 Connecting to database...');
    const client = await pool.connect();

    console.log('📄 Reading migration file...');
    const migrationPath = path.join(__dirname, '..', 'migrations', 'add_message_attachments.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('🚀 Running migration...');
    await client.query(sql);

    console.log('✅ Migration completed successfully!');

    // Verify the columns were added
    console.log('\n📋 Verifying columns...');
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'messages'
      AND column_name IN ('image_url', 'attachments')
      ORDER BY column_name;
    `);

    if (result.rows.length > 0) {
      console.log('✅ Columns added successfully:');
      result.rows.forEach(row => {
        console.log(`   - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
      });
    } else {
      console.log('⚠️  Warning: Columns not found in verification query');
    }

    client.release();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
