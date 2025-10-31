/**
 * Test Message Authorization
 * Tests if the canUserMessage function works correctly for approved bids
 */

import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

// Test users from diagnostic output
const testUsers = {
  entrepreneur1: {
    email: 'entrepreneur1@test.com',
    password: 'password123',
    userId: '6e0bc99c-278e-49fc-85fa-ae3b070e97b0'
  },
  entrepreneur2: {
    email: 'entrepreneur2@test.com',
    password: 'password123',
    userId: '6f5388aa-d8fd-475e-9e81-8bf8279f7094'
  },
  manager1: {
    email: 'manager1@test.com',
    password: 'password123',
    userId: '9b567e99-e407-4494-a64e-7a148060e955'
  },
  manager2: {
    email: 'manager2@test.com',
    password: 'password123',
    userId: '6f487c38-edb6-4b82-88ea-62c2144af3d8'
  }
};

async function login(email, password) {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email,
      password
    });
    return response.data.accessToken; // Changed from 'token' to 'accessToken'
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error(`❌ Login failed for ${email}: Server not running on ${API_URL}`);
    } else {
      console.error(`❌ Login failed for ${email}:`, JSON.stringify(error.response?.data || error.message));
    }
    return null;
  }
}

async function checkMessageAccess(token, otherUserId, fromEmail, toEmail) {
  try {
    const response = await axios.get(`${API_URL}/can-message/${otherUserId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`✅ ${fromEmail} → ${toEmail}:`, response.data.message);
    return response.data.canMessage;
  } catch (error) {
    console.error(`❌ ${fromEmail} → ${toEmail}:`, error.response?.data?.message || error.message);
    return false;
  }
}

async function sendTestMessage(token, receiverId, fromEmail, toEmail) {
  try {
    const response = await axios.post(`${API_URL}/messages`, {
      receiverId,
      content: 'Test message from authorization test script'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`📧 ${fromEmail} sent message to ${toEmail}: SUCCESS`);
    return true;
  } catch (error) {
    console.error(`📧 ${fromEmail} → ${toEmail}:`, error.response?.data?.message || error.message);
    return false;
  }
}

async function runTests() {
  console.log('\n🔍 TESTING MESSAGE AUTHORIZATION\n');
  console.log('='.repeat(80));

  // Login all users
  console.log('\n📝 Logging in test users...\n');
  const tokens = {};

  for (const [key, user] of Object.entries(testUsers)) {
    console.log(`Logging in ${user.email}...`);
    const token = await login(user.email, user.password);
    if (token) {
      tokens[key] = token;
      console.log(`✅ ${user.email} logged in successfully`);
    } else {
      console.log(`❌ ${user.email} login failed`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ TESTING APPROVED BID SCENARIOS (Should ALL Work)\n');
  console.log('─'.repeat(80));

  // Test Case 1: Entrepreneur1 → Manager1 (has approved bid)
  console.log('\n1️⃣  Test: entrepreneur1 → manager1 (Has approved bid on "Test Job 1 - Sarah")');
  if (tokens.entrepreneur1) {
    await checkMessageAccess(tokens.entrepreneur1, testUsers.manager1.userId,
      testUsers.entrepreneur1.email, testUsers.manager1.email);
    await sendTestMessage(tokens.entrepreneur1, testUsers.manager1.userId,
      testUsers.entrepreneur1.email, testUsers.manager1.email);
  }

  // Test Case 2: Manager1 → Entrepreneur1 (reverse, should also work)
  console.log('\n2️⃣  Test: manager1 → entrepreneur1 (Reverse direction)');
  if (tokens.manager1) {
    await checkMessageAccess(tokens.manager1, testUsers.entrepreneur1.userId,
      testUsers.manager1.email, testUsers.entrepreneur1.email);
    await sendTestMessage(tokens.manager1, testUsers.entrepreneur1.userId,
      testUsers.manager1.email, testUsers.entrepreneur1.email);
  }

  // Test Case 3: Entrepreneur2 → Manager1 (has approved bid)
  console.log('\n3️⃣  Test: entrepreneur2 → manager1 (Has approved bid on "Test Job 2 - Sarah")');
  if (tokens.entrepreneur2) {
    await checkMessageAccess(tokens.entrepreneur2, testUsers.manager1.userId,
      testUsers.entrepreneur2.email, testUsers.manager1.email);
    await sendTestMessage(tokens.entrepreneur2, testUsers.manager1.userId,
      testUsers.entrepreneur2.email, testUsers.manager1.email);
  }

  // Test Case 4: Entrepreneur1 → Manager2 (has approved bid)
  console.log('\n4️⃣  Test: entrepreneur1 → manager2 (Has approved bid on "Test Job 2 - Mike")');
  if (tokens.entrepreneur1) {
    await checkMessageAccess(tokens.entrepreneur1, testUsers.manager2.userId,
      testUsers.entrepreneur1.email, testUsers.manager2.email);
    await sendTestMessage(tokens.entrepreneur1, testUsers.manager2.userId,
      testUsers.entrepreneur1.email, testUsers.manager2.email);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n❌ TESTING NO BID SCENARIOS (Should ALL Fail)\n');
  console.log('─'.repeat(80));

  // Test Case 5: Entrepreneur2 → Manager2 (NO approved bid)
  console.log('\n5️⃣  Test: entrepreneur2 → manager2 (NO approved bid between them)');
  if (tokens.entrepreneur2) {
    await checkMessageAccess(tokens.entrepreneur2, testUsers.manager2.userId,
      testUsers.entrepreneur2.email, testUsers.manager2.email);
    await sendTestMessage(tokens.entrepreneur2, testUsers.manager2.userId,
      testUsers.entrepreneur2.email, testUsers.manager2.email);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Tests complete!\n');
}

runTests().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
