import fetch from "node-fetch";

const API_URL = "http://localhost:5000/api/auth";

// ANSI color codes for terminal output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[36m",
  reset: "\x1b[0m",
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
};

// Test data
const testUser = {
  email: "test@example.com",
  password: "Test1234!",
  first_name: "John",
  last_name: "Doe",
  role: "entrepreneur",
};

// Test 1: Register User
const testRegistration = async () => {
  console.log("\n" + "=".repeat(60));
  log.info("TEST 1: User Registration");
  console.log("=".repeat(60));

  try {
    const response = await fetch(`${API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser),
    });

    const data = await response.json();

    if (response.ok) {
      log.success("Registration successful!");
      log.info(`Response: ${data.message}`);
      log.warning("📧 Check your email inbox for verification link!");
      return true;
    } else {
      log.error(`Registration failed: ${data.message}`);
      return false;
    }
  } catch (err) {
    log.error(`Request failed: ${err.message}`);
    return false;
  }
};

// Test 2: Try Login Without Verification
const testLoginUnverified = async () => {
  console.log("\n" + "=".repeat(60));
  log.info("TEST 2: Login Without Email Verification");
  console.log("=".repeat(60));

  try {
    const response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
      }),
    });

    const data = await response.json();

    if (response.status === 403) {
      log.success("Correctly blocked unverified user!");
      log.info(`Message: ${data.message}`);
      return true;
    } else {
      log.error("Security issue: Unverified user was allowed to login!");
      return false;
    }
  } catch (err) {
    log.error(`Request failed: ${err.message}`);
    return false;
  }
};

// Test 3: Verify Email (Manual Token Input)
const testEmailVerification = async (token) => {
  console.log("\n" + "=".repeat(60));
  log.info("TEST 3: Email Verification");
  console.log("=".repeat(60));

  try {
    const response = await fetch(`${API_URL}/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const data = await response.json();

    if (response.ok) {
      log.success("Email verified successfully!");
      log.info(`Message: ${data.message}`);
      return true;
    } else {
      log.error(`Verification failed: ${data.message}`);
      return false;
    }
  } catch (err) {
    log.error(`Request failed: ${err.message}`);
    return false;
  }
};

// Test 4: Login After Verification
const testLoginVerified = async () => {
  console.log("\n" + "=".repeat(60));
  log.info("TEST 4: Login After Email Verification");
  console.log("=".repeat(60));

  try {
    const response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      log.success("Login successful!");
      log.info(`Access Token: ${data.accessToken.substring(0, 20)}...`);
      log.info(`Refresh Token: ${data.refreshToken.substring(0, 20)}...`);
      log.info(`User: ${data.user.first_name} ${data.user.last_name}`);
      return data;
    } else {
      log.error(`Login failed: ${data.message}`);
      return null;
    }
  } catch (err) {
    log.error(`Request failed: ${err.message}`);
    return null;
  }
};

// Main Test Runner
const runTests = async () => {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     🔐 EMAIL VERIFICATION TESTING SUITE                    ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  // Test 1: Registration
  const registered = await testRegistration();
  if (!registered) {
    log.error("Registration failed. Stopping tests.");
    return;
  }

  // Wait a moment
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Test 2: Try login without verification
  await testLoginUnverified();

  // Manual token input
  console.log("\n" + "=".repeat(60));
  log.warning("📧 MANUAL STEP REQUIRED:");
  console.log("=".repeat(60));
  console.log("\n1. Check your email inbox (or Mailtrap)");
  console.log("2. Find the verification link");
  console.log("3. Copy the TOKEN from the URL");
  console.log("   Example: http://localhost:3000/verify-email?token=ABC123");
  console.log("   Copy only: ABC123\n");
  console.log("4. Run this command:");
  console.log(
    `   ${colors.green}node scripts/verify-token.js YOUR_TOKEN_HERE${colors.reset}\n`
  );
  console.log("Or use the Postman/curl commands below:\n");

  // Show curl command
  console.log("📝 CURL Command:");
  console.log(
    `${colors.yellow}curl -X POST http://localhost:5000/api/auth/verify-email \\`
  );
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"token": "YOUR_TOKEN_HERE"}'${colors.reset}\n`);

  // Show Postman example
  console.log("📮 Postman:");
  console.log(`${colors.blue}POST http://localhost:5000/api/auth/verify-email`);
  console.log(`Body (JSON): { "token": "YOUR_TOKEN_HERE" }${colors.reset}\n`);
};

// Run the tests
runTests();