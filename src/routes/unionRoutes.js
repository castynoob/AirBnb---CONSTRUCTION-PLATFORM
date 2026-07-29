// =============================================================================
// Union routes — mounted at /api/unions.
// =============================================================================

import express from "express";
import {
  createUnion,
  listMyUnions,
  getUnion,
  addProperty,
  removeProperty,
  createBroadcast,
  listBroadcasts,
  listBroadcastsForProperty,
} from "../controllers/unionController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// PM-only writes.
router.post(  "/",                              authenticateToken, authorizeRoles("property_manager"), createUnion);
router.get(   "/mine",                          authenticateToken, authorizeRoles("property_manager"), listMyUnions);
router.post(  "/:id/properties",                authenticateToken, authorizeRoles("property_manager"), addProperty);
router.delete("/:id/properties/:propertyId",    authenticateToken, authorizeRoles("property_manager"), removeProperty);
router.post(  "/:id/broadcasts",                authenticateToken, authorizeRoles("property_manager"), createBroadcast);

// Anyone linked to the union (admin OR resident of a member property).
router.get(   "/:id",                           authenticateToken, getUnion);
router.get(   "/:id/broadcasts",                authenticateToken, listBroadcasts);

// Resident-facing feed for their property.
router.get(   "/property/:propertyId/broadcasts", authenticateToken, listBroadcastsForProperty);

export default router;
