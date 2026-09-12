import express from "express";

import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

import {
	getFaculty,
	createFaculty,
	getFacultyById,
	updateFaculty,
	deleteFaculty,
	toggleFacultyStatus,
} from "../controllers/facultyController.js";

const router = express.Router();

router.get("/", authenticate, authorize("SUPER_ADMIN", "ADMIN"), getFaculty);
router.post("/", authenticate, authorize("SUPER_ADMIN", "ADMIN"), createFaculty);
router.get("/:id", authenticate, authorize("SUPER_ADMIN", "ADMIN"), getFacultyById);
router.put("/:id", authenticate, authorize("SUPER_ADMIN", "ADMIN"), updateFaculty);
router.delete("/:id", authenticate, authorize("SUPER_ADMIN", "ADMIN"), deleteFaculty);
router.patch("/:id/status", authenticate, authorize("SUPER_ADMIN", "ADMIN"), toggleFacultyStatus);

export default router;
