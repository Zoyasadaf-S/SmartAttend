import express from "express";
import {
  getDepartments,
  createDepartment,
} from "../controllers/departmentController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get("/", authenticate, authorize("SUPER_ADMIN", "ADMIN", "FACULTY"), getDepartments);
router.post("/", authenticate, authorize("SUPER_ADMIN"), createDepartment);

export default router;
