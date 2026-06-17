// =============================================================================
// apply-migration-009.js
// Applies migration 009 (admin_owner_id on properties + jobs) using the same
// DATABASE_URL the running server uses.
//
// Run from project root:
//   node scripts/apply-migration-009.js
//
// Idempotent — safe to re-run; everything is gated with IF NOT EXISTS / DROP IF EXISTS.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "../src/config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlPath = path.join(
  __dirname,
  "..",
  "migrations",
  "009_admin_owned_properties_and_jobs.sql"
);

(async () => {
  console.log("📄 Reading migration file:", path.basename(sqlPath));
  const sql = fs.readFileSync(sqlPath, "utf8");

  console.log("🚀 Applying migration 009 …");
  try {
    await pool.query(sql);
    console.log("✅ Migration applied.");

    // Verify the columns landed.
    const check = await pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'admin_owner_id'
        AND table_name IN ('properties', 'jobs')
      ORDER BY table_name;
    `);

    if (check.rows.length === 2) {
      console.log("✅ Verified columns:");
      check.rows.forEach((r) =>
        console.log(`   - ${r.table_name}.${r.column_name} (${r.data_type})`)
      );
    } else {
      console.warn(
        `⚠️  Expected 2 columns, found ${check.rows.length}. Check manually.`
      );
    }
  } catch (err) {
    console.error("❌ Migration failed:");
    console.error("  ", err.message);
    if (err.detail) console.error("  detail:", err.detail);
    if (err.hint) console.error("  hint:  ", err.hint);
    process.exitCode = 1;
  } finally {
    await pool.end();
    process.exit(process.exitCode || 0);
  }
})();
