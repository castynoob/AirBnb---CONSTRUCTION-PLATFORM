import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware.js";
import { JOB_KEYS, TTL } from "../utils/cacheKeys.js";
import {
  createJob,
  getAllJobs,
  getJobById,
  getJobsByManagerId,
  updateJob,
  deleteJob,
  archiveJob,
  getArchivedJobs,
  getJobsByEntrepreneurId,
  uploadJobImages,
  getJobImages,
  deleteJobImage
} from "../controllers/jobController.js";
import { uploadImage, uploadMultipleImages, handleUploadError } from "../middleware/uploadMiddleware.js";

const router = express.Router();

// Everyone logged in can view jobs - CACHED (5 minutes)
router.get("/", verifyToken, cacheMiddleware(JOB_KEYS.all, TTL.FIVE_MINUTES), getAllJobs);

// Archived jobs for the current manager
router.get("/archived", verifyToken, authorizeRoles("property_manager"), getArchivedJobs);

// Single job by ID - CACHED (5 minutes)
router.get("/:id", verifyToken, cacheMiddleware((req) => JOB_KEYS.single(req.params.id), TTL.FIVE_MINUTES), getJobById);

// Jobs by manager - CACHED (5 minutes)
router.get("/manager/:manager_id", verifyToken, cacheMiddleware((req) => JOB_KEYS.byManager(req.params.manager_id), TTL.FIVE_MINUTES), getJobsByManagerId);

// Jobs by entrepreneur - CACHED (5 minutes)
router.get("/entrepreneur/:entrepreneur_id", verifyToken, cacheMiddleware((req) => JOB_KEYS.byEntrepreneur(req.params.entrepreneur_id), TTL.FIVE_MINUTES), getJobsByEntrepreneurId);

// Property managers only — create, update, delete jobs with cache invalidation
router.post(
  "/",
  verifyToken,
  authorizeRoles("property_manager"),
  invalidateCache(() => [JOB_KEYS.allJobs()]),
  createJob
);

router.put(
  "/:id",
  verifyToken,
  authorizeRoles("property_manager", "entrepreneur"),
  invalidateCache((req) => [JOB_KEYS.forJob(req.params.id), JOB_KEYS.allJobs(), 'manager_submissions:*']),
  updateJob
);

router.delete(
  "/:id",
  verifyToken,
  authorizeRoles("property_manager"),
  invalidateCache((req) => [JOB_KEYS.forJob(req.params.id), JOB_KEYS.allJobs()]),
  deleteJob
);

// Archive/unarchive a job
router.patch(
  "/:id/archive",
  verifyToken,
  authorizeRoles("property_manager"),
  invalidateCache((req) => [JOB_KEYS.forJob(req.params.id), JOB_KEYS.allJobs()]),
  archiveJob
);

// ========================================
// 🖼️ JOB IMAGE UPLOAD ROUTES
// ========================================

// Upload Job Image(s) - Supports single or multiple images
router.post(
  "/:id/images",
  verifyToken,
  authorizeRoles("property_manager", "entrepreneur"),
  uploadMultipleImages,  // Supports multiple files
  handleUploadError,
  invalidateCache((req) => [JOB_KEYS.forJob(req.params.id)]),
  uploadJobImages
);

// Alternative: Upload single job image
router.post(
  "/:id/image",
  verifyToken,
  authorizeRoles("property_manager", "entrepreneur"),
  uploadImage,  // Single file
  handleUploadError,
  invalidateCache((req) => [JOB_KEYS.forJob(req.params.id)]),
  uploadJobImages
);

// Get all images for a job
router.get(
  "/:id/images",
  verifyToken,
  cacheMiddleware((req) => `job:${req.params.id}:images`, TTL.FIVE_MINUTES),
  getJobImages
);

// Delete specific job image
router.delete(
  "/:jobId/images/:imageId",
  verifyToken,
  authorizeRoles("property_manager", "entrepreneur"),
  invalidateCache((req) => [JOB_KEYS.forJob(req.params.jobId), `job:${req.params.jobId}:images`]),
  deleteJobImage
);

export default router;