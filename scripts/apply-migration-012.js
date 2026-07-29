// Applies migration 012 — RBQ verification columns on entrepreneur_profiles.
// Run from project root:  node scripts/apply-migration-012.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "../src/config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqlPath = path.join(__dirname, "..", "migrations", "012_rbq_verification.sql");

(async () => {
  console.log("📄 Reading migration file:", path.basename(sqlPath));
  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log("🚀 Applying migration 012 …");
  try {
    await pool.query(sql);
    console.log("✅ Migration applied.");

    const check = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='entrepreneur_profiles'
        AND column_name LIKE 'rbq_%'
      ORDER BY column_name;
    `);
    console.log("✅ Verified columns:");
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
