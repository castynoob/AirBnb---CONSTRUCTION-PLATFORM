import {
  createReview,
  getReviewsByReviewer,
  getReviewsByReviewedUser,
  hasUserReviewedCompletedJob,
  getReviewByJobId
} from "../models/reviewModel.js";
import pool from "../config/db.js";
import { uploadToSupabase, deleteFromSupabase, getPublicUrl, extractFilePathFromUrl, generateUniqueFileName } from '../utils/supabaseHelpers.js';
import { BUCKETS } from '../config/supabase.js';

// POST /api/reviews
export const addReview = async (req, res) => {
  try {
    const { reviewed_user_id, job_id, rating, comment, rating_quality, rating_timeliness, rating_communication, rating_value, image_types } = req.body;
    const reviewer_id = req.user.id;
    const files = req.files || [];

    // Validate required fields
    if (!reviewed_user_id || !job_id || !rating || !comment) {
      return res.status(400).json({
        message: "Missing required fields: reviewed_user_id, job_id, rating, and comment are required"
      });
    }

    // Validate rating range
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    // Validate category ratings if provided
    const categoryRatings = {};
    for (const key of ['rating_quality', 'rating_timeliness', 'rating_communication', 'rating_value']) {
      const val = Number(req.body[key]);
      if (val && (val < 1 || val > 5)) {
        return res.status(400).json({ message: `${key} must be between 1 and 5` });
      }
      if (val) categoryRatings[key] = val;
    }

    // Parse image_types JSON if provided
    let parsedImageTypes = [];
    try {
      parsedImageTypes = image_types ? JSON.parse(image_types) : [];
    } catch { parsedImageTypes = []; }

    // Verify the job exists and is completed
    // NOTE: jobs.entrepreneur_id stores USER ID (not entrepreneur_profiles.id)
    const jobCheck = await pool.query(
      `SELECT j.id, j.status, j.manager_id, j.entrepreneur_id,
              j.entrepreneur_id as entrepreneur_user_id,
              mp.user_id as manager_user_id
       FROM jobs j
       LEFT JOIN manager_profiles mp ON j.manager_id = mp.id
       WHERE j.id = $1`,
      [job_id]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ message: "Job not found" });
    }

    const job = jobCheck.rows[0];

    if (job.status !== 'completed') {
      return res.status(400).json({
        message: "You can only review completed jobs"
      });
    }

    // Verify the reviewer is part of this job (either manager or entrepreneur)
    // Convert both to strings for comparison to handle UUID type issues
    const isManager = String(job.manager_user_id) === String(reviewer_id);
    const isEntrepreneur = String(job.entrepreneur_user_id) === String(reviewer_id);

    if (!isManager && !isEntrepreneur) {
      return res.status(403).json({
        message: "You can only review jobs you're associated with"
      });
    }

    // Verify reviewed_user_id is the other party in the job
    const expectedReviewedUserId = isManager ? job.entrepreneur_user_id : job.manager_user_id;

    if (String(reviewed_user_id) !== String(expectedReviewedUserId)) {
      return res.status(400).json({
        message: "Invalid reviewed_user_id. You can only review the other party in this job.",
        expected: expectedReviewedUserId,
        received: reviewed_user_id
      });
    }

    // Check if user already reviewed this completed job
    const alreadyReviewed = await hasUserReviewedCompletedJob(reviewer_id, job_id);
    if (alreadyReviewed) {
      return res.status(400).json({ message: "You have already reviewed this job" });
    }

    // Create review with category ratings
    const review = await createReview(reviewer_id, reviewed_user_id, job_id, rating, comment, categoryRatings);

    // Upload images if any (with before/after type support)
    const uploadedImages = [];
    if (files.length > 0) {
      for (let idx = 0; idx < files.length; idx++) {
        const file = files[idx];
        const imageType = parsedImageTypes[idx] || 'general';
        try {
          const uniqueFileName = generateUniqueFileName(file.originalname);
          const filePath = `reviews/${review.id}/${uniqueFileName}`;

          const uploadResult = await uploadToSupabase({
            fileBuffer: file.buffer,
            bucket: BUCKETS.REVIEW_IMAGES,
            filePath: filePath,
            contentType: file.mimetype,
            upsert: false,
          });

          if (uploadResult.success) {
            const imageUrl = getPublicUrl(BUCKETS.REVIEW_IMAGES, uploadResult.data.path);

            const imageResult = await pool.query(
              `INSERT INTO images (review_id, image_url, uploaded_by, image_type, created_at)
               VALUES ($1, $2, $3, $4, NOW())
               RETURNING *`,
              [review.id, imageUrl, reviewer_id, imageType]
            );

            uploadedImages.push(imageResult.rows[0]);
          }
        } catch (uploadError) {
          console.error("Error uploading review image:", uploadError);
        }
      }
    }

    res.status(201).json({
      message: "Review created successfully",
      review: {
        ...review,
        images: uploadedImages
      }
    });
  } catch (error) {
    console.error("Error adding review:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// GET /api/reviews/reviewer/:reviewer_id
export const getReviewsSubmitted = async (req, res) => {
  try {
    const { reviewer_id } = req.params;
    const reviews = await getReviewsByReviewer(reviewer_id);
    res.json({ reviews });
  } catch (error) {
    console.error("Error fetching submitted reviews:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// GET /api/reviews/reviewed/:reviewed_user_id
export const getReviewsReceived = async (req, res) => {
  try {
    const { reviewed_user_id } = req.params;
    const reviews = await getReviewsByReviewedUser(reviewed_user_id);
    res.json({ reviews });
  } catch (error) {
    console.error("Error fetching received reviews:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getReviewByJob = async (req, res) => {
  try {
    const { job_id } = req.params;
    const reviewer_id = req.user.id; // Get current user ID from token

    if (!job_id) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    // Get all reviews for this job
    const allReviews = await getReviewByJobId(job_id);

    // Review written BY the current user
    const userReview = allReviews.filter(review => String(review.reviewer_id) === String(reviewer_id));
    // Review written ABOUT the current user (received)
    const receivedReview = allReviews.filter(review => String(review.reviewed_id) === String(reviewer_id));

    console.log(`📝 Get Review: Job ${job_id} - User ${reviewer_id} - Written: ${userReview.length}, Received: ${receivedReview.length}`);

    return res.status(200).json({
      review: userReview,
      receivedReview: receivedReview,
      message: userReview.length > 0 ? "Review found" : "No review found for this job",
    });
  } catch (error) {
    console.error("Error getting review by job:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

