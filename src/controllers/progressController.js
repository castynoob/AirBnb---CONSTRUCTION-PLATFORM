// src/controllers/progressController.js
import pool from '../config/db.js';
import {
  getProgressByJobId,
  initializeProgress,
  updateStageStatus,
  validateStage,
  addStagePhotos,
  getStagePhotos,
} from '../models/progressModel.js';
import { uploadToSupabase, generateUniqueFileName, getPublicUrl } from '../utils/supabaseHelpers.js';
import { BUCKETS } from '../config/supabase.js';

/**
 * GET /api/progress/:jobId
 * Returns all stages + their photos for a job.
 */
export const getJobProgress = async (req, res) => {
  try {
    const { jobId } = req.params;

    const stages = await getProgressByJobId(jobId);
    if (stages.length === 0) {
      return res.status(404).json({ message: 'No progress stages found for this job' });
    }

    // Attach photos to each stage
    const stagesWithPhotos = await Promise.all(
      stages.map(async (stage) => {
        const photos = await getStagePhotos(stage.id, jobId);
        return { ...stage, photos };
      })
    );

    res.json({ stages: stagesWithPhotos });
  } catch (err) {
    console.error('[Progress] Error getting job progress:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/progress/:jobId/init
 * Initialize the 5 default stages for a job. Entrepreneur only.
 */
export const initProgress = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;

    // Verify user is the entrepreneur on this job's contract
    const contractResult = await pool.query(
      `SELECT c.id FROM contracts c
       JOIN entrepreneur_profiles ep ON c.entrepreneur_id = ep.id
       WHERE c.job_id = $1 AND ep.user_id = $2 AND c.status = 'active'`,
      [jobId, userId]
    );

    if (contractResult.rows.length === 0) {
      return res.status(403).json({ message: 'Only the assigned entrepreneur can initialize progress' });
    }

    const contractId = contractResult.rows[0].id;

    // Check if stages already exist
    const existing = await getProgressByJobId(jobId);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Progress stages already initialized for this job' });
    }

    const stages = await initializeProgress(jobId, contractId);

    res.status(201).json({
      message: 'Progress stages initialized successfully',
      stages,
    });
  } catch (err) {
    console.error('[Progress] Error initializing progress:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * PUT /api/progress/stage/:stageId
 * Entrepreneur updates a stage's status and/or notes.
 */
export const updateProgress = async (req, res) => {
  try {
    const { stageId } = req.params;
    const { status, notes } = req.body;
    const userId = req.user.id;

    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    // Verify the entrepreneur owns this stage's contract
    const stageResult = await pool.query(
      `SELECT jps.*, c.entrepreneur_id
       FROM job_progress_stages jps
       JOIN contracts c ON jps.contract_id = c.id
       JOIN entrepreneur_profiles ep ON c.entrepreneur_id = ep.id
       WHERE jps.id = $1 AND ep.user_id = $2`,
      [stageId, userId]
    );

    if (stageResult.rows.length === 0) {
      return res.status(403).json({ message: 'You do not have permission to update this stage' });
    }

    const updated = await updateStageStatus(stageId, status, userId, notes || null);

    res.json({ message: 'Stage updated successfully', stage: updated });
  } catch (err) {
    console.error('[Progress] Error updating stage:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * PUT /api/progress/stage/:stageId/validate
 * Property manager validates a completed stage.
 */
export const validateProgress = async (req, res) => {
  try {
    const { stageId } = req.params;
    const userId = req.user.id;

    // Verify the manager owns the job for this stage
    const stageResult = await pool.query(
      `SELECT jps.*, j.manager_id
       FROM job_progress_stages jps
       JOIN jobs j ON jps.job_id = j.id
       JOIN manager_profiles mp ON j.manager_id = mp.id
       WHERE jps.id = $1 AND mp.user_id = $2`,
      [stageId, userId]
    );

    if (stageResult.rows.length === 0) {
      return res.status(403).json({ message: 'You do not have permission to validate this stage' });
    }

    const stage = stageResult.rows[0];
    if (stage.status !== 'completed') {
      return res.status(400).json({ message: 'Only completed stages can be validated' });
    }

    const validated = await validateStage(stageId, userId);

    res.json({ message: 'Stage validated successfully', stage: validated });
  } catch (err) {
    console.error('[Progress] Error validating stage:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/progress/stage/:stageId/photos
 * Upload photos for a progress stage.
 */
export const uploadProgressPhotos = async (req, res) => {
  try {
    const { stageId } = req.params;
    const userId = req.user.id;

    const files = req.files || (req.file ? [req.file] : []);
    if (files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    // Get stage to find the job_id
    const stageResult = await pool.query(
      `SELECT * FROM job_progress_stages WHERE id = $1`,
      [stageId]
    );

    if (stageResult.rows.length === 0) {
      return res.status(404).json({ message: 'Stage not found' });
    }

    const stage = stageResult.rows[0];
    const jobId = stage.job_id;

    // Upload each file to Supabase
    const imageUrls = [];
    const errors = [];

    for (const file of files) {
      try {
        const uniqueName = generateUniqueFileName(file.originalname);
        const filePath = `progress/${jobId}/${stageId}/${uniqueName}`;

        const uploadResult = await uploadToSupabase({
          fileBuffer: file.buffer,
          bucket: BUCKETS.JOB_IMAGES,
          filePath,
          contentType: file.mimetype,
          upsert: false,
        });

        if (!uploadResult.success) {
          errors.push({ filename: file.originalname, error: uploadResult.error });
          continue;
        }

        const url = getPublicUrl(BUCKETS.JOB_IMAGES, uploadResult.data.path);
        imageUrls.push(url);
      } catch (error) {
        errors.push({ filename: file.originalname, error: error.message });
      }
    }

    // Store image records in the images table
    const images = await addStagePhotos(stageId, jobId, imageUrls, userId);

    res.status(200).json({
      message: `Uploaded ${images.length} photo(s) successfully`,
      images,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('[Progress] Error uploading photos:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
