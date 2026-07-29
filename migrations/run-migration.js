// ============================================
// DATABASE MIGRATION RUNNER
//
// Usage:
//   node migrations/run-migration.js 014_bid_addenda.sql
//
// Reads DATABASE_URL from .env (falls back to DB_HOST/DB_PORT/... for local
// setups). Wraps the file in a transaction so a mid-file failure rolls back.
// ============================================

import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------------------------------------------------------
// Which file to run
// -----------------------------------------------------------------------------
const arg = process.argv[2];
if (!arg) {
  console.error('❌ Usage: node migrations/run-migration.js <filename.sql>');
  console.error('   Example: node migrations/run-migration.js 014_bid_addenda.sql');
  process.exit(1);
}

const migrationPath = path.isAbsolute(arg)
  ? arg
  : path.join(__dirname, arg);

if (!fs.existsSync(migrationPath)) {
  console.error(`❌ Migration file not found: ${migrationPath}`);
  process.exit(1);
}

// -----------------------------------------------------------------------------
// Connection — prefer DATABASE_URL (Render, Heroku, etc.). If someone is on a
// local box with split env vars, fall back to those.
// -----------------------------------------------------------------------------
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      // Managed Postgres (Render, Supabase, Heroku) require TLS. Setting
      // rejectUnauthorized: false skips CA verification — fine for a one-off
      // migration run, matches how the app connects.
      ssl: { rejectUnauthorized: false },
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    };

const pool = new Pool(poolConfig);

// -----------------------------------------------------------------------------
// Run
// -----------------------------------------------------------------------------
async function runMigration() {
  const target = process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL).host
    : `${poolConfig.host}:${poolConfig.port}`;
  console.log(`🔧 Applying ${path.basename(migrationPath)}`);
  console.log(`   → ${target}\n`);

  const sql = fs.readFileSync(migrationPath, 'utf8');
  const client = await pool.connect();

  try {
    // If the file already contains BEGIN/COMMIT (migration 014 does), don't
    // wrap it again — pg refuses nested transactions. Detect and defer.
    const alreadyTransactional = /^\s*BEGIN\b/im.test(sql);

    if (!alreadyTransactional) await client.query('BEGIN');
    await client.query(sql);
    if (!alreadyTransactional) await client.query('COMMIT');

    console.log('✅ Migration completed successfully.');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* no-op */ }
    console.error('\n❌ Migration failed — rolled back.');
    console.error(err.message);
    if (err.detail) console.error('   detail:', err.detail);
    if (err.hint) console.error('   hint:  ', err.hint);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
