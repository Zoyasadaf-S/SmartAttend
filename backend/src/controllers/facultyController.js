import { db } from "../prisma/db.js";
import bcrypt from "bcryptjs";
import { recordAudit } from "../utils/audit.js";

const canAccessFaculty = (user, faculty) =>
  user.role === "SUPER_ADMIN" || Number(user.departmentId) === Number(faculty.departmentId);

const facultyResponse = (faculty, user, department) => ({
  ...faculty,
  name: user?.name ?? null,
  email: user?.email ?? null,
  isActive: user?.isActive ?? false,
  department: department ? { id: department.id, name: department.name, code: department.code } : null,
});

export const getFaculty = async (req, res) => {
  try {
    const [faculty, users] = await Promise.all([
      db.orm.public.Faculty.all(),
      db.orm.public.User.all(),
    ]);

    // An ADMIN is the department HOD in this application. They may only see
    // faculty in the department assigned to their account.
    const requester = users.find((item) => item.id === Number(req.user.id));
    const visibleFaculty =
      requester?.role === "ADMIN"
        ? faculty.filter((item) => item.departmentId === requester.departmentId)
        : faculty;

    const departments = await db.orm.public.Department.all();
    const search = String(req.query.search || "").trim().toLowerCase();
    const filteredFaculty = visibleFaculty.filter((item) => {
      const user = users.find((candidate) => candidate.id === item.userId);
      return !search || [item.employeeId, user?.name, user?.email]
        .some((value) => String(value || "").toLowerCase().includes(search));
    });
    const result = filteredFaculty.map((item) => facultyResponse(
      item,
      users.find((candidate) => candidate.id === item.userId),
      departments.find((candidate) => candidate.id === item.departmentId),
    ));

    res.status(200).json({
      success: true,
      data: result,
      total: result.length,
    });
  } catch (error) {
    console.error("Error fetching faculty:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch faculty",
    });
  }
};

export const getFacultyById = async (req, res) => {
  try {
    const facultyId = Number(req.params.id);
    if (!Number.isInteger(facultyId)) return res.status(400).json({ success: false, message: "Invalid faculty ID" });
    const facultyRows = await db.orm.public.Faculty.where({ id: facultyId }).all();
    const faculty = facultyRows[0];
    if (!faculty) return res.status(404).json({ success: false, message: "Faculty not found" });
    if (!canAccessFaculty(req.user, faculty)) return res.status(403).json({ success: false, message: "You are not authorized to access faculty from other departments" });
    const users = await db.orm.public.User.where({ id: faculty.userId }).all();
    const departments = await db.orm.public.Department.where({ id: faculty.departmentId }).all();
    return res.status(200).json({ success: true, data: facultyResponse(faculty, users[0], departments[0]) });
  } catch (error) {
    console.error("Error fetching faculty by ID:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch faculty" });
  }
};

export const updateFaculty = async (req, res) => {
  try {
    const facultyId = Number(req.params.id);
    const facultyRows = await db.orm.public.Faculty.where({ id: facultyId }).all();
    const faculty = facultyRows[0];
    if (!faculty) return res.status(404).json({ success: false, message: "Faculty not found" });
    if (!canAccessFaculty(req.user, faculty)) return res.status(403).json({ success: false, message: "You are not authorized to update faculty from other departments" });

    const { name, email, employeeId, departmentId } = req.body;
    const targetDepartmentId = departmentId === undefined ? faculty.departmentId : Number(departmentId);
    if (!Number.isInteger(targetDepartmentId)) return res.status(400).json({ success: false, message: "Valid department is required" });
    if (req.user.role === "ADMIN" && targetDepartmentId !== Number(req.user.departmentId)) return res.status(403).json({ success: false, message: "HODs cannot move faculty to another department" });
    const departments = await db.orm.public.Department.all();
    if (!departments.some((department) => department.id === targetDepartmentId)) return res.status(404).json({ success: false, message: "Department not found" });

    const users = await db.orm.public.User.all();
    const currentUser = users.find((user) => user.id === faculty.userId);
    const normalizedEmail = email === undefined ? currentUser?.email : String(email).trim().toLowerCase();
    const normalizedEmployeeId = employeeId === undefined ? faculty.employeeId : String(employeeId).trim().toUpperCase();
    if (!normalizedEmail || !normalizedEmployeeId) return res.status(400).json({ success: false, message: "Faculty email and employee ID are required" });
    if (users.some((user) => user.id !== faculty.userId && user.email.toLowerCase() === normalizedEmail)) return res.status(409).json({ success: false, message: "Email already exists" });
    const allFaculty = await db.orm.public.Faculty.all();
    if (allFaculty.some((item) => item.id !== facultyId && item.employeeId.toUpperCase() === normalizedEmployeeId)) return res.status(409).json({ success: false, message: "Employee ID already exists" });

    await db.orm.public.User.where({ id: faculty.userId }).update({
      ...(name === undefined ? {} : { name: String(name).trim() }),
      email: normalizedEmail,
      departmentId: targetDepartmentId,
    });
    const updatedFaculty = await db.orm.public.Faculty.where({ id: facultyId }).update({
      employeeId: normalizedEmployeeId,
      departmentId: targetDepartmentId,
    });
    const updatedUsers = await db.orm.public.User.where({ id: faculty.userId }).all();
    await recordAudit(req, "UPDATE", "FACULTY", facultyId, { departmentId: targetDepartmentId });
    return res.status(200).json({ success: true, message: "Faculty updated successfully", data: facultyResponse(updatedFaculty, updatedUsers[0], departments.find((item) => item.id === targetDepartmentId)) });
  } catch (error) {
    console.error("Error updating faculty:", error);
    return res.status(500).json({ success: false, message: "Failed to update faculty" });
  }
};

