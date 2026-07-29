// Applies migration 013 — condo_control_email column on properties.
// Run from project root:  node scripts/apply-migration-013.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "../src/config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqlPath = path.join(__dirname, "..", "migrations", "013_condo_control_broadcast.sql");

(async () => {
  console.log("📄 Reading migration file:", path.basename(sqlPath));
  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log("🚀 Applying migration 013 …");
  try {
    await pool.query(sql);
    console.log("✅ Migration applied.");

    const check = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='properties'
        AND column_name = 'condo_control_email';
    `);
    console.log("✅ Verified column:");
    check.rows.forEach((r) =>
      console.log(`   - ${r.column_name} (${r.data_type}, nullable=${r.is_nullable})`)
    );
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    if (err.detail) console.error("  detail:", err.detail);
    process.exitCode = 1;
  } finally {
    await pool.end();
    process.exit(process.exitCode || 0);
  }
})();
