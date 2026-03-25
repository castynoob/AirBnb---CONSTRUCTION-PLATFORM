import InspectionModel from '../models/inspectionModel.js';
import { uploadToSupabase, deleteFromSupabase, getPublicUrl, downloadFromSupabase } from '../utils/supabaseHelpers.js';
import { generateInspectionTemplate } from '../utils/excelParser.js';
import { parseExcelWithAI } from '../utils/aiExcelParser.js';
import { BUCKETS } from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import * as cache from '../config/cache.js';

/**
 * Inspection Controller
 * Handles inspection Excel file uploads, parsing, and bulk job creation
 */

const InspectionController = {
  /**
   * Upload inspection Excel file
   * POST /api/inspections/upload
   *
   * Steps:
   * 1. Validate file
   * 2. Upload to Supabase
   * 3. Parse Excel
   * 4. Store inspection record
   * 5. Return parsed job preview
   */
  async uploadInspection(req, res) {
    try {
      const { property_id } = req.body;
      const userId = req.user.id;

      // Validate inputs
      if (!property_id) {
        return res.status(400).json({
          error: 'Missing property_id',
          message: 'Please provide the property ID for this inspection',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please provide an Excel file',
        });
      }

      // Set SSE headers for streaming progress
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      sendEvent({ stage: 'uploading', message: 'Reading Excel file...' });

      // Parse Excel file using AI with progress callback
      console.log(`[Inspection] Parsing Excel with AI for property ${property_id}...`);
      const parseResult = await parseExcelWithAI(req.file.buffer, (progress) => {
        sendEvent(progress);
      });

      if (!parseResult.success && parseResult.success !== undefined) {
        sendEvent({ stage: 'error', message: parseResult.error });
        res.end();
        return;
      }

      if (parseResult.jobs.length === 0) {
        sendEvent({ stage: 'error', message: 'The Excel file does not contain any valid job data' });
        res.end();
        return;
      }

      sendEvent({ stage: 'saving', message: 'Saving inspection record...' });

      // Upload file to Supabase (optional - don't block flow if it fails)
      let fileUrl = null;
      let inspection = null;

      try {
        const fileName = `${uuidv4()}-${req.file.originalname}`;
        const filePath = `${property_id}/${fileName}`;

        const uploadResult = await uploadToSupabase({
          fileBuffer: req.file.buffer,
          bucket: BUCKETS.INSPECTIONS,
          filePath,
          contentType: req.file.mimetype,
          upsert: false,
        });

        if (uploadResult.success) {
          fileUrl = getPublicUrl(BUCKETS.INSPECTIONS, uploadResult.data.path);
        } else {
          console.warn('[Inspection] Supabase upload failed (non-blocking):', uploadResult.error);
        }
      } catch (uploadError) {
        console.warn('[Inspection] Supabase upload failed (non-blocking):', uploadError.message);
      }

      // Store inspection record in database
      try {
        inspection = await InspectionModel.create({
          property_id,
          file_url: fileUrl || `local://${req.file.originalname}`,
          file_name: req.file.originalname,
          file_size: req.file.size,
          file_type: req.file.mimetype,
          uploaded_by: userId,
          parsed_job_count: parseResult.jobs.length,
          status: 'parsed',
        });
      } catch (dbError) {
        console.warn('[Inspection] DB record creation failed (non-blocking):', dbError.message);
      }

      console.log(`[Inspection] ✓ Parsing complete - ${parseResult.jobs.length} jobs extracted${fileUrl ? ' (file stored)' : ' (file storage skipped)'}`);

      // Invalidate property cache
      try { await cache.delPattern(`property:*:${property_id}*`); } catch (_) {}

      // Send final result
      sendEvent({
        stage: 'complete',
        result: {
          success: true,
          message: `Successfully parsed inspection. Found ${parseResult.jobs.length} jobs.`,
          inspection: inspection ? {
            id: inspection.id,
            property_id: inspection.property_id,
            file_name: inspection.file_name,
            file_url: inspection.file_url,
            uploaded_at: inspection.uploaded_at,
            status: inspection.status,
          } : {
            id: null,
            property_id,
            file_name: req.file.originalname,
            file_url: null,
            uploaded_at: new Date().toISOString(),
            status: 'parsed',
          },
          parsedData: {
            totalRows: parseResult.totalRows,
            successCount: parseResult.successCount,
            errorCount: parseResult.errorCount,
            jobs: parseResult.jobs,
            errors: parseResult.errors,
            detectedColumns: parseResult.detectedColumns,
            fieldMapping: parseResult.fieldMapping,
          },
        },
      });

      res.end();
    } catch (error) {
      console.error('[Inspection] Upload error:', error);
      // If headers already sent (SSE mode), send error event
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ stage: 'error', message: error.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({
          error: 'Server error',
          message: error.message,
        });
      }
    }
  },

  /**
   * Create jobs from parsed inspection data
   * POST /api/inspections/:id/create-jobs
   *
   * Takes parsed job data and creates actual job records
   */
  async createJobsFromInspection(req, res) {
    try {
      const { id: inspectionId } = req.params;
      const { jobs: jobsData } = req.body; // Array of job objects from frontend
      const userId = req.user.id;

      if (!jobsData || !Array.isArray(jobsData) || jobsData.length === 0) {
        return res.status(400).json({
          error: 'No job data provided',
          message: 'Please provide an array of jobs to create',
        });
      }

      // Get inspection record
      const inspection = await InspectionModel.getById(inspectionId);

      if (!inspection) {
        return res.status(404).json({
          error: 'Inspection not found',
        });
      }

      // Verify user owns this inspection
      if (inspection.uploaded_by !== userId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only create jobs from your own inspections',
        });
      }

      // Import bulk job creation function
      const { bulkCreateJobs } = await import('../models/jobModel.js');

      // Get property to find the actual manager
      const { getPropertyById } = await import('../models/propertyModel.js');
      const property = await getPropertyById(inspection.property_id);

      if (!property) {
        return res.status(404).json({
          error: 'Property not found',
          message: 'The property associated with this inspection no longer exists',
        });
      }

      // Filter out jobs without budget_min and budget_max
      const jobsWithBudget = jobsData.filter((job) =>
        job.budget_min != null && job.budget_max != null &&
        parseFloat(job.budget_min) > 0 && parseFloat(job.budget_max) > 0
      );
      const skippedCount = jobsData.length - jobsWithBudget.length;

      if (jobsWithBudget.length === 0) {
        return res.status(400).json({
          error: 'No valid jobs',
          message: 'All jobs are missing a budget. Please add budget min and max to at least one job before creating.',
          skippedCount,
        });
      }

      // Prepare jobs for creation — use budget_min/budget_max directly from frontend
      const jobsToCreate = jobsWithBudget.map((job) => ({
        property_id: inspection.property_id,
        manager_id: property.manager_id,
        title: job.title,
        description: job.description || '',
        category: job.category || 'Other',
        urgency: job.urgency || 'Medium',
        budget_min: parseFloat(job.budget_min),
        budget_max: parseFloat(job.budget_max),
        budget_visible: true,
        location: job.location || null,
        due_date: job.dueDate || null,
        status: 'Open',
      }));

      // Bulk create jobs
      console.log(`[Inspection] Creating ${jobsToCreate.length} jobs from inspection ${inspectionId} (${skippedCount} skipped - missing budget)...`);
      const createdJobs = await bulkCreateJobs(jobsToCreate);

      // Update inspection status to completed
      await InspectionModel.update(inspectionId, {
        status: 'completed',
        parsed_job_count: createdJobs.length,
      });

      console.log(`[Inspection] ✓ Created ${createdJobs.length} jobs`);

      // Invalidate job caches
      await cache.delPattern('jobs:*');
      await cache.delPattern(`property:*:${inspection.property_id}*`);

      res.status(201).json({
        success: true,
        message: `Successfully created ${createdJobs.length} jobs from inspection${skippedCount > 0 ? ` (${skippedCount} skipped - missing budget)` : ''}`,
        jobs: createdJobs,
        skippedCount,
        inspection: {
          id: inspection.id,
          status: 'completed',
        },
      });
    } catch (error) {
      console.error('[Inspection] Create jobs error:', error);
      res.status(500).json({
        error: 'Server error',
        message: error.message,
      });
    }
  },

  /**
   * Get all inspections for a property
   * GET /api/inspections/property/:propertyId
   */
  async getInspectionsByProperty(req, res) {
    try {
      const { propertyId } = req.params;

      const inspections = await InspectionModel.getByPropertyId(propertyId);

      res.json({
        success: true,
        count: inspections.length,
        inspections,
      });
    } catch (error) {
      console.error('[Inspection] Get by property error:', error);
      res.status(500).json({
        error: 'Server error',
        message: error.message,
      });
    }
  },

  /**
   * Get inspection by ID with preview of parsed jobs
   * GET /api/inspections/:id/preview
   */
  async getInspectionPreview(req, res) {
    try {
      const { id } = req.params;

      const inspection = await InspectionModel.getById(id);

      if (!inspection) {
        return res.status(404).json({
          error: 'Inspection not found',
        });
      }

      // Download and re-parse the Excel file for preview
      const downloadResult = await downloadFromSupabase(
        BUCKETS.INSPECTIONS,
        inspection.file_url.split(`${BUCKETS.INSPECTIONS}/`)[1]
      );

      if (!downloadResult.success) {
        return res.status(500).json({
          error: 'Failed to download file',
          message: downloadResult.error,
        });
      }

      // Convert Blob to Buffer
      const buffer = Buffer.from(await downloadResult.data.arrayBuffer());

      // Parse Excel with AI
      const parseResult = await parseExcelWithAI(buffer);

      res.json({
        success: true,
        inspection,
        parsedData: parseResult,
      });
    } catch (error) {
      console.error('[Inspection] Preview error:', error);
      res.status(500).json({
        error: 'Server error',
        message: error.message,
      });
    }
  },

  /**
   * Get all inspections uploaded by current user
   * GET /api/inspections/my-uploads
   */
  async getMyInspections(req, res) {
    try {
      const userId = req.user.id;

      const inspections = await InspectionModel.getByUserId(userId);

      res.json({
        success: true,
        count: inspections.length,
        inspections,
      });
    } catch (error) {
      console.error('[Inspection] Get my inspections error:', error);
      res.status(500).json({
        error: 'Server error',
        message: error.message,
      });
    }
  },

  /**
   * Delete inspection
   * DELETE /api/inspections/:id
   */
  async deleteInspection(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Get inspection
      const inspection = await InspectionModel.getById(id);

      if (!inspection) {
        return res.status(404).json({
          error: 'Inspection not found',
        });
      }

      // Verify ownership
      if (inspection.uploaded_by !== userId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only delete your own inspections',
        });
      }

      // Delete file from Supabase
      const filePath = inspection.file_url.split(`${BUCKETS.INSPECTIONS}/`)[1];
      await deleteFromSupabase(BUCKETS.INSPECTIONS, filePath);

      // Delete database record
      await InspectionModel.delete(id);

      console.log(`[Inspection] ✓ Deleted inspection ${id}`);

      // Invalidate cache
      await cache.delPattern(`property:*:${inspection.property_id}*`);

      res.json({
        success: true,
        message: 'Inspection deleted successfully',
      });
    } catch (error) {
      console.error('[Inspection] Delete error:', error);
      res.status(500).json({
        error: 'Server error',
        message: error.message,
      });
    }
  },

  /**
   * Download inspection Excel template
   * GET /api/inspections/template
   * Query params:
   *   - lang: 'fr' for French (default), 'en' for English
   */
  async downloadTemplate(req, res) {
    try {
      const language = req.query.lang || 'fr'; // Default to French
      const buffer = generateInspectionTemplate(language);

      const filename = language === 'fr'
        ? 'plan-de-maintien-template.xlsx'
        : 'inspection-template.xlsx';

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

      res.send(buffer);
    } catch (error) {
      console.error('[Inspection] Template download error:', error);
      res.status(500).json({
        error: 'Server error',
        message: error.message,
      });
    }
  },

  /**
   * Get inspection statistics for a property
   * GET /api/inspections/property/:propertyId/stats
   */
  async getInspectionStats(req, res) {
    try {
      const { propertyId } = req.params;

      const stats = await InspectionModel.getStatsByProperty(propertyId);

      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      console.error('[Inspection] Stats error:', error);
      res.status(500).json({
        error: 'Server error',
        message: error.message,
      });
    }
  },
};

export default InspectionController;
