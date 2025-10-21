// ✅ src/controllers/jobController.js (ESM version)
import * as Job from "../models/jobModel.js";
import pool from "../config/db.js";
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
    const updatedJob = await Job.updateJob(req.params.id, req.body);
    if (!updatedJob) return res.status(404).json({ message: "Job not found" });
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
      `SELECT id FROM manager_profiles WHERE id = $1`,
      [manager_id]
    );

    if (!managerExists.rows[0]) {
      return res.status(404).json({ message: "Manager profile not found" });
    }

    const jobs = await Job.getJobsByManagerId(manager_id);
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