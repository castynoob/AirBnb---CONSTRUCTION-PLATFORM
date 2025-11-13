// ✅ src/routes/registrationRoutes.js
import express from "express";
import { registerEntrepreneur, registerManager, registerSupplier, registerResident  } from "../controllers/registrationController.js";
import { validateRegistration } from "../middleware/validationMiddleware.js";

const router = express.Router();

router.post("/register/entrepreneur", validateRegistration, registerEntrepreneur);
router.post("/register/manager", validateRegistration, registerManager);
router.post("/register/supplier", validateRegistration, registerSupplier);
router.post("/register/resident", registerResident);

export default router;
