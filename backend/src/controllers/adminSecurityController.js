import { db } from "../prisma/db.js";
import bcrypt from "bcryptjs";
import { recordAudit } from "../utils/audit.js";
import { isHod, isSuperAdmin } from "../utils/rbac.js";

export const getAdminMe = async (req, res) => {
  try {
    const users = await db.orm.public.User.where({ id: Number(req.user.id) }).all();
    const user = users[0];
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    let department = null;
    if (user.departmentId) {
      const departments = await db.orm.public.Department.where({ id: Number(user.departmentId) }).all();
      department = departments[0] ?? null;
    }
    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
        department: department ? { id: department.id, name: department.name, code: department.code } : null,
        isActive: user.isActive,
        mustChangePassword: Boolean(user.mustChangePassword),
        isDeveloperAccount: user.isDeveloperAccount === true,
      },
    });
  } catch (error) {
    console.error("Admin me error:", error);
    return res.status(500).json({ success: false, message: "Failed to load admin profile" });
  }
};

export const getAdminUsers = async (req, res) => {
  try {
    const users = await db.orm.public.User.all();
    const scoped = isHod(req.user)
      ? users.filter((user) => Number(user.departmentId) === Number(req.user.departmentId))
      : users.filter((user) => user.isDeveloperAccount !== true);
    const visible = scoped.filter((user) => ["ADMIN", "SUPER_ADMIN", "FACULTY"].includes(user.role));
    return res.status(200).json({
      success: true,
      data: visible.map(({ passwordHash, ...user }) => user),
    });
  } catch (error) {
    console.error("Admin users error:", error);
    return res.status(500).json({ success: false, message: "Failed to load admin users" });
  }
};

export const createAdminUser = async (req, res) => {
  try {
    const { name, email, password, role, departmentId } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: "Name, email, password, and role are required" });
    }

    const allowedRoles = isSuperAdmin(req.user) ? ["SUPER_ADMIN", "ADMIN", "FACULTY"] : ["ADMIN", "FACULTY"];
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ success: false, message: "You cannot create that role" });
    }

    const resolvedDepartmentId = isHod(req.user)
      ? Number(req.user.departmentId)
      : departmentId === undefined || departmentId === null || role === "SUPER_ADMIN"
        ? role === "SUPER_ADMIN" ? null : Number(departmentId)
        : Number(departmentId);

    if (role !== "SUPER_ADMIN" && !Number.isInteger(resolvedDepartmentId)) {
      return res.status(400).json({ success: false, message: "departmentId is required for ADMIN and FACULTY accounts" });
    }
    if (isHod(req.user) && Number(resolvedDepartmentId) !== Number(req.user.departmentId)) {
      return res.status(403).json({ success: false, message: "HODs can create accounts only in their own department" });
    }
    if (String(password).length < 12) {
      return res.status(400).json({ success: false, message: "Password must contain at least 12 characters" });
    }

    const users = await db.orm.public.User.all();
    const normalizedEmail = String(email).trim().toLowerCase();
    if (users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
      return res.status(409).json({ success: false, message: "Email already exists" });
    }

    if (resolvedDepartmentId) {
      const departments = await db.orm.public.Department.all();
      if (!departments.some((department) => department.id === resolvedDepartmentId)) {
        return res.status(404).json({ success: false, message: "Department not found" });
      }
    }

    const user = await db.orm.public.User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(String(password), 12),
      role,
      departmentId: resolvedDepartmentId,
      isActive: true,
      mustChangePassword: true,
    });
    const { passwordHash, ...safeUser } = user;
    await recordAudit(req, "CREATE", "USER", user.id, { role: user.role, departmentId: user.departmentId });
    return res.status(201).json({ success: true, message: "User created successfully", data: safeUser });
  } catch (error) {
    console.error("Admin user creation error:", error);
    return res.status(500).json({ success: false, message: "Failed to create admin user" });
  }
};

