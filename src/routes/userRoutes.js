// ✅ src/routes/userRoutes.js
import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import {
  getProfile,
  getEntrepreneurProfile,
  getEntrepreneurProfileById,
} from "../controllers/userController.js";

import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Get logged-in user's basic info
router.get("/profile", authenticateToken, getProfile);

// Get logged-in user's entrepreneur profile
router.get(
  "/entrepreneur/profile",
  authenticateToken,
  authorizeRoles("entrepreneur", "property_manager"),
  getEntrepreneurProfile
);

// 🆕 Get entrepreneur info by profile ID
router.get(
  "/entrepreneur/:id",
  authenticateToken,
  authorizeRoles("entrepreneur", "property_manager"),
  getEntrepreneurProfileById
);

export default router;
