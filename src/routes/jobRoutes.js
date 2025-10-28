import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
  createJob,
  getAllJobs,
  getJobById,
  getJobsByManagerId, // ← Add this import
  updateJob,
  deleteJob,
  getJobsByEntrepreneurId
} from "../controllers/jobController.js";

const router = express.Router();

// Everyone logged in can view jobs
router.get("/", verifyToken, getAllJobs);
router.get("/:id", verifyToken, getJobById);
router.get("/manager/:manager_id", verifyToken, getJobsByManagerId); // ← Add this route (accessible by any role)

// Property managers only — create, update, delete jobs
router.post("/", verifyToken, authorizeRoles("property_manager"), createJob);
router.put("/:id", verifyToken, authorizeRoles("property_manager"), updateJob);
router.delete("/:id", verifyToken, authorizeRoles("property_manager"), deleteJob);
router.get("/entrepreneur/:entrepreneur_id", verifyToken, getJobsByEntrepreneurId);


export default router;