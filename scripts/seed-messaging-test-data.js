/**
 * Seed Data Script for Socket.IO Messaging Testing
 *
 * Creates test users with the correct relationships to enable messaging:
 * - Property Managers <-> Residents (always allowed)
 * - Residents <-> Residents (always allowed)
 * - Entrepreneurs <-> Suppliers (always allowed)
 * - Entrepreneurs <-> Property Managers (only with approved bids)
 *
 * Run: node scripts/seed-messaging-test-data.js
 */

import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcryptjs';
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

// Test users credentials (easy to remember!)
const testUsers = [
  // Property Managers
  {
    email: 'manager1@test.com',
    password: 'password123',
    firstName: 'Sarah',
    lastName: 'Johnson',
    role: 'property_manager',
    profile: {
      company_name: 'Johnson Property Management',
      address: '123 Manager St, Test City'
    }
  },
  {
    email: 'manager2@test.com',
    password: 'password123',
    firstName: 'Mike',
    lastName: 'Davis',
    role: 'property_manager',
    profile: {
      company_name: 'Davis Properties Inc',
      address: '456 Property Ave, Test City'
    }
  },

  // Entrepreneurs
  {
    email: 'entrepreneur1@test.com',
    password: 'password123',
    firstName: 'Alex',
    lastName: 'Martinez',
    role: 'entrepreneur',
    profile: {
      company_name: 'Martinez Construction',
      license_number: 'LIC-TEST-001',
      years_in_business: 8,
      num_employees: 15,
      address: '789 Builder Blvd, Test City',
      specializations: ['Roofing', 'Plumbing', 'General Construction']
    }
  },
  {
    email: 'entrepreneur2@test.com',
    password: 'password123',
    firstName: 'Jamie',
    lastName: 'Lee',
    role: 'entrepreneur',
    profile: {
      company_name: 'Lee Electrical Services',
      license_number: 'LIC-TEST-002',
      years_in_business: 5,
      num_employees: 8,
      address: '321 Electric Way, Test City',
      specializations: ['Electrical', 'HVAC']
    }
  },

  // Residents
  {
    email: 'resident1@test.com',
    password: 'password123',
    firstName: 'Emma',
    lastName: 'Wilson',
    role: 'resident',
    profile: {
      address: 'Unit 101, Sunset Apartments'
    }
  },
  {
    email: 'resident2@test.com',
    password: 'password123',
    firstName: 'Chris',
    lastName: 'Taylor',
    role: 'resident',
    profile: {
      address: 'Unit 205, Sunset Apartments'
    }
  },
  {
    email: 'resident3@test.com',
    password: 'password123',
    firstName: 'Jordan',
    lastName: 'Smith',
    role: 'resident',
    profile: {
      address: 'Unit 302, Maple Tower'
    }
  },

  // Suppliers
  {
    email: 'supplier1@test.com',
    password: 'password123',
    firstName: 'Morgan',
    lastName: 'Brown',
    role: 'supplier',
    profile: {
      company_name: 'Brown Building Supplies',
      address: '555 Supply Lane, Test City'
    }
  },
  {
    email: 'supplier2@test.com',
    password: 'password123',
    firstName: 'Casey',
    lastName: 'Garcia',
    role: 'supplier',
    profile: {
      company_name: 'Garcia Hardware & Tools',
      address: '777 Tool Street, Test City'
    }
  }
];

