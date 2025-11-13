// src/routes/propertyRoutes.js
import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware.js";
import { PROPERTY_KEYS, TTL } from "../utils/cacheKeys.js";
import {
  createProperty,
  getMyProperties,
  getPropertyById,
  updateProperty,
  deleteProperty,
  getAllProperties,
  uploadPropertyImage,
  deletePropertyImage
} from "../controllers/propertyController.js";
import { uploadImage, handleUploadError } from "../middleware/uploadMiddleware.js";

const router = express.Router();
// Public endpoint for registration - no auth required
router.get("/public", cacheMiddleware(PROPERTY_KEYS.all, TTL.TEN_MINUTES), getAllProperties);

// All properties - CACHED (10 minutes)
router.get("/all", verifyToken, cacheMiddleware(PROPERTY_KEYS.all, TTL.TEN_MINUTES), getAllProperties);

// My properties - CACHED (10 minutes)
router.get(
  "/",
  verifyToken,
  authorizeRoles("property_manager"),
  cacheMiddleware((req) => PROPERTY_KEYS.byManager(req.user.id || req.user.userId), TTL.TEN_MINUTES),
  getMyProperties
);

// Property by ID with stats - CACHED (10 minutes)
router.get(
  "/:id",
  verifyToken,
  authorizeRoles("property_manager"),
  cacheMiddleware((req) => PROPERTY_KEYS.withStats(req.params.id), TTL.TEN_MINUTES),
  getPropertyById
);

// Create property - Invalidate caches
router.post(
  "/",
  verifyToken,
  authorizeRoles("property_manager"),
  invalidateCache(() => [PROPERTY_KEYS.allProperties()]),
  createProperty
);

// Update property - Invalidate caches
router.put(
  "/:id",
  verifyToken,
  authorizeRoles("property_manager"),
  invalidateCache((req) => [PROPERTY_KEYS.forProperty(req.params.id), PROPERTY_KEYS.allProperties()]),
  updateProperty
);

// Delete property - Invalidate caches
router.delete(
  "/:id",
  verifyToken,
  authorizeRoles("property_manager"),
  invalidateCache((req) => [PROPERTY_KEYS.forProperty(req.params.id), PROPERTY_KEYS.allProperties()]),
  deleteProperty
);

// ========================================
// 🏢 PROPERTY IMAGE UPLOAD ROUTES
// ========================================

// Upload Property Image
router.post(
  "/:id/image",
  verifyToken,
  authorizeRoles("property_manager"),
  uploadImage,
  handleUploadError,
  invalidateCache((req) => [PROPERTY_KEYS.forProperty(req.params.id), PROPERTY_KEYS.allProperties()]),
  uploadPropertyImage
);

// Delete Property Image
router.delete(
  "/:id/image",
  verifyToken,
  authorizeRoles("property_manager"),
  invalidateCache((req) => [PROPERTY_KEYS.forProperty(req.params.id), PROPERTY_KEYS.allProperties()]),
  deletePropertyImage
);

export default router;