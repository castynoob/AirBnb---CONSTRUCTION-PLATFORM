import InspectionModel from '../models/inspectionModel.js';
import { uploadToSupabase, deleteFromSupabase, getPublicUrl, downloadFromSupabase } from '../utils/supabaseHelpers.js';
import { parseInspectionExcel, parseMaintenanceExcel, generateInspectionTemplate, validateExcelStructure } from '../utils/excelParser.js';
import { BUCKETS } from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import * as cache from '../config/cache.js';
import * as XLSX from 'xlsx';

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

      // Validate Excel structure first
      const validation = validateExcelStructure(req.file.buffer);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid Excel format',
          message: validation.error,
          suggestion: validation.suggestion,
          detectedColumns: validation.detectedColumns,
        });
      }

      // Parse Excel file - Auto-detect template type
      console.log(`[Inspection] Parsing Excel for property ${property_id}...`);

      // Detect template type by checking columns
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(worksheet);
      const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
      const headerStr = headers.join('|').toLowerCase();

      // Check if it's a maintenance template (English or French)
      // Supports: Uniformat Code, Component, Type of Work, and French equivalents
      const isMaintenanceTemplate =
        headerStr.includes('uniformat') ||
        headerStr.includes('component') ||
        headerStr.includes('composant') ||
        headerStr.includes('type of work') ||
        headerStr.includes('type de travaux') ||
        headerStr.includes('élément') ||
        headerStr.includes('element') ||
        headerStr.includes('ouvrage') ||
        headerStr.includes('intervention') ||
        headerStr.includes('plan de maintien') ||
        headerStr.includes('carnet') ||
        headerStr.includes('entretien');

      console.log(`[Inspection] Template type: ${isMaintenanceTemplate ? 'Maintenance Plan' : 'Standard Inspection'}`);

      // Use appropriate parser
      const parseResult = isMaintenanceTemplate
        ? parseMaintenanceExcel(req.file.buffer)
        : parseInspectionExcel(req.file.buffer);

      if (!parseResult.success && parseResult.success !== undefined) {
        return res.status(400).json({
          error: 'Failed to parse Excel',
          message: parseResult.error,
        });
      }

      if (parseResult.jobs.length === 0) {
        return res.status(400).json({
          error: 'No valid jobs found',
          message: 'The Excel file does not contain any valid job data',
          errors: parseResult.errors,
        });
      }

      // Upload file to Supabase
      const fileName = `${uuidv4()}-${req.file.originalname}`;
      const filePath = `${property_id}/${fileName}`;

      const uploadResult = await uploadToSupabase({
        fileBuffer: req.file.buffer,
        bucket: BUCKETS.INSPECTIONS,
        filePath,
        contentType: req.file.mimetype,
        upsert: false,
      });

      if (!uploadResult.success) {
        return res.status(500).json({
          error: 'Failed to upload file',
          message: uploadResult.error,
        });
      }

      // Get file URL
      const fileUrl = getPublicUrl(BUCKETS.INSPECTIONS, uploadResult.data.path);

      // Store inspection record in database
      const inspection = await InspectionModel.create({
        property_id,
        file_url: fileUrl,
        file_name: req.file.originalname,
        file_size: req.file.size,
        file_type: req.file.mimetype,
        uploaded_by: userId,
        parsed_job_count: parseResult.jobs.length,
        status: 'parsed', // Successfully parsed
      });

      console.log(`[Inspection] ✓ Upload complete - ${parseResult.jobs.length} jobs parsed`);

      // Invalidate property cache
      await cache.delPattern(`property:*:${property_id}*`);

      res.status(201).json({
        success: true,
        message: `Successfully uploaded inspection. Found ${parseResult.jobs.length} jobs.`,
        inspection: {
          id: inspection.id,
          property_id: inspection.property_id,
          file_name: inspection.file_name,
          file_url: inspection.file_url,
          uploaded_at: inspection.uploaded_at,
          status: inspection.status,
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
      });
    } catch (error) {
      console.error('[Inspection] Upload error:', error);
      res.status(500).json({
        error: 'Server error',
        message: error.message,
      });
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

      // Prepare jobs for creation
      const jobsToCreate = jobsData.map((job) => ({
        property_id: inspection.property_id,
        manager_id: property.manager_id, // Use property's manager, not the uploader
        title: job.title,
        description: job.description || '',
        category: job.category || 'Other',
        urgency: job.urgency || 'Medium',
        budget_min: job.budget ? job.budget * 0.8 : null, // 20% range
        budget_max: job.budget ? job.budget * 1.2 : null,
        budget_visible: job.budget ? true : false,
        location: job.location || null,
        due_date: job.dueDate || null,
        status: 'Open',
      }));

      // Bulk create jobs
      console.log(`[Inspection] Creating ${jobsToCreate.length} jobs from inspection ${inspectionId}...`);
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
        message: `Successfully created ${createdJobs.length} jobs from inspection`,
        jobs: createdJobs,
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

      // Parse Excel
      const parseResult = parseInspectionExcel(buffer);

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
