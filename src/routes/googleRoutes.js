import express from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post("/api/auth/google-login", async (req, res) => {
  try {
    const { token } = req.body;

    // Verify the token from frontend
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    // Save user to your DB if new, or get existing
    // Example: const user = await saveOrGetUser(payload);

    // Create your own JWT
    const jwtToken = jwt.sign(
      { id: payload.sub, email: payload.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token: jwtToken, user: payload });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: "Invalid Google token" });
  }
});

export default router;
