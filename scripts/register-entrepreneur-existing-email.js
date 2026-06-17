// =============================================================================
// One-shot: register an existing email as an entrepreneur role.
//
// Mirrors src/controllers/registrationController.js → registerEntrepreneur:
//   - if a users row already exists for this email under any role, reuse its
//     password and email_verified status (multi-role accounts share creds)
//   - insert new users row with role='entrepreneur'
//   - insert entrepreneur_profiles row
//
// Usage:
//   node scripts/register-entrepreneur-existing-email.js <email>
//
// Hardcoded entrepreneur details below are dev-data placeholders confirmed
// by the operator. Edit and re-run if you want different values.
// =============================================================================

import pool from "../src/config/db.js";

const EMAIL = process.argv[2];
if (!EMAIL) {
  console.error("Usage: node scripts/register-entrepreneur-existing-email.js <email>");
  process.exit(1);
}

// Confirmed by operator.
const COMPANY_NAME    = "Audebert Construction";
const LICENSE_NUMBER  = "RBQ-1234-5678-90";
const SPECIALIZATIONS = ["General Repair", "Carpentry", "Plumbing", "Electrical"];
const YEARS_IN_BUSINESS = 5;
const NUM_EMPLOYEES     = 3;

(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Block if an entrepreneur row already exists for this email.
    const existingEnt = await client.query(
      `SELECT id FROM users
       WHERE LOWER(email) = LOWER($1) AND role = 'entrepreneur'`,
      [EMAIL]
    );
    if (existingEnt.rows.length > 0) {
      console.log(`⚠️  ${EMAIL} already has an entrepreneur account (id=${existingEnt.rows[0].id}). Nothing to do.`);
      await client.query("ROLLBACK");
      return;
    }

    // 2) Pull any existing users row to copy personal info + sync password.
    const existing = await client.query(
      `SELECT first_name, last_name, phone, address, city, province,
              postal_code, country, password, email_verified, provider
       FROM users
       WHERE LOWER(email) = LOWER($1)
       ORDER BY created_at ASC
       LIMIT 1`,
      [EMAIL]
    );
    if (existing.rows.length === 0) {
      throw new Error(
        `No existing users row for ${EMAIL}. This script is meant for adding a role to an email that already has another role.`
      );
    }
    const src = existing.rows[0];

    // 3) Insert the entrepreneur users row. Copy personal info, share password,
    //    skip verification token (existing account is already verified).
    const newUser = await client.query(
      `INSERT INTO users (
         email, password, first_name, last_name, role, provider, provider_id,
         email_verified, phone, address, city, province, postal_code, country,
         terms_accepted, terms_accepted_at
       )
       VALUES (
         $1, $2, $3, $4, 'entrepreneur', $5, NULL,
         $6, $7, $8, $9, $10, $11, $12,
         TRUE, now()
       )
       RETURNING id, email, role, first_name, last_name`,
      [
        EMAIL,
        src.password,
        src.first_name,
        src.last_name,
        src.provider || "local",
        !!src.email_verified,
        src.phone,
        src.address,
        src.city,
        src.province,
        src.postal_code,
        src.country,
      ]
    );
    const userId = newUser.rows[0].id;
    console.log(`✅ Inserted users row: id=${userId} role=entrepreneur`);

    // 4) Insert the entrepreneur_profiles row.
    const newProfile = await client.query(
      `INSERT INTO entrepreneur_profiles (
         user_id, company_name, license_number, years_in_business,
         num_employees, address, specializations, subscription_plan
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'none')
       RETURNING id, company_name, license_number, specializations`,
      [
        userId,
        COMPANY_NAME,
        LICENSE_NUMBER,
        YEARS_IN_BUSINESS,
        NUM_EMPLOYEES,
        src.address,
        SPECIALIZATIONS,
      ]
    );
    console.log(`✅ Inserted entrepreneur_profiles row: id=${newProfile.rows[0].id}`);
    console.log(`   company="${newProfile.rows[0].company_name}"  license="${newProfile.rows[0].license_number}"`);
    console.log(`   specializations=${JSON.stringify(newProfile.rows[0].specializations)}`);

    await client.query("COMMIT");
    console.log(`\n🎉 ${EMAIL} can now log in as 'entrepreneur' with the same password as their PM/admin accounts.`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ Failed:", e.message);
    if (e.detail) console.error("   detail:", e.detail);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