export const deleteFaculty = async (req, res) => {
  try {
    const facultyId = Number(req.params.id);
    const facultyRows = await db.orm.public.Faculty.where({ id: facultyId }).all();
    const faculty = facultyRows[0];
    if (!faculty) return res.status(404).json({ success: false, message: "Faculty not found" });
    if (!canAccessFaculty(req.user, faculty)) return res.status(403).json({ success: false, message: "You are not authorized to delete faculty from other departments" });
    const classes = await db.orm.public.Class.all();
    if (classes.some((item) => item.facultyId === facultyId)) return res.status(409).json({ success: false, message: "Faculty cannot be deleted while assigned to classes" });
    await db.orm.public.Faculty.where({ id: facultyId }).delete();
    await db.orm.public.User.where({ id: faculty.userId }).delete();
    await recordAudit(req, "DELETE", "FACULTY", facultyId, { departmentId: faculty.departmentId });
    return res.status(200).json({ success: true, message: "Faculty deleted successfully" });
  } catch (error) {
    console.error("Error deleting faculty:", error);
    return res.status(500).json({ success: false, message: "Failed to delete faculty" });
  }
};

export const toggleFacultyStatus = async (req, res) => {
  try {
    const facultyId = Number(req.params.id);
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") return res.status(400).json({ success: false, message: "isActive must be boolean" });
    const facultyRows = await db.orm.public.Faculty.where({ id: facultyId }).all();
    const faculty = facultyRows[0];
    if (!faculty) return res.status(404).json({ success: false, message: "Faculty not found" });
    if (!canAccessFaculty(req.user, faculty)) return res.status(403).json({ success: false, message: "You are not authorized to change faculty from other departments" });
    await db.orm.public.User.where({ id: faculty.userId }).update({ isActive });
    await recordAudit(req, isActive ? "ACTIVATE" : "DEACTIVATE", "FACULTY", facultyId, { departmentId: faculty.departmentId });
    return res.status(200).json({ success: true, message: `Faculty ${isActive ? "activated" : "deactivated"} successfully`, data: { facultyId, isActive } });
  } catch (error) {
    console.error("Error changing faculty status:", error);
    return res.status(500).json({ success: false, message: "Failed to change faculty status" });
  }
};

