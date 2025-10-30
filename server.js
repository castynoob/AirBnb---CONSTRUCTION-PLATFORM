import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import morgan from "morgan";

// ============================================
// ROUTE IMPORTS
// ============================================
import authRoutes from "./src/routes/authRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import jobRoutes from "./src/routes/jobRoutes.js";
import bidRoutes from "./src/routes/bidRoutes.js";
import propertyRoutes from "./src/routes/propertyRoutes.js";
import paymentRoutes from "./src/routes/paymentRoutes.js";
import messageRoutes from "./src/routes/messageRoutes.js";
import reviewRoutes from "./src/routes/reviewRoutes.js";
import chatRoutes from "./src/routes/chatRoutes.js";
import emailRoutes from "./src/routes/emailRoutes.js"
import registrationRoutes from "./src/routes/registrationRoutes.js";

// ============================================
// SOCKET SETUP
// ============================================
import setupSocket from "./src/config/socketSetup.js";

// ============================================
// APP CONFIG
// ============================================
dotenv.config();
const app = express();
app.use(morgan("dev"));

// ============================================
// CREATE HTTP SERVER (for Socket.io)
// ============================================
const server = createServer(app);

// ============================================
// SETUP SOCKET.IO
// ============================================
const io = setupSocket(server);
app.set("io", io); // Make io accessible in controllers

// ============================================
// CRITICAL: WEBHOOK ROUTE FIRST (needs raw body)
// ============================================
app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  paymentRoutes
);

// ============================================
// MIDDLEWARE
// ============================================
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

// ============================================
// ROUTES
// ============================================
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/bids", bidRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/email", emailRoutes);
app.use("/api", registrationRoutes);

// ============================================
// HEALTH CHECK
// ============================================
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Construction Platform API is running",
    socketio: "Connected",
  });
});

// ============================================
// SERVER START
// ============================================
const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`💬 Socket.io ready for real-time messaging`);
});
