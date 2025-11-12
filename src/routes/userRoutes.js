// ✅ src/routes/userRoutes.js
import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware.js";
import { USER_KEYS, TTL } from "../utils/cacheKeys.js";
import {
  getProfile,
  getEntrepreneurProfile,
  getEntrepreneurProfileById,
  getManagerProfileByUserId,
  getEntrepreneurProfileByUserId,
  getManagerProfileById,
  uploadManagerProfilePicture,
  uploadEntrepreneurProfilePicture,
  deleteManagerProfilePicture,
  deleteEntrepreneurProfilePicture,
  updateEntrepreneurProfile,
  updateUserPhone
} from "../controllers/userController.js";
import { uploadImage, handleUploadError } from "../middleware/uploadMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Get logged-in user's basic info - CACHED (1 hour)
router.get(
  "/profile",
  authenticateToken,
  cacheMiddleware((req) => USER_KEYS.profile(req.user.id || req.user.userId), TTL.ONE_HOUR),
  getProfile
);

// Get logged-in user's entrepreneur profile - CACHED (1 hour)
router.get(
  "/entrepreneur/profile",
  authenticateToken,
  authorizeRoles("entrepreneur", "property_manager"),
  cacheMiddleware((req) => USER_KEYS.entrepreneur(req.user.id || req.user.userId), TTL.ONE_HOUR),
  getEntrepreneurProfile
);

// Get entrepreneur info by profile ID - CACHED (1 hour)
router.get(
  "/entrepreneur/:id",
  authenticateToken,
  authorizeRoles("entrepreneur", "property_manager"),
  cacheMiddleware((req) => USER_KEYS.entrepreneurById(req.params.id), TTL.ONE_HOUR),
  getEntrepreneurProfileById
);

// Get manager by user ID - CACHED (1 hour)
router.get(
  "/manager/:userId",
  authenticateToken,
  authorizeRoles("entrepreneur", "property_manager"),
  cacheMiddleware((req) => USER_KEYS.manager(req.params.userId), TTL.ONE_HOUR),
  getManagerProfileByUserId
);

// Get entrepreneur by user ID - CACHED (1 hour)
router.get(
  "/entrepreneur/user/:userId",
  authenticateToken,
  authorizeRoles("entrepreneur", "property_manager"),
  cacheMiddleware((req) => USER_KEYS.entrepreneur(req.params.userId), TTL.ONE_HOUR),
  getEntrepreneurProfileByUserId
);

// Get manager by manager profile ID - CACHED (1 hour)
router.get(
  "/manager/profile/id/:managerId",
  authenticateToken,
  authorizeRoles("entrepreneur", "property_manager"),
  cacheMiddleware((req) => USER_KEYS.managerById(req.params.managerId), TTL.ONE_HOUR),
  getManagerProfileById
);

// ========================================
// 📸 PROFILE PICTURE UPLOAD ROUTES
// ========================================

// Upload Manager Profile Picture
router.post(
  "/manager/profile-picture",
  authenticateToken,
  authorizeRoles("property_manager"),
  uploadImage,
  handleUploadError,
  invalidateCache((req) => [USER_KEYS.profile(req.user.id), USER_KEYS.manager(req.user.id)]),
  uploadManagerProfilePicture
);

// Upload Entrepreneur Profile Picture
router.post(
  "/entrepreneur/profile-picture",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  uploadImage,
  handleUploadError,
  invalidateCache((req) => [USER_KEYS.profile(req.user.id), USER_KEYS.entrepreneur(req.user.id)]),
  uploadEntrepreneurProfilePicture
);

// Delete Manager Profile Picture
router.delete(
  "/manager/profile-picture",
  authenticateToken,
  authorizeRoles("property_manager"),
  invalidateCache((req) => [USER_KEYS.profile(req.user.id), USER_KEYS.manager(req.user.id)]),
  deleteManagerProfilePicture
);

// Delete Entrepreneur Profile Picture
router.delete(
  "/entrepreneur/profile-picture",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  invalidateCache((req) => [USER_KEYS.profile(req.user.id), USER_KEYS.entrepreneur(req.user.id)]),
  deleteEntrepreneurProfilePicture
);

// ========================================
// 📝 PROFILE UPDATE ROUTES
// ========================================

// Update Entrepreneur Profile
router.put(
  "/entrepreneur/profile",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  invalidateCache((req) => [USER_KEYS.profile(req.user.id), USER_KEYS.entrepreneur(req.user.id)]),
  updateEntrepreneurProfile
);

// Update User Phone Number
router.put(
  "/phone",
  authenticateToken,
  invalidateCache((req) => [USER_KEYS.profile(req.user.id), USER_KEYS.entrepreneur(req.user.id)]),
  updateUserPhone
);

export default router;