export const createFaculty = async (req, res) => {
  try {
    const { name, email, password, employeeId, departmentId } = req.body;

    if (!name || !email || !password || !employeeId || !departmentId) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedEmployeeId = String(employeeId).trim().toUpperCase();
    const requestedDepartmentId = Number(departmentId);

    if (!Number.isInteger(requestedDepartmentId)) {
      return res.status(400).json({ success: false, message: "Valid department is required" });
    }

    if (String(password).length < 12) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 12 characters",
      });
    }

    // Check email
    const users = await db.orm.public.User.all();

    const requester = users.find((user) => user.id === Number(req.user.id));

    // HODs (ADMIN) can add faculty, but only to their own department.
    if (
      requester?.role === "ADMIN" &&
      requester.departmentId !== requestedDepartmentId
    ) {
      return res.status(403).json({
        success: false,
        message: "HODs can add faculty only to their own department",
      });
    }

    if (users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    // Check employee ID
    const existingFaculty = await db.orm.public.Faculty.all();

    if (existingFaculty.some((faculty) => faculty.employeeId.toUpperCase() === normalizedEmployeeId)) {
      return res.status(409).json({
        success: false,
        message: "Employee ID already exists",
      });
    }

    // Check department
    const departments = await db.orm.public.Department.all();

    const department = departments.find(
      (dept) => dept.id === requestedDepartmentId,
    );

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create User
    const user = await db.orm.public.User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      role: "FACULTY",
      departmentId: requestedDepartmentId,
      isActive: true,
    });

    // Create Faculty
    const faculty = await db.orm.public.Faculty.create({
      userId: user.id,
      employeeId: normalizedEmployeeId,
      departmentId: requestedDepartmentId,
    });

    res.status(201).json({
      success: true,
      message: "Faculty created successfully",
      data: {
        faculty: {
          id: faculty.id,
          name: user.name,
          email: user.email,
          employeeId: faculty.employeeId,
          departmentId: faculty.departmentId,
          role: user.role,
        },
      },
    });
    await recordAudit(req, "CREATE", "FACULTY", faculty.id, { departmentId: faculty.departmentId });
  } catch (error) {
    console.error("Error creating faculty:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create faculty",
    });
  }
};

export const getFacultyDashboard = async (req, res) => {
  try {
    const userId = Number(req.user.id);

    // Find faculty profile linked to the logged-in user
    const facultyList = await db.orm.public.Faculty.all();

    const faculty = facultyList.find((item) => item.userId === userId);

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty profile not found",
      });
    }

    // Get user details
    const users = await db.orm.public.User.all();

    const user = users.find((item) => item.id === userId);

    // Get department
    const departments = await db.orm.public.Department.all();

    const department = departments.find(
      (item) => item.id === faculty.departmentId,
    );

    // Get classes handled by this faculty
    const classes = await db.orm.public.Class.all();

    const facultyClasses = classes.filter(
      (item) => item.facultyId === faculty.id,
    );

    res.status(200).json({
      success: true,
      data: {
        id: faculty.id,
        employeeId: faculty.employeeId,
        name: user?.name ?? null,
        email: user?.email ?? null,
        department: department?.name ?? null,
        departmentCode: department?.code ?? null,
        totalClasses: facultyClasses.length,
      },
    });
  } catch (error) {
    console.error("Error fetching faculty dashboard:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch faculty dashboard",
    });
  }
};

export const getFacultyTimetable = async (req, res) => {
  try {
    const userId = Number(req.user.id);

    // Find the logged-in faculty
    const facultyList = await db.orm.public.Faculty.all();

    const faculty = facultyList.find((item) => item.userId === userId);

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty profile not found",
      });
    }

    // Get all classes handled by this faculty
    const classes = await db.orm.public.Class.all();

    const facultyClasses = classes.filter(
      (item) => item.facultyId === faculty.id,
    );

    const classIds = facultyClasses.map((item) => item.id);

    // Get timetable
    const timetable = await db.orm.public.Timetable.all();

    const facultyTimetable = timetable.filter((item) =>
      classIds.includes(item.classId),
    );

    // Get subjects
    const subjects = await db.orm.public.Subject.all();

    const result = facultyTimetable.map((entry) => {
      const classInfo = facultyClasses.find(
        (item) => item.id === entry.classId,
      );

      const subject = subjects.find((item) => item.id === classInfo?.subjectId);

      return {
        id: entry.id,
        dayOfWeek: entry.dayOfWeek,
        startTime: entry.startTime,
        endTime: entry.endTime,
        room: entry.room,
        classId: entry.classId,
        semester: classInfo?.semester ?? null,
        section: classInfo?.section ?? null,
        academicYear: classInfo?.academicYear ?? null,
        subject: subject
          ? {
              id: subject.id,
              code: subject.code,
              name: subject.name,
            }
          : null,
      };
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error fetching faculty timetable:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch faculty timetable",
    });
  }
};
