import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { corsOrigins } from "./config/env.js";
import departmentRoutes from "./routes/departmentRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import facultyRoutes from "./routes/facultyRoutes.js";
import subjectRoutes from "./routes/subjectRoutes.js";
import classRoutes from "./routes/classRoutes.js";
import enrollmentRoutes from "./routes/enrollmentRoutes.js";
import timetableRoutes from "./routes/timetableRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import studentApiRoutes from "./routes/studentApiRoutes.js";
import facultyApiRoutes from "./routes/facultyApiRoutes.js";
import studentDeviceRoutes from "./routes/studentDeviceRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

const app = express();

app.use(
  cors({
    origin: corsOrigins(),
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => {
  res.json({
    message: "SmartAttend Backend is running",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

const healthResponse = (req, res) => {
  res.status(200).json({
    success: true,
    status: "OK",
    message: "SmartAttend API is healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    databaseConfigured: Boolean(process.env.DATABASE_URL),
  });
};

app.get("/health", healthResponse);
app.get("/api/health", healthResponse);

app.use("/api/departments", departmentRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/faculty", facultyApiRoutes);
app.use("/api/faculty", facultyRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/student", studentApiRoutes);
app.use("/api/student", studentDeviceRoutes);

app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

export default app;
