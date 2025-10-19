import fetch from "node-fetch";

const API_URL = "http://localhost:5000/api/auth";

const verifyToken = async (token) => {
  if (!token) {
    console.log("❌ Error: Token is required");
    console.log("\nUsage: node scripts/verify-token.js YOUR_TOKEN_HERE\n");
    return;
  }

  try {
    console.log("🔄 Verifying email with token...\n");

    const response = await fetch(`${API_URL}/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Email verified successfully!");
      console.log(`📧 User: ${data.user.email}`);
      console.log("\n🎉 You can now login!");
      console.log("\nTest login with:");
      console.log(
        'curl -X POST http://localhost:5000/api/auth/login \\\n  -H "Content-Type: application/json" \\\n  -d \'{"email": "test@example.com", "password": "Test1234!"}\''
      );
    } else {
      console.log("❌ Verification failed:", data.message);
    }
  } catch (err) {
    console.log("❌ Request failed:", err.message);
  }
};

const token = process.argv[2];
verifyToken(token);