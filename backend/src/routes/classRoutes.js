import express from "express";

import {
  getClasses,
  createClass,
  getClassDetails,
  updateClass,
  deleteClass,
} from "../controllers/classController.js";

import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get("/", authenticate, authorize("SUPER_ADMIN", "ADMIN", "FACULTY"), getClasses);
router.post("/", authenticate, authorize("SUPER_ADMIN", "ADMIN"), createClass);
router.put("/:id", authenticate, authorize("SUPER_ADMIN", "ADMIN"), updateClass);
router.delete("/:id", authenticate, authorize("SUPER_ADMIN", "ADMIN"), deleteClass);

router.get("/:id", authenticate, authorize("FACULTY"), getClassDetails);

export default router;
