// Applies migration 011 — admin_user_id on notifications.
// Run from project root:  node scripts/apply-migration-011.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "../src/config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlPath = path.join(__dirname, "..", "migrations", "011_admin_notifications.sql");

(async () => {
  console.log("📄 Reading migration file:", path.basename(sqlPath));
  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log("🚀 Applying migration 011 …");

  try {
    await pool.query(sql);
    console.log("✅ Migration applied.");

    const check = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='notifications'
        AND column_name IN ('user_id','admin_user_id')
      ORDER BY column_name;
    `);
    console.log("✅ Verified columns:");
    check.rows.forEach(r =>
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
