// src/routes/jobRoutes.js
import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
  createJob,
  getAllJobs,
  getJobById,
  updateJob,
  deleteJob,
} from "../controllers/jobController.js";

const router = express.Router();

// Everyone logged in can view jobs
router.get("/", verifyToken, getAllJobs);
router.get("/:id", verifyToken, getJobById);

// Property managers only — create, update, delete jobs
router.post("/", verifyToken, authorizeRoles("property_manager"), createJob);  // ← Fixed
router.put("/:id", verifyToken, authorizeRoles("property_manager"), updateJob);  // ← Fixed
router.delete("/:id", verifyToken, authorizeRoles("property_manager"), deleteJob);  // ← Fixed

export default router;