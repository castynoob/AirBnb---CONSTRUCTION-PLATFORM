import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';
import { uploadExcel, handleUploadError, validateFileExists, logUpload } from '../middleware/uploadMiddleware.js';
import InspectionController from '../controllers/inspectionController.js';

const router = express.Router();

/**
 * Inspection Routes
 * All routes require authentication
 * Most routes are restricted to property managers
 */

/**
 * Download inspection Excel template
 * GET /api/inspections/template
 * Public for authenticated users (both managers and entrepreneurs can download)
 */
router.get(
  '/template',
  authenticateToken,
  InspectionController.downloadTemplate
);

/**
 * Upload inspection Excel file
 * POST /api/inspections/upload
 * Property managers only
 *
 * Body (multipart/form-data):
 * - file: Excel file (.xlsx, .xls, .csv)
 * - property_id: UUID of property
 */
router.post(
  '/upload',
  authenticateToken,
  authorizeRoles('property_manager'),
  uploadExcel,
  handleUploadError,
  validateFileExists,
  logUpload,
  InspectionController.uploadInspection
);

/**
 * Create jobs from parsed inspection data
 * POST /api/inspections/:id/create-jobs
 * Property managers only
 *
 * Body:
 * - jobs: Array of job objects from parsed Excel
 */
router.post(
  '/:id/create-jobs',
  authenticateToken,
  authorizeRoles('property_manager'),
  InspectionController.createJobsFromInspection
);

/**
 * Get inspection preview (re-parse Excel)
 * GET /api/inspections/:id/preview
 * Property managers only
 */
router.get(
  '/:id/preview',
  authenticateToken,
  authorizeRoles('property_manager'),
  InspectionController.getInspectionPreview
);

/**
 * Get all inspections for current user
 * GET /api/inspections/my-uploads
 * Property managers only
 */
router.get(
  '/my-uploads',
  authenticateToken,
  authorizeRoles('property_manager'),
  InspectionController.getMyInspections
);

/**
 * Get all inspections for a property
 * GET /api/inspections/property/:propertyId
 * Property managers only
 */
router.get(
  '/property/:propertyId',
  authenticateToken,
  authorizeRoles('property_manager'),
  InspectionController.getInspectionsByProperty
);

/**
 * Get inspection statistics for a property
 * GET /api/inspections/property/:propertyId/stats
 * Property managers only
 */
router.get(
  '/property/:propertyId/stats',
  authenticateToken,
  authorizeRoles('property_manager'),
  InspectionController.getInspectionStats
);

/**
 * Delete inspection
 * DELETE /api/inspections/:id
 * Property managers only (must own the inspection)
 */
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('property_manager'),
  InspectionController.deleteInspection
);

export default router;
