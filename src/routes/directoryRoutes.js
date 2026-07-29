// =============================================================================
// Specialist Directory routes
// =============================================================================
// Public — no authentication middleware. This is the "browse contractors"
// surface anyone (logged in or not, including search engines) can hit.
// =============================================================================

import express from "express";
import { listDirectory } from "../controllers/directoryController.js";

const router = express.Router();

router.get("/entrepreneurs", listDirectory);

export default router;
