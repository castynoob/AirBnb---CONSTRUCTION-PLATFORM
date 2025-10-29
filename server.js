import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from 'http';
import authRoutes from "./src/routes/authRoutes.js";
import jobRoutes from "./src/routes/jobRoutes.js";
import bidRoutes from "./src/routes/bidRoutes.js";
import propertyRoutes from "./src/routes/propertyRoutes.js";
import paymentRoutes from "./src/routes/paymentRoutes.js";
import messageRoutes from "./src/routes/messageRoutes.js";  // ✅ NEW
import setupSocket from "./src/config/socketSetup.js";      // ✅ NEW
import userRoutes from "./src/routes/userRoutes.js"
import registrationRoutes from "./src/routes/registrationRoutes.js"
import morgan from "morgan";

dotenv.config();
const app = express();

app.use(morgan('dev'))

// ============================================
// CREATE HTTP SERVER (for Socket.io)
// ============================================
const server = createServer(app);

// ============================================
// SETUP SOCKET.IO
// ============================================
const io = setupSocket(server);
app.set('io', io); // Make io accessible in controllers

// ============================================
// CRITICAL: WEBHOOK ROUTE FIRST (needs raw body)
// This MUST come BEFORE express.json()
// ============================================
app.use('/api/payments/webhook', 
    express.raw({ type: 'application/json' }), 
    paymentRoutes
);

// ============================================
// MIDDLEWARE (JSON parser)
// ============================================
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
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
app.use("/api", registrationRoutes);

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Construction Platform API is running',
    socketio: 'Connected'
  });
});

// ============================================
// SERVER START (use server.listen, not app.listen)
// ============================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`💬 Socket.io ready for real-time messaging`);
});

// server.listen(PORT, "0.0.0.0", () => {
//   console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
//   console.log(`💬 Socket.io ready for real-time messaging`);
// });