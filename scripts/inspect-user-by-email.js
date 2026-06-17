// Inspect what roles a given email has on the platform.
// Usage: node scripts/inspect-user-by-email.js <email>
import pool from "../src/config/db.js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/inspect-user-by-email.js <email>");
  process.exit(1);
}

(async () => {
  try {
    const { rows: users } = await pool.query(
      `SELECT id, email, role, first_name, last_name, phone, address, city,
              province, postal_code, country, email_verified, provider,
              created_at
       FROM users
       WHERE LOWER(email) = LOWER($1)
       ORDER BY created_at ASC`,
      [email]
    );

    if (users.length === 0) {
      console.log(`(no rows in 'users' for ${email})`);
    } else {
      console.log(`Found ${users.length} user row(s) for ${email}:\n`);
      users.forEach((u, i) => {
        console.log(`  [${i}] role=${u.role}  id=${u.id}`);
        console.log(`       name="${u.first_name} ${u.last_name}"  phone=${u.phone || "—"}`);
        console.log(`       addr="${u.address || "—"}, ${u.city || "—"}, ${u.province || "—"}, ${u.postal_code || "—"}, ${u.country || "—"}"`);
        console.log(`       verified=${u.email_verified}  provider=${u.provider}  created=${u.created_at.toISOString()}\n`);
      });
    }

    const { rows: adminRows } = await pool.query(
      `SELECT id, email, name, role, status, created_at
       FROM admin_users
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    if (adminRows.length > 0) {
      console.log(`Also has admin_users row(s):`);
      adminRows.forEach((a) => {
        console.log(`  admin_id=${a.id}  role=${a.role}  status=${a.status}  name="${a.name}"`);
      });
    }
  } catch (e) {
    console.error("inspect failed:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
