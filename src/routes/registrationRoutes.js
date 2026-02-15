// ✅ src/routes/registrationRoutes.js
import express from "express";
// SUPPLIER TEMPORARILY DISABLED — add registerSupplier back to re-enable
import { registerEntrepreneur, registerManager, registerResident, checkDuplicates  } from "../controllers/registrationController.js";
import { validateRegistration } from "../middleware/validationMiddleware.js";

const router = express.Router();

router.post("/register/entrepreneur", validateRegistration, registerEntrepreneur);
router.post("/register/manager", validateRegistration, registerManager);
// SUPPLIER TEMPORARILY DISABLED — uncomment to re-enable
// router.post("/register/supplier", validateRegistration, registerSupplier);
router.post("/register/resident", registerResident);

// Check for duplicate license number or phone
router.post("/register/check-duplicates", checkDuplicates);

export default router;
