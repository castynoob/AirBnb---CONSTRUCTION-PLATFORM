import {
  createReview,
  getReviewsByReviewer,
  getReviewsByReviewedUser,
  hasUserReviewedCompletedJob,
  getReviewByJobId
} from "../models/reviewModel.js";

// POST /api/reviews
export const addReview = async (req, res) => {
  try {
    const { reviewed_user_id, job_id, rating, comment } = req.body;
    const reviewer_id = req.user.id;

    // Check if user already reviewed this completed job
    const alreadyReviewed = await hasUserReviewedCompletedJob(reviewer_id, job_id);
    if (alreadyReviewed) {
      return res.status(400).json({ message: "You already reviewed this job." });
    }

    const review = await createReview(reviewer_id, reviewed_user_id, job_id, rating, comment);
    res.status(201).json({ message: "Review created successfully", review });
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

    if (!job_id) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    const review = await getReviewByJobId(job_id);

    // ✅ Instead of 404, just return an empty array with 200 OK
    return res.status(200).json({
      review,
      message: review.length > 0 ? "Review found" : "No review found for this job",
    });
  } catch (error) {
    console.error("Error getting review by job:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

