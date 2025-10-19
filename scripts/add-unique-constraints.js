import pg from "pg";
import dotenv from "dotenv";

const { Pool } = pg;
dotenv.config();

const pool = new Pool({
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DB,
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
});

const addUniqueConstraints = async () => {
  const client = await pool.connect();

  try {
    console.log("🚀 Adding UNIQUE constraints to profile tables...\n");

    // Check for duplicates first
    console.log("🔍 Checking for duplicate profiles...");
    
    const duplicateEntrepreneurs = await client.query(`
      SELECT user_id, COUNT(*) 
      FROM entrepreneur_profiles 
      GROUP BY user_id 
      HAVING COUNT(*) > 1
    `);

    const duplicateManagers = await client.query(`
      SELECT user_id, COUNT(*) 
      FROM manager_profiles 
      GROUP BY user_id 
      HAVING COUNT(*) > 1
    `);

    const duplicateSuppliers = await client.query(`
      SELECT user_id, COUNT(*) 
      FROM supplier_profiles 
      GROUP BY user_id 
      HAVING COUNT(*) > 1
    `);

    const duplicateResidents = await client.query(`
      SELECT user_id, COUNT(*) 
      FROM resident_profiles 
      GROUP BY user_id 
      HAVING COUNT(*) > 1
    `);

    if (duplicateEntrepreneurs.rows.length > 0) {
      console.log(`⚠️  Found ${duplicateEntrepreneurs.rows.length} users with duplicate entrepreneur profiles`);
      console.log("   These need to be cleaned up manually before adding constraint");
    }

    if (duplicateManagers.rows.length > 0) {
      console.log(`⚠️  Found ${duplicateManagers.rows.length} users with duplicate manager profiles`);
    }

    if (duplicateSuppliers.rows.length > 0) {
      console.log(`⚠️  Found ${duplicateSuppliers.rows.length} users with duplicate supplier profiles`);
    }

    if (duplicateResidents.rows.length > 0) {
      console.log(`⚠️  Found ${duplicateResidents.rows.length} users with duplicate resident profiles`);
    }

    const totalDuplicates = 
      duplicateEntrepreneurs.rows.length + 
      duplicateManagers.rows.length + 
      duplicateSuppliers.rows.length + 
      duplicateResidents.rows.length;

    if (totalDuplicates > 0) {
      console.log("\n❌ Cannot add UNIQUE constraints while duplicates exist!");
      console.log("   Clean up duplicates first, then run this script again.\n");
      return;
    }

    console.log("✅ No duplicates found\n");

    // Add UNIQUE constraints
    console.log("🔒 Adding UNIQUE constraint to entrepreneur_profiles...");
    await client.query(`
      ALTER TABLE entrepreneur_profiles 
      ADD CONSTRAINT entrepreneur_profiles_user_id_unique 
      UNIQUE (user_id);
    `);
    console.log("✅ entrepreneur_profiles.user_id is now UNIQUE\n");

    console.log("🔒 Adding UNIQUE constraint to manager_profiles...");
    await client.query(`
      ALTER TABLE manager_profiles 
      ADD CONSTRAINT manager_profiles_user_id_unique 
      UNIQUE (user_id);
    `);
    console.log("✅ manager_profiles.user_id is now UNIQUE\n");

    console.log("🔒 Adding UNIQUE constraint to supplier_profiles...");
    await client.query(`
      ALTER TABLE supplier_profiles 
      ADD CONSTRAINT supplier_profiles_user_id_unique 
      UNIQUE (user_id);
    `);
    console.log("✅ supplier_profiles.user_id is now UNIQUE\n");

    console.log("🔒 Adding UNIQUE constraint to resident_profiles...");
    await client.query(`
      ALTER TABLE resident_profiles 
      ADD CONSTRAINT resident_profiles_user_id_unique 
      UNIQUE (user_id);
    `);
    console.log("✅ resident_profiles.user_id is now UNIQUE\n");

    console.log("🎉 All UNIQUE constraints added successfully!");
    console.log("\n📋 Summary:");
    console.log("  • One user can now only have ONE entrepreneur profile");
    console.log("  • One user can now only have ONE manager profile");
    console.log("  • One user can now only have ONE supplier profile");
    console.log("  • One user can now only have ONE resident profile");
    console.log("\n✅ Database integrity improved!");

  } catch (err) {
    console.error("❌ Error adding UNIQUE constraints:", err.message);
    
    if (err.code === '23505') {
      console.log("\n💡 This error means duplicate profiles exist.");
      console.log("   Clean up duplicates manually and try again.");
    } else if (err.code === '42P07') {
      console.log("\n✅ Constraint already exists! No action needed.");
    } else {
      throw err;
    }
  } finally {
    client.release();
    await pool.end();
  }
};

addUniqueConstraints();