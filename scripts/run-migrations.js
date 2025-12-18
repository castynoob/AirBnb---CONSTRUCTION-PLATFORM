import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

/**
 * Run all migrations to update database schema
 */

async function runMigrations() {
  const client = new Client({
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    database: process.env.PG_DB,
    ssl: process.env.PG_HOST.includes('render.com')
      ? { rejectUnauthorized: false }
      : false
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully!');
    console.log(`📍 Database: ${process.env.PG_DB} at ${process.env.PG_HOST}\n`);

    // List of migrations to run in order
    const migrations = [
      {
        name: 'Fix Missing Columns',
        file: '../migrations/fix-missing-columns.sql',
        description: 'Adds all missing columns to existing tables'
      },
      {
        name: 'Add Favorites Columns',
        file: '../migrations/add_favorites_columns.sql',
        description: 'Add job_id, bid_id, notes to favorites'
      },
      {
        name: 'Add Message Attachments',
        file: '../migrations/add_message_attachments.sql',
        description: 'Add image_url and attachments to messages'
      },
      {
        name: 'Add Supplier Request File',
        file: '../migrations/add_supplier_request_file.sql',
        description: 'Add request_file_url to supplier_requests'
      },
      {
        name: 'Inspection Updates',
        file: '../migrations/003_inspection_updates.sql',
        description: 'Add file metadata and status to inspection_reports'
      }
    ];

    console.log('🚀 Running migrations...\n');
    console.log('═'.repeat(80));

    for (const migration of migrations) {
      console.log(`\n📦 ${migration.name}`);
      console.log(`   ${migration.description}`);

      try {
        const sqlPath = join(__dirname, migration.file);
        const sql = readFileSync(sqlPath, 'utf8');

        await client.query(sql);
        console.log('   ✅ Success');
      } catch (error) {
        if (
          error.message.includes('already exists') ||
          error.message.includes('duplicate') ||
          error.message.includes('constraint') && error.message.includes('already')
        ) {
          console.log('   ⏭️  Already applied, skipping...');
        } else {
          console.error('   ❌ Error:', error.message);
          // Don't exit, continue with other migrations
        }
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('\n✅ All migrations processed!\n');

    // Verify the results
    console.log('🔍 Verifying database schema...\n');

    const tableCheck = await client.query(`
      SELECT table_name,
             (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = 'public'
              AND table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('📊 Database Tables:');
    tableCheck.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name} (${row.column_count} columns)`);
    });

    console.log('\n💡 Next Steps:');
    console.log('   1. Run: node scripts/check-database.js');
    console.log('   2. Verify all missing columns are now present');
    console.log('   3. Test your backend API endpoints');
    console.log('   4. Check application logs for any remaining errors\n');

  } catch (error) {
    console.error('\n❌ Error running migrations:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

// Run migrations
runMigrations();
