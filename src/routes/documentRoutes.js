// src/routes/documentRoutes.js
import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import { uploadAny, handleUploadError } from '../middleware/uploadMiddleware.js';
import {
  getMyDocuments,
  getDocument,
  uploadDocument,
  updateDocument,
  deleteDocument,
  getJobDocuments,
  getPropertyDocuments,
  getExpiringDocs,
} from '../controllers/documentController.js';

const router = express.Router();

// List current user's documents (with optional filters)
router.get('/', verifyToken, getMyDocuments);

// Expiring documents — must be BEFORE /:id to avoid param clash
router.get('/expiring', verifyToken, getExpiringDocs);

// Documents for a specific job
router.get('/job/:jobId', verifyToken, getJobDocuments);

// Documents for a specific property
router.get('/property/:propertyId', verifyToken, getPropertyDocuments);

// Single document by ID
router.get('/:id', verifyToken, getDocument);

// Upload a new document (single file via multer)
router.post('/', verifyToken, uploadAny, handleUploadError, uploadDocument);

// Update document metadata
router.put('/:id', verifyToken, updateDocument);

// Delete document
router.delete('/:id', verifyToken, deleteDocument);

export default router;
