// ✅ src/routes/registrationRoutes.js
import express from "express";
import { registerEntrepreneur, registerManager } from "../controllers/registrationController.js";
import { validateRegistration } from "../middleware/validationMiddleware.js";

const router = express.Router();

router.post("/register/entrepreneur", validateRegistration, registerEntrepreneur);
router.post("/register/manager", validateRegistration, registerManager);

export default router;
