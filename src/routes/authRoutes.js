import express from "express";
import { register, login } from "../controllers/authController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { getProfile } from "../controllers/userController.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/protected", verifyToken, (req, res) => {
  res.json({
    message: "Protected route accessed!",
    user: req.user
  });
});
export default router;
