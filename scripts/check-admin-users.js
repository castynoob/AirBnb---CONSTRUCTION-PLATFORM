// Quick read-only inspector for the admin_users table.
// Run with: node scripts/check-admin-users.js
import pool from "../src/config/db.js";

(async () => {
  try {
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'admin_users'
      ORDER BY ordinal_position;
    `);

    console.log("\n📋 admin_users schema (live DB):");
    cols.rows.forEach((c) => {
      const def = c.column_default ? ` default ${c.column_default}` : "";
      const nul = c.is_nullable === "YES" ? "" : " NOT NULL";
      console.log(`   - ${c.column_name.padEnd(18)} ${c.data_type}${nul}${def}`);
    });

    const stats = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'inactive')::int AS inactive,
        COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended
      FROM admin_users;
    `);
    console.log("\n📊 Counts:", stats.rows[0]);

    const list = await pool.query(`
      SELECT id, email, name, role, status, last_login_at, created_at
      FROM admin_users
      ORDER BY created_at ASC
      LIMIT 50;
    `);

    if (list.rows.length === 0) {
      console.log("\n⚠️  No admin_users rows exist yet.");
      console.log("   The admin login will reject every email until you seed at least one.");
    } else {
      console.log(`\n👤 Existing admins (${list.rows.length}):`);
      list.rows.forEach((a) => {
        const last = a.last_login_at
          ? new Date(a.last_login_at).toISOString().slice(0, 19) + "Z"
          : "never";
        console.log(
          `   - ${a.email.padEnd(32)} role=${a.role.padEnd(12)} status=${a.status.padEnd(9)} last_login=${last}`
        );
      });
    }

    // Roles breakdown
    const roles = await pool.query(`
      SELECT role, COUNT(*)::int AS n FROM admin_users GROUP BY role ORDER BY n DESC;
    `);
    console.log("\n🔑 Role distribution:");
    roles.rows.forEach((r) => console.log(`   - ${r.role}: ${r.n}`));
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
    process.exit(process.exitCode || 0);
  }
})();
