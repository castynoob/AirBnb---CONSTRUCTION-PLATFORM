// src/routes/propertyRoutes.js
import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
  createProperty,
  getMyProperties,
  getPropertyById,
  updateProperty,
  deleteProperty
} from "../controllers/propertyController.js";

const router = express.Router();

// All property endpoints require property_manager role
router.post("/", verifyToken, authorizeRoles("property_manager"), createProperty);
router.get("/", verifyToken, authorizeRoles("property_manager"), getMyProperties);
router.get("/:id", verifyToken, authorizeRoles("property_manager"), getPropertyById);
router.put("/:id", verifyToken, authorizeRoles("property_manager"), updateProperty);
router.delete("/:id", verifyToken, authorizeRoles("property_manager"), deleteProperty);

export default router;