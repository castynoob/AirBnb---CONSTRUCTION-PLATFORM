// src/controllers/documentController.js
import pool from '../config/db.js';
import { uploadToSupabase, deleteFromSupabase, getPublicUrl, extractFilePathFromUrl, generateUniqueFileName } from '../utils/supabaseHelpers.js';
import { BUCKETS } from '../config/supabase.js';
import * as Document from '../models/documentModel.js';

/**
 * GET /api/documents
 * Get current user's documents with optional filters
 */
export const getMyDocuments = async (req, res) => {
  try {
    const { category, job_id, property_id, search } = req.query;
    const documents = await Document.getDocumentsByOwner(req.user.id, {
      category,
      job_id,
      property_id,
      search,
    });

    res.json({
      message: 'Documents retrieved successfully',
      count: documents.length,
      documents,
    });
  } catch (err) {
    console.error('[Documents] Error fetching documents:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /api/documents/:id
 * Get single document (verify ownership)
 */
export const getDocument = async (req, res) => {
  try {
    const doc = await Document.getDocumentById(req.params.id);

    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Check ownership or shared job access
    if (doc.owner_id !== req.user.id) {
      // Allow access if user is part of the same job
      if (doc.job_id) {
        const jobAccess = await pool.query(
          `SELECT id FROM jobs
           WHERE id::text = $1
             AND (manager_id IN (SELECT id FROM manager_profiles WHERE user_id = $2)
                  OR entrepreneur_id::text = $2)`,
          [doc.job_id, req.user.id]
        );
        if (jobAccess.rows.length === 0) {
          return res.status(403).json({ message: 'Access denied' });
        }
      } else {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    res.json({ document: doc });
  } catch (err) {
    console.error('[Documents] Error fetching document:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/documents
 * Upload file to Supabase and create DB record
 */
export const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { title, category, job_id, property_id, contract_id, notes, expires_at } = req.body;

    if (!title || !category) {
      return res.status(400).json({ message: 'Title and category are required' });
    }

    // Upload to Supabase
    const uniqueName = generateUniqueFileName(req.file.originalname);
    const filePath = `${req.user.id}/${category}/${uniqueName}`;

    const uploadResult = await uploadToSupabase({
      fileBuffer: req.file.buffer,
      bucket: BUCKETS.DOCUMENTS,
      filePath,
      contentType: req.file.mimetype,
      upsert: false,
    });

    if (!uploadResult.success) {
      return res.status(500).json({
        message: 'Failed to upload file',
        error: uploadResult.error,
      });
    }

    const fileUrl = getPublicUrl(BUCKETS.DOCUMENTS, uploadResult.data.path);

    // Create DB record
    const document = await Document.createDocument({
      owner_id: req.user.id,
      job_id: job_id || null,
      property_id: property_id || null,
      contract_id: contract_id || null,
      category,
      title,
      file_url: fileUrl,
      file_name: req.file.originalname,
      file_size: req.file.size,
      file_type: req.file.mimetype,
      notes: notes || null,
      expires_at: expires_at || null,
    });

    console.log(`[Documents] Uploaded: ${document.id} - ${title}`);

    res.status(201).json({
      message: 'Document uploaded successfully',
      document,
    });
  } catch (err) {
    console.error('[Documents] Error uploading document:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * PUT /api/documents/:id
 * Update document metadata
 */
export const updateDocument = async (req, res) => {
  try {
    const updated = await Document.updateDocument(req.params.id, req.user.id, req.body);

    if (!updated) {
      return res.status(404).json({ message: 'Document not found or access denied' });
    }

    res.json({
      message: 'Document updated successfully',
      document: updated,
    });
  } catch (err) {
    console.error('[Documents] Error updating document:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * DELETE /api/documents/:id
 * Delete from Supabase storage and DB
 */
export const deleteDocument = async (req, res) => {
  try {
    const deleted = await Document.deleteDocument(req.params.id, req.user.id);

    if (!deleted) {
      return res.status(404).json({ message: 'Document not found or access denied' });
    }

    // Clean up file from Supabase
    if (deleted.file_url) {
      const filePath = extractFilePathFromUrl(deleted.file_url, BUCKETS.DOCUMENTS);
      if (filePath) {
        await deleteFromSupabase(BUCKETS.DOCUMENTS, filePath);
      }
    }

    console.log(`[Documents] Deleted: ${deleted.id} - ${deleted.title}`);

    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    console.error('[Documents] Error deleting document:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /api/documents/job/:jobId
 * Get all documents linked to a job
 */
export const getJobDocuments = async (req, res) => {
  try {
    const documents = await Document.getDocumentsByJob(req.params.jobId);

    res.json({
      message: 'Job documents retrieved successfully',
      count: documents.length,
      documents,
    });
  } catch (err) {
    console.error('[Documents] Error fetching job documents:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /api/documents/property/:propertyId
 * Get all documents linked to a property
 */
export const getPropertyDocuments = async (req, res) => {
  try {
    const documents = await Document.getDocumentsByProperty(req.params.propertyId);

    res.json({
      message: 'Property documents retrieved successfully',
      count: documents.length,
      documents,
    });
  } catch (err) {
    console.error('[Documents] Error fetching property documents:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /api/documents/expiring
 * Get documents expiring within 30 days
 */
export const getExpiringDocs = async (req, res) => {
  try {
    const documents = await Document.getExpiringDocuments(req.user.id, 30);

    res.json({
      message: 'Expiring documents retrieved successfully',
      count: documents.length,
      documents,
    });
  } catch (err) {
    console.error('[Documents] Error fetching expiring documents:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
