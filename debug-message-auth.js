import pool from './src/config/db.js';

async function debugMessageAuth(entrepreneurUserId, managerUserId) {
  try {
    console.log('\n🔍 Debugging Message Authorization');
    console.log('=====================================');
    console.log(`Entrepreneur User ID: ${entrepreneurUserId}`);
    console.log(`Manager User ID: ${managerUserId}\n`);

    // 1. Check users exist and their roles
    const userQuery = `
      SELECT id, role, first_name, last_name FROM users WHERE id IN ($1, $2)
    `;
    const userResult = await pool.query(userQuery, [entrepreneurUserId, managerUserId]);

    console.log('👤 Users:');
    userResult.rows.forEach(u => {
      console.log(`   - ${u.first_name} ${u.last_name} (ID: ${u.id}, Role: ${u.role})`);
    });

    // 2. Get entrepreneur profile ID
    const entProfileQuery = `
      SELECT id, user_id FROM entrepreneur_profiles WHERE user_id = $1
    `;
    const entProfileResult = await pool.query(entProfileQuery, [entrepreneurUserId]);

    console.log('\n👨‍💼 Entrepreneur Profile:');
    if (entProfileResult.rows.length > 0) {
      console.log(`   Profile ID: ${entProfileResult.rows[0].id}`);
      console.log(`   User ID: ${entProfileResult.rows[0].user_id}`);
    } else {
      console.log('   ❌ No entrepreneur profile found!');
    }

    // 3. Get manager profile ID
    const mgrProfileQuery = `
      SELECT id, user_id FROM manager_profiles WHERE user_id = $1
    `;
    const mgrProfileResult = await pool.query(mgrProfileQuery, [managerUserId]);

    console.log('\n👔 Manager Profile:');
    if (mgrProfileResult.rows.length > 0) {
      console.log(`   Profile ID: ${mgrProfileResult.rows[0].id}`);
      console.log(`   User ID: ${mgrProfileResult.rows[0].user_id}`);
    } else {
      console.log('   ❌ No manager profile found!');
    }

    // 4. Check jobs created by the manager
    if (mgrProfileResult.rows.length > 0) {
      const jobQuery = `
        SELECT id, title, manager_id FROM jobs WHERE manager_id = $1
      `;
      const jobResult = await pool.query(jobQuery, [mgrProfileResult.rows[0].id]);

      console.log('\n📋 Jobs created by Manager:');
      jobResult.rows.forEach(job => {
        console.log(`   - Job ID: ${job.id}, Title: ${job.title}`);
      });
    }

    // 5. Check bids from entrepreneur
    if (entProfileResult.rows.length > 0) {
      const bidQuery = `
        SELECT b.id, b.job_id, b.entrepreneur_id, b.status, j.title
        FROM bids b
        JOIN jobs j ON b.job_id = j.id
        WHERE b.entrepreneur_id = $1
      `;
      const bidResult = await pool.query(bidQuery, [entProfileResult.rows[0].id]);

      console.log('\n💰 Bids from Entrepreneur:');
      if (bidResult.rows.length > 0) {
        bidResult.rows.forEach(bid => {
          console.log(`   - Bid ID: ${bid.id}, Job: "${bid.title}", Status: ${bid.status}`);
        });
      } else {
        console.log('   ❌ No bids found!');
      }
    }

    // 6. Check the actual authorization query (the one that's failing)
    if (entProfileResult.rows.length > 0 && mgrProfileResult.rows.length > 0) {
      const authQuery = `
        SELECT b.id, b.status, j.title, ep.user_id as entrepreneur_user, mp.user_id as manager_user
        FROM bids b
        JOIN entrepreneur_profiles ep ON b.entrepreneur_id = ep.id
        JOIN jobs j ON b.job_id = j.id
        JOIN manager_profiles mp ON j.manager_id = mp.id
        WHERE ep.user_id = $1
        AND mp.user_id = $2
        AND b.status = 'approved'
      `;

      const authResult = await pool.query(authQuery, [entrepreneurUserId, managerUserId]);

      console.log('\n🔐 Authorization Check (Current Query):');
      if (authResult.rows.length > 0) {
        console.log('   ✅ AUTHORIZED - Found approved bid(s):');
        authResult.rows.forEach(bid => {
          console.log(`      - Bid ID: ${bid.id}, Job: "${bid.title}", Status: ${bid.status}`);
        });
      } else {
        console.log('   ❌ NOT AUTHORIZED - No approved bids found with this query');

        // Try without status filter to see what's there
        const debugQuery = `
          SELECT b.id, b.status, j.title, ep.user_id as entrepreneur_user, mp.user_id as manager_user
          FROM bids b
          JOIN entrepreneur_profiles ep ON b.entrepreneur_id = ep.id
          JOIN jobs j ON b.job_id = j.id
          JOIN manager_profiles mp ON j.manager_id = mp.id
          WHERE ep.user_id = $1
          AND mp.user_id = $2
        `;

        const debugResult = await pool.query(debugQuery, [entrepreneurUserId, managerUserId]);

        if (debugResult.rows.length > 0) {
          console.log('\n   📊 Found bids (any status):');
          debugResult.rows.forEach(bid => {
            console.log(`      - Bid ID: ${bid.id}, Job: "${bid.title}", Status: ${bid.status}`);
          });
        }
      }
    }

    console.log('\n=====================================\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

// Get user IDs from command line arguments (UUIDs)
const entrepreneurUserId = process.argv[2];
const managerUserId = process.argv[3];

if (!entrepreneurUserId || !managerUserId) {
  console.log('Usage: node debug-message-auth.js <entrepreneur_user_id> <manager_user_id>');
  console.log('Example: node debug-message-auth.js "6e0bc99c-278e-49fc-85fa-ae3b070e97b0" "1c763dfe-0af8-4391-8175-a5bc92e5d05"');
  process.exit(1);
}

debugMessageAuth(entrepreneurUserId, managerUserId);
