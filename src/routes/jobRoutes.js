import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { createJob, getAllJobs } from "../controllers/jobController.js";

const router = express.Router();

router.post("/", verifyToken, authorizeRoles("manager"), createJob);
router.get("/", verifyToken, getAllJobs);

export default router;
