import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';

dotenv.config();

/**
 * Database diagnostic script
 * Checks your current database and shows what tables/columns are missing
 */

async function checkDatabase() {
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

    // Required tables with their essential columns
    const requiredSchema = {
      'users': ['id', 'email', 'password', 'full_name', 'role', 'phone', 'address', 'city', 'province', 'postal_code', 'created_at', 'profile_picture'],
      'manager_profiles': ['id', 'user_id', 'company_name', 'years_experience', 'expertise_area', 'created_at'],
      'entrepreneur_profiles': ['id', 'user_id', 'company_name', 'trade', 'years_experience', 'license_number', 'insurance_provider', 'insurance_expiry', 'created_at'],
      'resident_profiles': ['id', 'user_id', 'property_ownership', 'preferred_contact', 'created_at'],
      'supplier_profiles': ['id', 'user_id', 'company_name', 'business_registration', 'business_type', 'tax_id', 'years_in_business', 'delivery_areas', 'created_at'],
      'properties': ['id', 'manager_id', 'resident_id', 'address', 'city', 'province', 'postal_code', 'property_type', 'bedrooms', 'bathrooms', 'square_footage', 'year_built', 'status', 'created_at'],
      'units': ['id', 'property_id', 'unit_number', 'floor', 'bedrooms', 'bathrooms', 'square_footage', 'occupancy_status', 'created_at'],
      'jobs': ['id', 'property_id', 'manager_id', 'title', 'description', 'location', 'category', 'severity', 'priority', 'status', 'budget_min', 'budget_max', 'deadline', 'bid_deadline', 'created_at'],
      'bids': ['id', 'job_id', 'entrepreneur_id', 'amount', 'timeline_days', 'proposal', 'status', 'submitted_at'],
      'conversations': ['id', 'participant1_id', 'participant2_id', 'last_message_at', 'created_at'],
      'messages': ['id', 'conversation_id', 'sender_id', 'message_text', 'created_at', 'read', 'image_url', 'attachments'],
      'favorites': ['id', 'manager_id', 'entrepreneur_id', 'created_at', 'job_id', 'bid_id', 'notes'],
      'reviews': ['id', 'job_id', 'reviewer_id', 'reviewee_id', 'rating', 'comment', 'created_at'],
      'inspection_reports': ['id', 'property_id', 'report_file', 'uploaded_by', 'uploaded_at', 'file_name', 'file_size', 'file_type', 'parsed_job_count', 'status'],
      'supplier_requests': ['id', 'job_id', 'supplier_id', 'manager_id', 'request_details', 'status', 'created_at', 'request_file_url'],
      'supplier_invoices': ['id', 'supplier_request_id', 'invoice_number', 'amount', 'issue_date', 'due_date', 'status', 'created_at'],
      'subscriptions': ['id', 'user_id', 'subscription_type', 'status', 'start_date', 'end_date', 'stripe_subscription_id', 'stripe_customer_id', 'created_at'],
      'refresh_tokens': ['id', 'user_id', 'token', 'expires_at', 'created_at']
    };

    console.log('📋 Checking your database schema...\n');
    console.log('═'.repeat(80));

    // Get all existing tables
    const existingTablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const existingTables = existingTablesResult.rows.map(row => row.table_name);

    let hasIssues = false;
    let missingTables = [];
    let missingColumns = {};

    // Check each required table
    for (const [tableName, requiredColumns] of Object.entries(requiredSchema)) {
      console.log(`\n📊 Table: ${tableName}`);

      if (!existingTables.includes(tableName)) {
        console.log(`  ❌ TABLE MISSING - This entire table needs to be created!`);
        missingTables.push(tableName);
        hasIssues = true;
        continue;
      }

      console.log('  ✅ Table exists');

      // Check columns in this table
      const columnsResult = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position;
      `, [tableName]);

      const existingColumns = columnsResult.rows.map(row => row.column_name);
      const tableRequired = requiredColumns;
      const missing = tableRequired.filter(col => !existingColumns.includes(col));

      if (missing.length > 0) {
        console.log(`  ⚠️  Missing columns: ${missing.join(', ')}`);
        missingColumns[tableName] = missing;
        hasIssues = true;
      } else {
        console.log(`  ✅ All essential columns present`);
      }

      // Show column details
      console.log(`  📝 Columns (${existingColumns.length} total):`);
      columnsResult.rows.forEach(col => {
        const required = tableRequired.includes(col.column_name) ? '⭐' : '  ';
        console.log(`     ${required} ${col.column_name} (${col.data_type})`);
      });
    }

    // Summary
    console.log('\n' + '═'.repeat(80));
    console.log('\n📊 DIAGNOSTIC SUMMARY\n');

    if (!hasIssues) {
      console.log('✅ Your database schema is COMPLETE!');
      console.log('🎉 All required tables and columns are present.');
      console.log('\nYour backend should work properly now.');
    } else {
      console.log('⚠️  Issues found in your database:\n');

      if (missingTables.length > 0) {
        console.log('❌ MISSING TABLES:');
        missingTables.forEach(table => {
          console.log(`   - ${table}`);
        });
        console.log();
      }

      if (Object.keys(missingColumns).length > 0) {
        console.log('⚠️  MISSING COLUMNS:');
        for (const [table, columns] of Object.entries(missingColumns)) {
          console.log(`   ${table}:`);
          columns.forEach(col => {
            console.log(`     - ${col}`);
          });
        }
        console.log();
      }

      console.log('💡 RECOMMENDED ACTIONS:\n');

      if (missingTables.length > 0) {
        console.log('1. Missing tables detected - You need to restore from backup:');
        console.log('   Option A: Import construction_platform.sql using psql');
        console.log('   Option B: Import via pgAdmin or database GUI');
        console.log('   ⚠️  WARNING: This will overwrite your current database!\n');
      }

      if (Object.keys(missingColumns).length > 0 && missingTables.length === 0) {
        console.log('1. Run migrations to add missing columns:');
        console.log('   node scripts/run-migrations.js\n');
      }
    }

    // Check for backend errors by looking at error patterns
    console.log('\n🔍 CHECKING FOR COMMON ISSUES:\n');

    // Check if important indexes exist
    const indexCheck = await client.query(`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('users', 'jobs', 'bids', 'messages', 'properties')
      ORDER BY tablename, indexname;
    `);

    console.log(`📑 Found ${indexCheck.rows.length} indexes on key tables`);

  } catch (error) {
    console.error('\n❌ Error checking database:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the diagnostic
checkDatabase();
