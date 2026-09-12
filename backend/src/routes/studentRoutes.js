import express from "express";

import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

import {
  getStudents,
  createStudent,
  getStudentById,
  updateStudent,
  deleteStudent,
  toggleStudentStatus,
  bulkPromoteStudents,
  importStudents,
  exportStudents,
  getStudentDashboard,
  getStudentProfile,
  getStudentSubjects,
  getStudentSubjectDetails,
  getStudentTimetable,
  getStudentAttendance,
  getStudentAttendanceHistory,
} from "../controllers/studentController.js";

const router = express.Router();

// Mobile / Student User Routes
router.get("/dashboard", authenticate, authorize("STUDENT"), getStudentDashboard);
router.get("/profile", authenticate, authorize("STUDENT"), getStudentProfile);
router.get("/subjects", authenticate, authorize("STUDENT"), getStudentSubjects);
router.get("/subjects/:id", authenticate, authorize("STUDENT"), getStudentSubjectDetails);
router.get("/timetable", authenticate, authorize("STUDENT"), getStudentTimetable);
router.get("/attendance", authenticate, authorize("STUDENT"), getStudentAttendance);
router.get("/attendance-history", authenticate, authorize("STUDENT"), getStudentAttendanceHistory);

// Admin / Web Portal Routes
router.get("/", authenticate, authorize("SUPER_ADMIN", "ADMIN"), getStudents);
router.post("/", authenticate, authorize("SUPER_ADMIN", "ADMIN"), createStudent);
router.get("/export", authenticate, authorize("SUPER_ADMIN", "ADMIN"), exportStudents);
router.post("/import", authenticate, authorize("SUPER_ADMIN", "ADMIN"), importStudents);
router.post("/bulk-promote", authenticate, authorize("SUPER_ADMIN", "ADMIN"), bulkPromoteStudents);

router.get("/:id", authenticate, authorize("SUPER_ADMIN", "ADMIN"), getStudentById);
router.put("/:id", authenticate, authorize("SUPER_ADMIN", "ADMIN"), updateStudent);
router.delete("/:id", authenticate, authorize("SUPER_ADMIN", "ADMIN"), deleteStudent);
router.patch("/:id/status", authenticate, authorize("SUPER_ADMIN", "ADMIN"), toggleStudentStatus);

export default router;
