/**
 * Debug Messaging Permissions
 * Checks database state to diagnose messaging authorization issues
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DB,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  ssl: process.env.PG_HOST.includes('render.com') ? { rejectUnauthorized: false } : false
});

async function checkDatabase() {
  console.log('\n🔍 DEBUGGING MESSAGING PERMISSIONS\n');
  console.log('='.repeat(80));

  try {
    // 1. Check test users
    console.log('\n📊 TEST USERS IN DATABASE:');
    console.log('─'.repeat(80));

    const usersResult = await pool.query(`
      SELECT id, email, role, first_name, last_name, email_verified
      FROM users
      WHERE email LIKE '%@test.com'
      ORDER BY role, email
    `);

    if (usersResult.rows.length === 0) {
      console.log('❌ NO TEST USERS FOUND!');
      console.log('   Run: node scripts/seed-messaging-test-data.js');
      await pool.end();
      return;
    }

    const usersByRole = {};
    usersResult.rows.forEach(user => {
      if (!usersByRole[user.role]) usersByRole[user.role] = [];
      usersByRole[user.role].push(user);
      console.log(`${user.email.padEnd(30)} | ${user.role.padEnd(20)} | Verified: ${user.email_verified ? '✅' : '❌'} | ID: ${user.id}`);
    });

    // 2. Check entrepreneur profiles
    console.log('\n📋 ENTREPRENEUR PROFILES:');
    console.log('─'.repeat(80));

    const entrepreneursResult = await pool.query(`
      SELECT ep.id as profile_id, ep.user_id, u.email, u.first_name, u.last_name
      FROM entrepreneur_profiles ep
      JOIN users u ON ep.user_id = u.id
      WHERE u.email LIKE '%@test.com'
    `);

    if (entrepreneursResult.rows.length === 0) {
      console.log('❌ NO ENTREPRENEUR PROFILES FOUND!');
    } else {
      entrepreneursResult.rows.forEach(row => {
        console.log(`Profile ID: ${row.profile_id}`);
        console.log(`User ID:    ${row.user_id}`);
        console.log(`Email:      ${row.email}`);
        console.log('');
      });
    }

    // 3. Check manager profiles
    console.log('\n🏢 MANAGER PROFILES:');
    console.log('─'.repeat(80));

    const managersResult = await pool.query(`
      SELECT mp.id as profile_id, mp.user_id, u.email, u.first_name, u.last_name
      FROM manager_profiles mp
      JOIN users u ON mp.user_id = u.id
      WHERE u.email LIKE '%@test.com'
    `);

    if (managersResult.rows.length === 0) {
      console.log('❌ NO MANAGER PROFILES FOUND!');
    } else {
      managersResult.rows.forEach(row => {
        console.log(`Profile ID: ${row.profile_id}`);
        console.log(`User ID:    ${row.user_id}`);
        console.log(`Email:      ${row.email}`);
        console.log('');
      });
    }

    // 4. Check jobs
    console.log('\n💼 JOBS:');
    console.log('─'.repeat(80));

    const jobsResult = await pool.query(`
      SELECT j.id, j.title, j.status, mp.user_id as manager_user_id, u.email as manager_email
      FROM jobs j
      JOIN manager_profiles mp ON j.manager_id = mp.id
      JOIN users u ON mp.user_id = u.id
      WHERE u.email LIKE '%@test.com'
    `);

    if (jobsResult.rows.length === 0) {
      console.log('❌ NO JOBS FOUND!');
    } else {
      jobsResult.rows.forEach(row => {
        console.log(`Job: ${row.title} (${row.status})`);
        console.log(`  Manager: ${row.manager_email} (user_id: ${row.manager_user_id})`);
        console.log(`  Job ID: ${row.id}`);
        console.log('');
      });
    }

    // 5. Check bids (THE CRITICAL PART)
    console.log('\n✅ BIDS (CRITICAL FOR MESSAGING):');
    console.log('─'.repeat(80));

    const bidsResult = await pool.query(`
      SELECT
        b.id as bid_id,
        b.status,
        ep.id as entrepreneur_profile_id,
        ep.user_id as entrepreneur_user_id,
        eu.email as entrepreneur_email,
        j.id as job_id,
        j.title as job_title,
        mp.id as manager_profile_id,
        mp.user_id as manager_user_id,
        mu.email as manager_email
      FROM bids b
      JOIN entrepreneur_profiles ep ON b.entrepreneur_id = ep.id
      JOIN users eu ON ep.user_id = eu.id
      JOIN jobs j ON b.job_id = j.id
      JOIN manager_profiles mp ON j.manager_id = mp.id
      JOIN users mu ON mp.user_id = mu.id
      WHERE eu.email LIKE '%@test.com' OR mu.email LIKE '%@test.com'
      ORDER BY b.status, b.created_at DESC
    `);

    if (bidsResult.rows.length === 0) {
      console.log('❌ NO BIDS FOUND!');
      console.log('\n💡 SOLUTION: Create a job and have entrepreneur bid on it, then approve the bid.');
    } else {
      bidsResult.rows.forEach(row => {
        console.log(`${row.status === 'approved' ? '✅' : '❌'} BID ${row.status.toUpperCase()}`);
        console.log(`  Entrepreneur: ${row.entrepreneur_email} (user_id: ${row.entrepreneur_user_id})`);
        console.log(`  Manager:      ${row.manager_email} (user_id: ${row.manager_user_id})`);
        console.log(`  Job:          ${row.job_title}`);
        console.log(`  Bid ID:       ${row.bid_id}`);
        console.log('');
      });

      // Count approved bids
      const approvedCount = bidsResult.rows.filter(b => b.status === 'approved').length;
      console.log(`\n📊 Summary: ${approvedCount} approved bid(s), ${bidsResult.rows.length - approvedCount} other status`);
    }

    // 6. Test the actual query used by canUserMessage
    console.log('\n🔬 TESTING ACTUAL AUTHORIZATION QUERY:');
    console.log('─'.repeat(80));

    const entrepreneurs = entrepreneursResult.rows;
    const managers = managersResult.rows;

    if (entrepreneurs.length > 0 && managers.length > 0) {
      const testEntrepreneur = entrepreneurs[0];
      const testManager = managers[0];

      console.log(`\nTesting: ${testEntrepreneur.email} → ${testManager.email}`);
      console.log(`Entrepreneur user_id: ${testEntrepreneur.user_id}`);
      console.log(`Manager user_id:      ${testManager.user_id}`);

      const authQuery = `
        SELECT b.id, b.status, j.title
        FROM bids b
        JOIN entrepreneur_profiles ep ON b.entrepreneur_id = ep.id
        JOIN jobs j ON b.job_id = j.id
        JOIN manager_profiles mp ON j.manager_id = mp.id
        WHERE ep.user_id = $1
        AND mp.user_id = $2
        AND b.status = 'approved'
        LIMIT 1
      `;

      const authResult = await pool.query(authQuery, [testEntrepreneur.user_id, testManager.user_id]);

      console.log(`\nQuery result: ${authResult.rows.length > 0 ? '✅ AUTHORIZED' : '❌ NOT AUTHORIZED'}`);

      if (authResult.rows.length > 0) {
        console.log(`Found approved bid on job: "${authResult.rows[0].title}"`);
        console.log(`\n✅ These users CAN message each other!`);
      } else {
        console.log(`\n❌ No approved bid found between these users.`);
        console.log(`\n💡 SOLUTION:`);
        console.log(`   1. Create a job as manager: ${testManager.email}`);
        console.log(`   2. Submit a bid as entrepreneur: ${testEntrepreneur.email}`);
        console.log(`   3. Approve the bid as manager`);
        console.log(`   4. Then messaging will work!`);
      }
    }

    // 7. Check conversations
    console.log('\n\n💬 EXISTING CONVERSATIONS:');
    console.log('─'.repeat(80));

    const convoResult = await pool.query(`
      SELECT
        c.id,
        u1.email as participant1_email,
        u2.email as participant2_email,
        c.last_message_at,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
      FROM conversations c
      JOIN users u1 ON c.participant1_id = u1.id
      JOIN users u2 ON c.participant2_id = u2.id
      WHERE u1.email LIKE '%@test.com' OR u2.email LIKE '%@test.com'
      ORDER BY c.last_message_at DESC
    `);

    if (convoResult.rows.length === 0) {
      console.log('❌ NO CONVERSATIONS FOUND!');
    } else {
      convoResult.rows.forEach(row => {
        console.log(`${row.participant1_email} ↔ ${row.participant2_email}`);
        console.log(`  Messages: ${row.message_count}`);
        console.log(`  Last activity: ${row.last_message_at}`);
        console.log(`  Conversation ID: ${row.id}`);
        console.log('');
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Diagnostic complete!\n');

  } catch (error) {
    console.error('\n❌ Error during diagnostic:', error);
  } finally {
    await pool.end();
  }
}

checkDatabase();
