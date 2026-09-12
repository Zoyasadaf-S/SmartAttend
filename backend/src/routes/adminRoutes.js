import express from "express";
import multer from "multer";

import {
  getAdminDashboard,
  getAdminStudents,
  createAdminStudent,
  importAdminStudents,
  assignAdminStudentDivision,
  assignAdminStudentLabBatch,
  updateAdminStudent,
  deleteAdminStudent,
  getAdminStudentDevice,
  resetAdminStudentDevice,
  exportAdminStudents,
  getAdminFaculty,
  createAdminFaculty,
  updateAdminFaculty,
  deleteAdminFaculty,
  exportAdminFaculty,
} from "../controllers/adminController.js";
import {
  getAdminMe,
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  toggleAdminUserStatus,
  getAdminReports,
  getAdminAuditLogs,
} from "../controllers/adminSecurityController.js";
import { login, changePassword } from "../controllers/authController.js";
import { getDepartments, createDepartment } from "../controllers/departmentController.js";
import { bulkPromoteStudents } from "../controllers/studentController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

const router = express.Router();
const portal = authorize("SUPER_ADMIN", "ADMIN");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post("/auth/login", (req, res, next) => {
  req.adminOnly = true;
  return login(req, res, next);
});
router.post("/auth/logout", (req, res) => {
  res.clearCookie("sa_admin_session");
  return res.status(200).json({ success: true, message: "Logged out" });
});
router.post("/auth/change-password", authenticate, changePassword);

router.get("/dashboard", authenticate, portal, getAdminDashboard);
router.get("/me", authenticate, portal, getAdminMe);
router.get("/departments", authenticate, portal, getDepartments);
router.post("/departments", authenticate, authorize("SUPER_ADMIN"), createDepartment);

router.get("/users", authenticate, authorize("SUPER_ADMIN"), getAdminUsers);
router.post("/users", authenticate, authorize("SUPER_ADMIN"), createAdminUser);
router.put("/users/:id", authenticate, authorize("SUPER_ADMIN"), updateAdminUser);
router.patch("/users/:id/status", authenticate, authorize("SUPER_ADMIN"), toggleAdminUserStatus);

router.get("/reports/summary", authenticate, portal, getAdminReports);
router.get("/audit-logs", authenticate, portal, getAdminAuditLogs);

router.get("/students", authenticate, portal, getAdminStudents);
router.post("/students", authenticate, portal, createAdminStudent);
router.post("/students/import", authenticate, portal, upload.single("file"), importAdminStudents);
router.get("/students/export", authenticate, portal, exportAdminStudents);
router.post("/students/bulk-promote", authenticate, portal, bulkPromoteStudents);
router.patch("/students/division", authenticate, portal, assignAdminStudentDivision);
router.post("/students/division", authenticate, portal, assignAdminStudentDivision);
router.post("/students/assign-division", authenticate, portal, assignAdminStudentDivision);
router.patch("/students/lab-batch", authenticate, portal, assignAdminStudentLabBatch);
router.post("/students/lab-batch", authenticate, portal, assignAdminStudentLabBatch);
router.post("/students/assign-lab-batch", authenticate, portal, assignAdminStudentLabBatch);
router.get("/students/:id/device", authenticate, portal, getAdminStudentDevice);
router.post("/students/:id/device/reset", authenticate, portal, resetAdminStudentDevice);
router.patch("/students/:id", authenticate, portal, updateAdminStudent);
router.delete("/students/:id", authenticate, portal, deleteAdminStudent);

router.get("/faculty", authenticate, portal, getAdminFaculty);
router.post("/faculty", authenticate, portal, createAdminFaculty);
router.get("/faculty/export", authenticate, portal, exportAdminFaculty);
router.patch("/faculty/:id", authenticate, portal, updateAdminFaculty);
router.delete("/faculty/:id", authenticate, portal, deleteAdminFaculty);

export default router;
