// ✅ src/routes/registrationRoutes.js
import express from "express";
// SUPPLIER TEMPORARILY DISABLED — add registerSupplier back to re-enable
import { registerEntrepreneur, registerManager, registerResident, checkDuplicates, checkEmailExists } from "../controllers/registrationController.js";
import { validateRegistration } from "../middleware/validationMiddleware.js";
import { validateRBQEndpoint } from "../controllers/rbqController.js";

const router = express.Router();

router.post("/register/entrepreneur", validateRegistration, registerEntrepreneur);
router.post("/register/manager", validateRegistration, registerManager);
// SUPPLIER TEMPORARILY DISABLED — uncomment to re-enable
// router.post("/register/supplier", validateRegistration, registerSupplier);
router.post("/register/resident", registerResident);

// Check for duplicate license number or phone
router.post("/register/check-duplicates", checkDuplicates);

// Check if email already has an account (for multi-role registration)
router.post("/register/check-email", checkEmailExists);

// Live RBQ (Quebec construction) license lookup — used by the registration
// form to give the contractor feedback as they type. See rbqValidationService.
router.post("/register/validate-rbq", validateRBQEndpoint);

export default router;
