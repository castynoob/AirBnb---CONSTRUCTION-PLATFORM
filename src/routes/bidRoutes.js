// src/routes/bidRoutes.js
import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { requireEntrepreneur } from "../middleware/roleMiddleware.js";  // ✅ ADD
import { requireSubscription, checkBidLimit } from "../middleware/subscriptionMiddleware.js";  // ✅ ADD
import {
  submitBid,
  getBidsForJob,
  getMyBids,
  approveBid,
  declineBid,
  toggleFavorite
} from "../controllers/bidController.js";

const router = express.Router();

// 🟢 Entrepreneur endpoints
router.post("/", 
  verifyToken, 
  authorizeRoles("entrepreneur"),
  requireEntrepreneur,      // ✅ ADD - Verify entrepreneur profile exists
  requireSubscription,      // ✅ ADD - Check active subscription
  checkBidLimit,           // ✅ ADD - Check 30-bid limit for basic plan
  submitBid
);

router.get("/mine", verifyToken, authorizeRoles("entrepreneur"), getMyBids);

// 🟡 Manager endpoints
router.get("/job/:job_id", verifyToken, authorizeRoles("property_manager"), getBidsForJob);
router.patch("/:id/approve", verifyToken, authorizeRoles("property_manager"), approveBid);
router.patch("/:id/decline", verifyToken, authorizeRoles("property_manager"), declineBid);
router.patch("/:id/favorite", verifyToken, authorizeRoles("property_manager"), toggleFavorite);

export default router;