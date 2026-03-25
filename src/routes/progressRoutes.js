// src/routes/progressRoutes.js
import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';
import { uploadMultipleImages, handleUploadError } from '../middleware/uploadMiddleware.js';
import {
  getJobProgress,
  initProgress,
  updateProgress,
  validateProgress,
  uploadProgressPhotos,
} from '../controllers/progressController.js';

const router = express.Router();

// GET /api/progress/:jobId - Get all stages + photos for a job
router.get('/:jobId', verifyToken, getJobProgress);

// POST /api/progress/:jobId/init - Initialize stages (entrepreneur only)
router.post(
  '/:jobId/init',
  verifyToken,
  authorizeRoles('entrepreneur'),
  initProgress
);

// PUT /api/progress/stage/:stageId - Update stage status (entrepreneur only)
router.put(
  '/stage/:stageId',
  verifyToken,
  authorizeRoles('entrepreneur'),
  updateProgress
);

// PUT /api/progress/stage/:stageId/validate - Validate a stage (manager only)
router.put(
  '/stage/:stageId/validate',
  verifyToken,
  authorizeRoles('property_manager'),
  validateProgress
);

// POST /api/progress/stage/:stageId/photos - Upload photos for a stage
router.post(
  '/stage/:stageId/photos',
  verifyToken,
  authorizeRoles('entrepreneur', 'property_manager'),
  uploadMultipleImages,
  handleUploadError,
  uploadProgressPhotos
);

export default router;
