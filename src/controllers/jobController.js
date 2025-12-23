// ✅ src/controllers/jobController.js (ESM version)
import * as Job from "../models/jobModel.js";
import pool from "../config/db.js";
import { uploadToSupabase, deleteFromSupabase, getPublicUrl, extractFilePathFromUrl, generateUniqueFileName } from '../utils/supabaseHelpers.js';
import { BUCKETS } from '../config/supabase.js';
import { getIO } from "../config/socketSetup.js";
// 🟢 Create new job (manager only)
export const createJob = async (req, res) => {
  try {
    // Get manager profile ID from user ID
    const managerProfile = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [req.user.id]
    );

    if (!managerProfile.rows[0]) {
      return res.status(403).json({ 
        message: "Property manager profile not found. Please complete your profile first." 
      });
    }

    const manager_id = managerProfile.rows[0].id;
    const jobData = { ...req.body, manager_id };

    const newJob = await Job.createJob(jobData);
    res.status(201).json({ message: "Job created successfully", job: newJob });
  } catch (err) {
    console.error("❌ Error creating job:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🟡 Get all jobs
export const getAllJobs = async (req, res) => {
  try {
    const jobs = await Job.getAllJobs();
    res.json(jobs);
  } catch (err) {
    console.error("❌ Error fetching jobs:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔵 Get one job by ID
export const getJobById = async (req, res) => {
  try {
    const job = await Job.getJobById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json(job);
  } catch (err) {
    console.error("❌ Error fetching job by ID:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🟣 Update job
export const updateJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    const updateFields = req.body;

    // Get current job status before update to detect status changes
    const currentJob = await Job.getJobById(jobId);
    if (!currentJob) {
      return res.status(404).json({ message: "Job not found" });
    }

    const previousStatus = currentJob.status;
    const updatedJob = await Job.updateJob(jobId, updateFields);

    if (!updatedJob) {
      return res.status(404).json({ message: "Job not found" });
    }

    // 🔔 Send socket notifications for status changes
    if (updateFields.status && updateFields.status !== previousStatus) {
      try {
        const io = getIO();
        if (io) {
          // Get job details with property and users info
          const jobDetails = await pool.query(
            `SELECT j.title, j.manager_id, j.entrepreneur_id,
                    p.building_name,
                    mu.id as manager_user_id,
                    eu.id as entrepreneur_user_id,
                    eu.first_name as entrepreneur_first_name,
                    eu.last_name as entrepreneur_last_name
             FROM jobs j
             LEFT JOIN properties p ON j.property_id = p.id
             LEFT JOIN manager_profiles mp ON j.manager_id = mp.id
             LEFT JOIN users mu ON mp.user_id = mu.id
             LEFT JOIN entrepreneur_profiles ep ON j.entrepreneur_id = ep.id
             LEFT JOIN users eu ON ep.user_id = eu.id
             WHERE j.id = $1`,
            [jobId]
          );

          if (jobDetails.rows[0]) {
            const job = jobDetails.rows[0];
            const contractorName = job.entrepreneur_first_name && job.entrepreneur_last_name
              ? `${job.entrepreneur_first_name} ${job.entrepreneur_last_name}`
              : 'Contractor';

            // Notify manager when job status changes to "in_progress"
            if (updateFields.status.toLowerCase() === 'in_progress' && job.manager_user_id) {
              io.to(job.manager_user_id.toString()).emit('job_started', {
                jobId: jobId,
                jobTitle: job.title,
                propertyName: job.building_name || '',
                contractorName: contractorName,
                contractorId: job.entrepreneur_id,
              });
              console.log('🔔 job_started notification sent to manager:', job.manager_user_id);
            }

            // Notify manager when job status changes to "completed"
            if (updateFields.status.toLowerCase() === 'completed' && job.manager_user_id) {
              io.to(job.manager_user_id.toString()).emit('work_completed', {
                jobId: jobId,
                jobTitle: job.title,
                propertyName: job.building_name || '',
                contractorName: contractorName,
                contractorId: job.entrepreneur_id,
              });
              console.log('🔔 work_completed notification sent to manager:', job.manager_user_id);
            }
          }
        }
      } catch (notifyError) {
        // Don't fail the update if notification fails
        console.error('⚠️ Failed to send job status notification:', notifyError.message);
      }
    }

    res.json({ message: "Job updated successfully", job: updatedJob });
  } catch (err) {
    console.error("❌ Error updating job:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔴 Delete job
export const deleteJob = async (req, res) => {
  try {
    await Job.deleteJob(req.params.id);
    res.json({ message: "Job deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting job:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🟠 Get all jobs by manager ID (accessible by any role)
export const getJobsByManagerId = async (req, res) => {
  try {
    const { manager_id } = req.params;
    
    // Verify manager exists
    const managerExists = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [manager_id]
    );

    if (!managerExists.rows[0]) {
      return res.status(404).json({ message: "Manager profile not found" });
    }

    const jobs = await Job.getJobsByManagerId(managerExists.rows[0]["id"]);
    res.json({
      message: "Jobs retrieved successfully",
      count: jobs.length,
      jobs
    });
  } catch (err) {
    console.error("❌ Error fetching jobs by manager ID:", err);
    res.status(500).json({ message: "Server error" });
  }
};


export const getJobsByEntrepreneurId = async (req, res) => {
  try {
    const { entrepreneur_id } = req.params;

    const result = await pool.query(
      `
      SELECT j.*, mp.user_id as manager_user_id
      FROM jobs j
      LEFT JOIN manager_profiles mp ON j.manager_id::uuid = mp.id::uuid
      WHERE j.entrepreneur_id = $1
      ORDER BY j.created_at DESC
      `,
      [entrepreneur_id]
    );

    res.json({
      message: "Jobs retrieved successfully",
      count: result.rows.length,
      jobs: result.rows
    });
  } catch (err) {
    console.error("❌ Error fetching jobs by entrepreneur ID:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ========================================
// 🖼️ JOB IMAGE UPLOAD FUNCTIONS
// ========================================

/**
 * Upload Job Image(s)
 * POST /api/jobs/:id/images
 *
 * Uploads job image(s) to Supabase and stores in images table
 * Supports both single and multiple image uploads
 */
export const uploadJobImages = async (req, res) => {
  try {
    const { id: jobId } = req.params;
    const userId = req.user.id;

    // Validate files exist (can be single or multiple)
    const files = req.files || (req.file ? [req.file] : []);

    if (files.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded',
        message: 'Please provide at least one image file',
      });
    }

    // Get job to verify it exists
    const job = await Job.getJobById(jobId);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Verify user has permission (manager who owns the job or entrepreneur)
    const managerProfile = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [userId]
    );

    const entrepreneurProfile = await pool.query(
      `SELECT id FROM entrepreneur_profiles WHERE user_id = $1`,
      [userId]
    );

    const isManager = managerProfile.rows.length > 0 &&
                     job.manager_id === managerProfile.rows[0].id;
    const isEntrepreneur = entrepreneurProfile.rows.length > 0;

    if (!isManager && !isEntrepreneur) {
      return res.status(403).json({
        message: "You don't have permission to upload images for this job"
      });
    }

    const uploadedImages = [];
    const errors = [];

    // Upload each file
    for (const file of files) {
      try {
        // Generate unique filename
        const uniqueFileName = generateUniqueFileName(file.originalname);
        const filePath = `jobs/${jobId}/${uniqueFileName}`;

        // Upload to Supabase
        const uploadResult = await uploadToSupabase({
          fileBuffer: file.buffer,
          bucket: BUCKETS.JOB_IMAGES,
          filePath: filePath,
          contentType: file.mimetype,
          upsert: false,
        });

        if (!uploadResult.success) {
          errors.push({
            filename: file.originalname,
            error: uploadResult.error
          });
          continue;
        }

        // Get public URL
        const imageUrl = getPublicUrl(BUCKETS.JOB_IMAGES, uploadResult.data.path);

        // Insert into images table
        const imageResult = await pool.query(
          `INSERT INTO images (job_id, image_url, uploaded_by, caption, created_at)
           VALUES ($1, $2, $3, $4, NOW())
           RETURNING *`,
          [jobId, imageUrl, userId, req.body.caption || null]
        );

        uploadedImages.push(imageResult.rows[0]);

      } catch (error) {
        errors.push({
          filename: file.originalname,
          error: error.message
        });
      }
    }

    console.log(`[Upload] ✓ Job images uploaded: ${uploadedImages.length} successful, ${errors.length} failed`);

    res.status(200).json({
      message: `Successfully uploaded ${uploadedImages.length} image(s)`,
      images: uploadedImages,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('[Upload] Job images error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get Job Images
 * GET /api/jobs/:id/images
 *
 * Retrieves all images for a specific job
 */
export const getJobImages = async (req, res) => {
  try {
    const { id: jobId } = req.params;

    // Verify job exists
    const job = await Job.getJobById(jobId);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Get all images for this job
    const result = await pool.query(
      `SELECT i.*, u.first_name, u.last_name, u.email
       FROM images i
       LEFT JOIN users u ON i.uploaded_by = u.id
       WHERE i.job_id = $1
       ORDER BY i.created_at DESC`,
      [jobId]
    );

    res.status(200).json({
      message: 'Job images retrieved successfully',
      count: result.rows.length,
      images: result.rows,
    });

  } catch (error) {
    console.error('[Upload] Get job images error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Delete Job Image
 * DELETE /api/jobs/:jobId/images/:imageId
 *
 * Deletes a specific job image from Supabase and database
 */
export const deleteJobImage = async (req, res) => {
  try {
    const { jobId, imageId } = req.params;
    const userId = req.user.id;

    // Get image details
    const imageResult = await pool.query(
      `SELECT * FROM images WHERE id = $1 AND job_id = $2`,
      [imageId, jobId]
    );

    if (imageResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Image not found'
      });
    }

    const image = imageResult.rows[0];

    // Verify user has permission (uploader, job manager, or admin)
    const managerProfile = await pool.query(
      `SELECT mp.id FROM manager_profiles mp
       JOIN jobs j ON j.manager_id = mp.id
       WHERE mp.user_id = $1 AND j.id = $2`,
      [userId, jobId]
    );

    const isUploader = image.uploaded_by === userId;
    const isJobManager = managerProfile.rows.length > 0;

    if (!isUploader && !isJobManager) {
      return res.status(403).json({
        message: "You don't have permission to delete this image"
      });
    }

    // Extract file path from URL
    const filePath = extractFilePathFromUrl(image.image_url, BUCKETS.JOB_IMAGES);

    if (filePath) {
      // Delete from Supabase
      await deleteFromSupabase(BUCKETS.JOB_IMAGES, filePath);
    }

    // Delete from database
    await pool.query(
      `DELETE FROM images WHERE id = $1`,
      [imageId]
    );

    console.log(`[Upload] ✓ Job image deleted: ${imageId}`);

    res.status(200).json({
      message: 'Image deleted successfully',
    });

  } catch (error) {
    console.error('[Upload] Delete job image error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};
