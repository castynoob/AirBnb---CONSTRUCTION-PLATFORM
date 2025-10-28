// ✅ src/routes/registrationRoutes.js
import express from "express";
import { registerEntrepreneur, registerManager } from "../controllers/registrationController.js";

const router = express.Router();

router.post("/register/entrepreneur", registerEntrepreneur);
router.post("/register/manager", registerManager);

export default router;
