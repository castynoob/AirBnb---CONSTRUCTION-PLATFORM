// ✅ src/routes/userRoutes.js
import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import {
  getProfile,
  getEntrepreneurProfile,
  getEntrepreneurProfileById,
  getManagerProfileByUserId, // ✅ add this
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

router.get(
  "/manager/:userId",
  authenticateToken,
  authorizeRoles("entrepreneur", "property_manager"),
  getManagerProfileByUserId
);


export default router;
