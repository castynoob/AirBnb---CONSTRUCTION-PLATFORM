// =============================================================================
// Property ↔ Resident roster routes.
//   PM surface     — mounted at /api/properties/:propertyId/residents
//   Resident inbox — mounted at /api/residents/invites
// =============================================================================

import express from "express";
import {
  listResidents,
  inviteResident,
  cancelInvite,
  removeResident,
  listMyInvites,
  acceptInvite,
  declineInvite,
  searchResidents,
  downloadImportTemplate,
  bulkImportResidents,
} from "../controllers/propertyResidentController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { uploadExcel, handleUploadError } from "../middleware/uploadMiddleware.js";

// PM-side router — nested under a specific property id (mergeParams so the
// controller sees :propertyId).
export const pmRouter = express.Router({ mergeParams: true });
pmRouter.get(   "/",                      authenticateToken, authorizeRoles("property_manager"), listResidents);
pmRouter.get(   "/import-template",       authenticateToken, authorizeRoles("property_manager"), downloadImportTemplate);
pmRouter.post(  "/bulk-import",           authenticateToken, authorizeRoles("property_manager"), uploadExcel, handleUploadError, bulkImportResidents);
pmRouter.post(  "/invite",                authenticateToken, authorizeRoles("property_manager"), inviteResident);
pmRouter.delete("/invites/:inviteId",     authenticateToken, authorizeRoles("property_manager"), cancelInvite);
pmRouter.delete("/:userId",               authenticateToken, authorizeRoles("property_manager"), removeResident);

// Standalone PM router — search residents for the invite autocomplete.
// Mounted at /api/residents/search in server.js.
export const searchRouter = express.Router();
searchRouter.get("/", authenticateToken, authorizeRoles("property_manager"), searchResidents);

// Resident-side router.
export const residentRouter = express.Router();
residentRouter.get( "/mine",              authenticateToken, authorizeRoles("resident"), listMyInvites);
residentRouter.post("/:inviteId/accept",  authenticateToken, authorizeRoles("resident"), acceptInvite);
residentRouter.post("/:inviteId/decline", authenticateToken, authorizeRoles("resident"), declineInvite);
