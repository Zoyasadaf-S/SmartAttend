import express from "express";

import { login, getMe, changePassword } from "../controllers/authController.js";

import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/login", login);

router.get("/me", authenticate, getMe);
router.post("/change-password", authenticate, changePassword);

export default router;
