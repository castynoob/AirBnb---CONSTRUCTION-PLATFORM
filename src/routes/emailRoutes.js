import express from "express";
import { sendEmailToAllEntrepreneurs } from "../controllers/emailController.js";

const router = express.Router();

router.post("/send-to-entrepreneurs", sendEmailToAllEntrepreneurs);

export default router;
