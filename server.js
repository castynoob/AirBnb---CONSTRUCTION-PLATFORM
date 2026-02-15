// ============================================
// LOAD ENVIRONMENT VARIABLES FIRST
// ============================================
import dotenv from "dotenv";
dotenv.config();

// ============================================
// REGULAR IMPORTS
// ============================================
import express from "express";
import cors from "cors";
import { createServer } from "http";
import morgan from "morgan";

// ============================================
// REDIS CONFIGURATION
// ============================================
import { getRedisInfo, pingRedis, closeRedis } from "./src/config/redis.js";

// ============================================
// SUPABASE CONFIGURATION
// ============================================
import { getSupabaseInfo } from "./src/config/supabase.js";

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
import inspectionRoutes from "./src/routes/inspectionRoutes.js";
// SUPPLIER TEMPORARILY DISABLED — uncomment to re-enable
// import supplierRoutes from "./src/routes/supplierRoutes.js";
import favoriteRoutes from "./src/routes/favoriteRoutes.js";
import statsRoutes from "./src/routes/statsRoutes.js";
import notificationRoutes from "./src/routes/notificationRoutes.js";
import debugRoutes from "./src/routes/debugRoutes.js";
import residentRoutes from "./src/routes/residentRoutes.js";
import groupChatRoutes from "./src/routes/groupChatRoutes.js";
import contractRoutes from "./src/routes/contractRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import supportRoutes from "./src/routes/supportRoutes.js";
import disputeRoutes from "./src/routes/disputeRoutes.js";
import geocodeRoutes from "./src/routes/geocodeRoutes.js";
import promoterRoutes from "./src/routes/promoterRoutes.js";
import promoCodeRoutes from "./src/routes/promoCodeRoutes.js";

// ============================================
// SOCKET SETUP
// ============================================
import setupSocket from "./src/config/socketSetup.js";

// ============================================
// APP CONFIG
// ============================================
const app = express();
app.use(morgan("dev"));

// ============================================
// REDIS CONNECTION CHECK
// ============================================
(async () => {
  const redisInfo = getRedisInfo();
  console.log('[Redis] Configuration:', {
    host: redisInfo.host,
    port: redisInfo.port,
    status: redisInfo.status
  });

  const isConnected = await pingRedis();
  if (isConnected) {
    console.log('[Redis] ✓ Connection successful - Caching enabled');
  } else {
    console.log('[Redis] ⚠ Connection failed - App will run without caching');
  }
})();

// ============================================
// SUPABASE CONNECTION CHECK
// ============================================
(() => {
  const supabaseInfo = getSupabaseInfo();
  console.log('[Supabase] Configuration:', {
    url: supabaseInfo.url,
    isConfigured: supabaseInfo.isConfigured,
  });

  if (supabaseInfo.isConfigured) {
    console.log('[Supabase] ✓ Configured - File uploads enabled');
  } else {
    console.log('[Supabase] ⚠ Not configured - File uploads will not work');
    console.log('[Supabase] Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env');
  }
})();

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
// CORS configuration - allow multiple origins
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  process.env.FRONTEND_URL,
].filter(Boolean); // Remove undefined values

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`⚠️ CORS blocked origin: ${origin}`);
        callback(new Error(`Not allowed by CORS: ${origin}`));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

// ============================================
// ROUTES
// ============================================
// PUBLIC ROUTES (no auth) - must come BEFORE protected routes
app.use("/api", registrationRoutes);
app.use("/api", geocodeRoutes); // Geocode proxy - no auth needed for registration
app.use("/api", statsRoutes); // Public platform stats - no auth needed
app.use("/api", debugRoutes); // DEBUG - No auth, must be before messageRoutes
app.use("/api/admin/promoters", promoterRoutes); // Promoter management routes - must be BEFORE /api/admin
app.use("/api/admin/promo-codes", promoCodeRoutes); // Promo code management routes
app.use("/api/admin", adminRoutes); // Admin routes - has its own auth

// PROTECTED ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/bids", bidRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api", messageRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/inspections", inspectionRoutes);
// SUPPLIER TEMPORARILY DISABLED — uncomment to re-enable
// app.use("/api", supplierRoutes);
app.use("/api", favoriteRoutes);
app.use("/api", notificationRoutes);
app.use("/api/residents", residentRoutes);
app.use("/api/residents/group-chats", groupChatRoutes);
app.use("/api/contracts", contractRoutes);
app.use("/api", supportRoutes);
app.use("/api", disputeRoutes);

// ============================================
// HEALTH CHECK
// ============================================
app.get("/health", async (req, res) => {
  const redisConnected = await pingRedis();
  res.json({
    status: "OK",
    message: "Construction Platform API is running",
    socketio: "Connected",
    redis: redisConnected ? "Connected" : "Disconnected (running without cache)",
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

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Close server
  server.close(async () => {
    console.log('HTTP server closed');

    // Close Redis connection
    await closeRedis();

    console.log('Graceful shutdown complete');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
