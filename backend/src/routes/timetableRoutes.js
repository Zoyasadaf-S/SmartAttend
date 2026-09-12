import express from "express";

import {
  getTimetable,
  createTimetable,
  updateTimetable,
  deleteTimetable,
} from "../controllers/timetableController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get("/", authenticate, authorize("SUPER_ADMIN", "ADMIN", "FACULTY", "STUDENT"), getTimetable);
router.post("/", authenticate, authorize("SUPER_ADMIN", "ADMIN"), createTimetable);
router.put("/:id", authenticate, authorize("SUPER_ADMIN", "ADMIN"), updateTimetable);
router.delete("/:id", authenticate, authorize("SUPER_ADMIN", "ADMIN"), deleteTimetable);

export default router;