export const updateAdminUser = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const users = await db.orm.public.User.all();
    const target = users.find((user) => user.id === userId);
    if (!target) return res.status(404).json({ success: false, message: "User not found" });
    if (target.role === "SUPER_ADMIN" && !isSuperAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "SUPER_ADMIN accounts cannot be reassigned through this endpoint" });
    }
    if (isHod(req.user) && Number(target.departmentId) !== Number(req.user.departmentId)) {
      return res.status(403).json({ success: false, message: "You cannot manage users from another department" });
    }

    const departmentId = req.body.departmentId === undefined ? target.departmentId : Number(req.body.departmentId);
    if (target.role !== "SUPER_ADMIN" && req.body.departmentId !== undefined && !Number.isInteger(departmentId)) {
      return res.status(400).json({ success: false, message: "Valid department is required" });
    }
    if (isHod(req.user) && Number(departmentId) !== Number(req.user.departmentId)) {
      return res.status(403).json({ success: false, message: "HODs cannot reassign users to another department" });
    }
    if (departmentId) {
      const departments = await db.orm.public.Department.all();
      if (!departments.some((department) => department.id === departmentId)) {
        return res.status(404).json({ success: false, message: "Department not found" });
      }
    }
    const role = req.body.role === undefined ? target.role : req.body.role;
    const allowedRoles = isSuperAdmin(req.user) ? ["SUPER_ADMIN", "ADMIN", "FACULTY"] : ["ADMIN", "FACULTY"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: "That role cannot be assigned" });
    }
    const updated = await db.orm.public.User.where({ id: userId }).update({
      ...(req.body.name === undefined ? {} : { name: String(req.body.name).trim() }),
      departmentId: role === "SUPER_ADMIN" ? null : departmentId,
      role,
    });
    await recordAudit(req, "UPDATE", "USER", userId, { role, departmentId: updated.departmentId });
    return res.status(200).json({ success: true, message: "User updated successfully", data: { ...updated, passwordHash: undefined } });
  } catch (error) {
    console.error("Admin user update error:", error);
    return res.status(500).json({ success: false, message: "Failed to update admin user" });
  }
};

export const toggleAdminUserStatus = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") return res.status(400).json({ success: false, message: "isActive must be boolean" });
    const users = await db.orm.public.User.all();
    const target = users.find((user) => user.id === userId);
    if (!target) return res.status(404).json({ success: false, message: "User not found" });
    if (target.role === "SUPER_ADMIN" && !isSuperAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "SUPER_ADMIN accounts cannot be changed through this endpoint" });
    }
    if (isHod(req.user) && Number(target.departmentId) !== Number(req.user.departmentId)) {
      return res.status(403).json({ success: false, message: "You cannot manage users from another department" });
    }
    await db.orm.public.User.where({ id: userId }).update({
      isActive,
      sessionVersion: Number(target.sessionVersion || 0) + 1,
    });
    await recordAudit(req, isActive ? "ACTIVATE" : "DEACTIVATE", "USER", userId);
    return res.status(200).json({ success: true, message: `User ${isActive ? "activated" : "deactivated"} successfully`, data: { userId, isActive } });
  } catch (error) {
    console.error("Admin user status error:", error);
    return res.status(500).json({ success: false, message: "Failed to change user status" });
  }
};

export const getAdminReports = async (req, res) => {
  try {
    const [students, faculty, classes, sessions, attendance] = await Promise.all([
      db.orm.public.Student.all(),
      db.orm.public.Faculty.all(),
      db.orm.public.Class.all(),
      db.orm.public.AttendanceSession.all(),
      db.orm.public.Attendance.all(),
    ]);
    const departmentId = isHod(req.user) ? Number(req.user.departmentId) : null;
    const visibleStudents = departmentId ? students.filter((item) => item.departmentId === departmentId) : students;
    const visibleFaculty = departmentId ? faculty.filter((item) => item.departmentId === departmentId) : faculty;
    const visibleClasses = departmentId ? classes.filter((item) => item.departmentId === departmentId) : classes;
    const classIds = new Set(visibleClasses.map((item) => item.id));
    const visibleSessions = sessions.filter((item) => classIds.has(item.classId));
    const sessionIds = new Set(visibleSessions.map((item) => item.id));
    const visibleAttendance = attendance.filter((item) => sessionIds.has(item.sessionId));
    return res.status(200).json({
      success: true,
      data: {
        totalStudents: visibleStudents.length,
        totalFaculty: visibleFaculty.length,
        totalClasses: visibleClasses.length,
        totalSessions: visibleSessions.length,
        totalAttendance: visibleAttendance.length,
        present: visibleAttendance.filter((item) => item.status === "PRESENT").length,
        absent: visibleAttendance.filter((item) => item.status === "ABSENT").length,
        late: visibleAttendance.filter((item) => item.status === "LATE").length,
      },
    });
  } catch (error) {
    console.error("Admin reports error:", error);
    return res.status(500).json({ success: false, message: "Failed to load reports" });
  }
};

export const getAdminAuditLogs = async (req, res) => {
  try {
    const [logs, users] = await Promise.all([db.orm.public.AuditLog.all(), db.orm.public.User.all()]);
    const userById = new Map(users.map((user) => [user.id, user]));
    const visible = logs.filter((log) => {
      const actor = userById.get(log.actorUserId);
      if (actor?.isDeveloperAccount) return false;
      if (isHod(req.user)) return Number(actor?.departmentId) === Number(req.user.departmentId);
      return log.visibility !== "INTERNAL";
    });
    return res.status(200).json({
      success: true,
      data: visible.map((log) => ({
        ...log,
        actorEmail: userById.get(log.actorUserId)?.email ?? null,
        actorName: userById.get(log.actorUserId)?.name ?? null,
      })),
    });
  } catch (error) {
    console.error("Admin audit log error:", error);
    return res.status(500).json({ success: false, message: "Failed to load audit logs" });
  }
};