async function clearOldTestData() {
  console.log('\n🧹 Clearing old test data...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete in order of dependencies
    await client.query(`DELETE FROM messages WHERE sender_id IN (SELECT id FROM users WHERE email LIKE '%@test.com')`);
    await client.query(`DELETE FROM conversations WHERE participant1_id IN (SELECT id FROM users WHERE email LIKE '%@test.com')`);
    await client.query(`DELETE FROM bids WHERE entrepreneur_id IN (SELECT id FROM entrepreneur_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com'))`);
    await client.query(`DELETE FROM jobs WHERE manager_id IN (SELECT id FROM manager_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com'))`);
    await client.query(`DELETE FROM properties WHERE manager_id IN (SELECT id FROM manager_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com'))`);
    await client.query(`DELETE FROM entrepreneur_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com')`);
    await client.query(`DELETE FROM manager_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com')`);
    await client.query(`DELETE FROM users WHERE email LIKE '%@test.com'`);

    await client.query('COMMIT');
    console.log('✓ Old test data cleared');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error clearing data:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function createTestUsers() {
  console.log('\n👥 Creating test users...');

  const createdUsers = [];

  for (const userData of testUsers) {
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const userResult = await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, role, email_verified, created_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW())
       RETURNING *`,
      [userData.email, hashedPassword, userData.firstName, userData.lastName, userData.role]
    );

    const user = userResult.rows[0];
    createdUsers.push({ ...user, rawPassword: userData.password, profileData: userData.profile });

    // Create role-specific profile
    if (userData.role === 'property_manager') {
      await pool.query(
        `INSERT INTO manager_profiles (user_id, company_name, address, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [user.id, userData.profile.company_name, userData.profile.address]
      );
    } else if (userData.role === 'entrepreneur') {
      await pool.query(
        `INSERT INTO entrepreneur_profiles (
          user_id, company_name, license_number, years_in_business,
          num_employees, address, specializations, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          user.id,
          userData.profile.company_name,
          userData.profile.license_number,
          userData.profile.years_in_business,
          userData.profile.num_employees,
          userData.profile.address,
          userData.profile.specializations
        ]
      );
    }

    console.log(`✓ Created ${userData.role}: ${userData.email}`);
  }

  return createdUsers;
}

async function createPropertiesAndJobs(users) {
  console.log('\n🏢 Creating properties and jobs...');

  const managers = users.filter(u => u.role === 'property_manager');
  const properties = [];
  const jobs = [];

  for (const manager of managers) {
    // Get manager profile ID
    const managerProfileResult = await pool.query(
      'SELECT id FROM manager_profiles WHERE user_id = $1',
      [manager.id]
    );
    const managerProfileId = managerProfileResult.rows[0].id;

    // Create property
    const propertyResult = await pool.query(
      `INSERT INTO properties (
        manager_id, address, city, province, postal_code,
        num_units, building_type, building_name, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *`,
      [
        managerProfileId,
        `${manager.first_name}'s Test Property`,
        'Test City',
        'Test Province',
        'T3ST 123',
        10,
        'Apartment',
        `${manager.first_name} Tower`
      ]
    );

    const property = propertyResult.rows[0];
    properties.push(property);
    console.log(`✓ Created property for ${manager.email}`);

    // Create 2 jobs per property
    for (let i = 1; i <= 2; i++) {
      const jobResult = await pool.query(
        `INSERT INTO jobs (
          property_id, manager_id, title, description, category,
          urgency, due_date, budget_min, budget_max,
          estimated_duration_days, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        RETURNING *`,
        [
          property.id,
          managerProfileId,
          `Test Job ${i} - ${manager.first_name}`,
          `This is a test job for messaging system testing`,
          i === 1 ? 'Plumbing' : 'Electrical',
          'Urgent (Current Year)',
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          1000,
          3000,
          7,
          'Open'
        ]
      );

      jobs.push(jobResult.rows[0]);
    }
    console.log(`✓ Created 2 jobs for property`);
  }

  return { properties, jobs };
}

async function createApprovedBids(users, jobs) {
  console.log('\n✅ Creating approved bids (to enable Entrepreneur ↔ Manager messaging)...');

  const entrepreneurs = users.filter(u => u.role === 'entrepreneur');
  const bids = [];

  for (let i = 0; i < entrepreneurs.length && i < jobs.length; i++) {
    const entrepreneur = entrepreneurs[i];
    const job = jobs[i];

    // Get entrepreneur profile ID
    const entrepreneurProfileResult = await pool.query(
      'SELECT id FROM entrepreneur_profiles WHERE user_id = $1',
      [entrepreneur.id]
    );
    const entrepreneurProfileId = entrepreneurProfileResult.rows[0].id;

    // Create approved bid
    const bidResult = await pool.query(
      `INSERT INTO bids (
        job_id, entrepreneur_id, amount, message, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *`,
      [
        job.id,
        entrepreneurProfileId,
        2000,
        'Test bid for messaging system',
        'approved'  // IMPORTANT: Must be 'approved' to enable messaging
      ]
    );

    bids.push(bidResult.rows[0]);
    console.log(`✓ Created approved bid: ${entrepreneur.email} ↔ Job ${job.id}`);
  }

  return bids;
}

async function createSampleConversations(users) {
  console.log('\n💬 Creating sample conversations with messages...');

  const manager1 = users.find(u => u.email === 'manager1@test.com');
  const resident1 = users.find(u => u.email === 'resident1@test.com');
  const resident2 = users.find(u => u.email === 'resident2@test.com');
  const entrepreneur1 = users.find(u => u.email === 'entrepreneur1@test.com');
  const supplier1 = users.find(u => u.email === 'supplier1@test.com');

  const sampleMessages = [
    // Manager ↔ Resident conversation
    {
      participant1: manager1,
      participant2: resident1,
      messages: [
        { sender: manager1, content: 'Hi! I received your maintenance request. How can I help?' },
        { sender: resident1, content: 'Hello! My kitchen sink is leaking. Can you send someone to fix it?' },
        { sender: manager1, content: 'Of course! I\'ll schedule a plumber for tomorrow morning. Will you be home?' },
        { sender: resident1, content: 'Yes, I\'ll be home between 9 AM and 12 PM. Thank you!' }
      ]
    },

    // Resident ↔ Resident conversation
    {
      participant1: resident1,
      participant2: resident2,
      messages: [
        { sender: resident1, content: 'Hey neighbor! Are you going to the community meeting tonight?' },
        { sender: resident2, content: 'Hi! Yes, I\'ll be there. Should we carpool?' },
        { sender: resident1, content: 'Great idea! I\'ll pick you up at 6:30 PM?' },
        { sender: resident2, content: 'Perfect! See you then 👍' }
      ]
    },

    // Entrepreneur ↔ Supplier conversation
    {
      participant1: entrepreneur1,
      participant2: supplier1,
      messages: [
        { sender: entrepreneur1, content: 'Hi! Do you have copper pipes in stock? I need about 50 feet.' },
        { sender: supplier1, content: 'Hello! Yes, we have plenty. When do you need them?' },
        { sender: entrepreneur1, content: 'I can pick them up tomorrow afternoon. What\'s the price?' },
        { sender: supplier1, content: '$3.50 per foot. I\'ll set it aside for you!' }
      ]
    }
  ];

  for (const convoData of sampleMessages) {
    // Create conversation
    const convoResult = await pool.query(
      `INSERT INTO conversations (participant1_id, participant2_id, created_at, last_message_at)
       VALUES ($1, $2, NOW(), NOW())
       RETURNING *`,
      [convoData.participant1.id, convoData.participant2.id]
    );

    const conversation = convoResult.rows[0];
    console.log(`✓ Created conversation: ${convoData.participant1.email} ↔ ${convoData.participant2.email}`);

    // Add messages
    for (let i = 0; i < convoData.messages.length; i++) {
      const msg = convoData.messages[i];
      const receiverId = msg.sender.id === convoData.participant1.id
        ? convoData.participant2.id
        : convoData.participant1.id;

      await pool.query(
        `INSERT INTO messages (
          conversation_id, sender_id, receiver_id, content,
          is_read, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '${i} minutes')`,
        [conversation.id, msg.sender.id, receiverId, msg.content, i < convoData.messages.length - 1]
      );
    }

    console.log(`  ✓ Added ${convoData.messages.length} messages`);
  }
}

async function printTestCredentials(users) {
  console.log('\n\n🎉 ========================================');
  console.log('   MESSAGING TEST DATA CREATED SUCCESSFULLY!');
  console.log('========================================\n');

  console.log('📧 TEST USER CREDENTIALS (all passwords: password123)\n');

  const groupedUsers = {
    'Property Managers': users.filter(u => u.role === 'property_manager'),
    'Entrepreneurs': users.filter(u => u.role === 'entrepreneur'),
    'Residents': users.filter(u => u.role === 'resident'),
    'Suppliers': users.filter(u => u.role === 'supplier')
  };

  for (const [group, groupUsers] of Object.entries(groupedUsers)) {
    console.log(`\n${group}:`);
    console.log('─'.repeat(60));
    groupUsers.forEach(user => {
      console.log(`  Email: ${user.email}`);
      console.log(`  Name:  ${user.first_name} ${user.last_name}`);
      console.log(`  ID:    ${user.id}`);
      console.log('');
    });
  }

  console.log('\n📋 MESSAGING PERMISSIONS:\n');
  console.log('✅ manager1@test.com ↔ Any resident (always allowed)');
  console.log('✅ manager2@test.com ↔ Any resident (always allowed)');
  console.log('✅ resident1@test.com ↔ resident2@test.com (always allowed)');
  console.log('✅ resident1@test.com ↔ resident3@test.com (always allowed)');
  console.log('✅ entrepreneur1@test.com ↔ supplier1@test.com (always allowed)');
  console.log('✅ entrepreneur2@test.com ↔ supplier2@test.com (always allowed)');
  console.log('✅ entrepreneur1@test.com ↔ manager1@test.com (approved bid exists)');
  console.log('✅ entrepreneur2@test.com ↔ manager2@test.com (approved bid exists)');

  console.log('\n\n🚀 NEXT STEPS:\n');
  console.log('1. Start your server: npm start');
  console.log('2. Login with any test account');
  console.log('3. Test messaging in your frontend app');
  console.log('4. Or use Postman to test Socket.IO connections\n');

  console.log('📚 API ENDPOINTS:\n');
  console.log('  POST   /api/auth/login');
  console.log('  GET    /api/conversations');
  console.log('  POST   /api/conversations');
  console.log('  GET    /api/conversations/:id/messages');
  console.log('  POST   /api/messages');
  console.log('  GET    /api/can-message/:userId');
  console.log('  GET    /api/unread-count\n');

  console.log('🔌 SOCKET.IO EVENTS:\n');
  console.log('  Emit:   join_conversation');
  console.log('  Emit:   send_message');
  console.log('  Emit:   mark_as_read');
  console.log('  Emit:   typing_start');
  console.log('  Emit:   typing_stop');
  console.log('  Listen: new_message');
  console.log('  Listen: message_notification');
  console.log('  Listen: messages_read');
  console.log('  Listen: user_typing');
  console.log('  Listen: user_stopped_typing\n');
}

async function main() {
  try {
    console.log('🌱 Starting messaging test data seed...\n');

    // Step 1: Clear old test data
    await clearOldTestData();

    // Step 2: Create test users
    const users = await createTestUsers();

    // Step 3: Create properties and jobs
    const { properties, jobs } = await createPropertiesAndJobs(users);

    // Step 4: Create approved bids (enables Entrepreneur ↔ Manager messaging)
    await createApprovedBids(users, jobs);

    // Step 5: Create sample conversations with messages
    await createSampleConversations(users);

    // Step 6: Print credentials and instructions
    await printTestCredentials(users);

    console.log('✅ Seed completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Error seeding data:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
main();
