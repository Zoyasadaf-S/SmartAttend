import { db } from "../prisma/db.js";
import bcrypt from "bcryptjs";
import { recordAudit } from "../utils/audit.js";

const isHod = (user) => user.role === "ADMIN";
const hasDepartmentAccess = (user, departmentId) =>
  user.role === "SUPER_ADMIN" || Number(user.departmentId) === Number(departmentId);

const getStudentIdFromUser = async (userId) => {
  const students = await db.orm.public.Student.where({ userId: Number(userId) }).all();
  return students[0]?.id ?? null;
};

export const getStudentById = async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "Invalid student ID",
      });
    }

    const students = await db.orm.public.Student.where({ id: studentId }).all();
    const student = students[0];

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Authorization check
    if (isHod(req.user) && !hasDepartmentAccess(req.user, student.departmentId)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to access students from other departments",
      });
    }

    const users = await db.orm.public.User.where({ id: student.userId }).all();
    const user = users[0];

    res.status(200).json({
      success: true,
      data: {
        student,
        user,
      },
    });
  } catch (error) {
    console.error("Error fetching student by ID:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch student",
    });
  }
};

export const updateStudent = async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const updates = req.body;

    const students = await db.orm.public.Student.where({ id: studentId }).all();
    const student = students[0];

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Authorization check
    if (isHod(req.user) && !hasDepartmentAccess(req.user, student.departmentId)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update students from other departments",
      });
    }

    // Prevent HOD from moving student to another department
    if (isHod(req.user) && updates.departmentId !== undefined && Number(updates.departmentId) !== Number(req.user.departmentId)) {
      return res.status(403).json({
        success: false,
        message: "HODs cannot move students to other departments",
      });
    }

    const updatedStudent = await db.orm.public.Student.where({ id: studentId }).update(updates);

    res.status(200).json({
      success: true,
      message: "Student updated successfully",
      data: updatedStudent,
    });
    await recordAudit(req, "UPDATE", "STUDENT", studentId, { departmentId: student.departmentId });
  } catch (error) {
    console.error("Error updating student:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update student",
    });
  }
};

export const deleteStudent = async (req, res) => {
  try {
    const studentId = Number(req.params.id);

    const students = await db.orm.public.Student.where({ id: studentId }).all();
    const student = students[0];

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Authorization check
    if (isHod(req.user) && !hasDepartmentAccess(req.user, student.departmentId)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete students from other departments",
      });
    }

    await db.orm.public.Student.where({ id: studentId }).delete();

    res.status(200).json({
      success: true,
      message: "Student deleted successfully",
    });
    await recordAudit(req, "DELETE", "STUDENT", studentId, { departmentId: student.departmentId });
  } catch (error) {
    console.error("Error deleting student:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete student",
    });
  }
};

export const toggleStudentStatus = async (req, res) => {
  try {
    const requestedId = Number(req.params.id);
    const { isActive } = req.body;

    if (isActive === undefined) {
      return res.status(400).json({
        success: false,
        message: "isActive status is required",
      });
    }

    let students = await db.orm.public.Student.where({ id: requestedId }).all();
    let student = students[0];
    if (!student) {
      students = await db.orm.public.Student.where({ userId: requestedId }).all();
      student = students[0];
    }

    if (!student) {
      return res.status(400).json({
        success: false,
        message: "User is not a student",
      });
    }

    // Authorization check
    if (isHod(req.user) && !hasDepartmentAccess(req.user, student.departmentId)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to change status of students from other departments",
      });
    }

    await db.orm.public.User.where({ id: student.userId }).update({
      isActive,
    });

    res.status(200).json({
      success: true,
      message: `Student ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: { userId: student.userId, studentId: student.id, isActive },
    });
    await recordAudit(req, isActive ? "ACTIVATE" : "DEACTIVATE", "STUDENT", student.id, { departmentId: student.departmentId });
  } catch (error) {
    console.error("Error toggling student status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle student status",
    });
  }
};

export const bulkPromoteStudents = async (req, res) => {
  try {
    const { studentIds, newSemester } = req.body;
    if (!studentIds || !Array.isArray(studentIds) || !newSemester) {
      return res.status(400).json({
        success: false,
        message: "studentIds (array) and newSemester are required",
      });
    }

    // Fetch all students and filter to requested IDs in JS
    // (prisma-next does not support { id: { in: [...] } } syntax)
    const allStudents = await db.orm.public.Student.all();
    const requestedIds = studentIds.map(Number);
    const students = allStudents.filter(s => requestedIds.includes(s.id));

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No students found with the provided IDs",
      });
    }

    // Authorization: ADMIN (HOD) may only promote students in their own department
    if (isHod(req.user)) {
      const unauthorized = students.filter(s => !hasDepartmentAccess(req.user, s.departmentId));
      if (unauthorized.length > 0) {
        return res.status(403).json({
          success: false,
          message: `Unauthorized operation on ${unauthorized.length} students from other departments`,
        });
      }
    }

    // Perform promotion
    for (const id of requestedIds) {
      await db.orm.public.Student.where({ id }).update({ semester: Number(newSemester) });
    }

    res.status(200).json({
      success: true,
      message: `Successfully promoted ${students.length} students to semester ${newSemester}`,
    });
    await recordAudit(req, "BULK_PROMOTE", "STUDENT", null, { studentIds: requestedIds, newSemester });
  } catch (error) {
    console.error("Bulk promotion error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to promote students",
    });
  }
};

export const importStudents = async (req, res) => {
  try {
    // Note: This implementation assumes the file is already uploaded and passed as a buffer or path.
    // For this integration, we focus on the authorization and data assignment.
    const { data } = req.body; // Expected to be an array of student objects from Excel
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({
        success: false,
        message: "Invalid import data",
      });
    }

    const results = { created: 0, failed: 0, errors: [] };
    const requestedDepartmentId = req.body.departmentId;
    if (isHod(req.user) && requestedDepartmentId !== undefined && !hasDepartmentAccess(req.user, requestedDepartmentId)) {
      return res.status(403).json({
        success: false,
        message: "HODs can import students only into their own department",
      });
    }

    const deptId = isHod(req.user) ? req.user.departmentId : requestedDepartmentId;
    if (!deptId) {
      return res.status(400).json({
        success: false,
        message: "departmentId is required for institution-wide imports",
      });
    }

    for (const item of data) {
      try {
        // Validation and duplicate checks (omitted for brevity, but should be here)
        const user = await db.orm.public.User.create({
          name: item.name,
          email: item.email,
          passwordHash: await bcrypt.hash('Temporary123!', 10),
          role: 'STUDENT',
          isActive: true,
        });

        await db.orm.public.Student.create({
          userId: user.id,
          registerNumber: item.registerNumber,
          departmentId: Number(deptId),
          semester: Number(item.semester),
          section: item.section,
          academicYear: item.academicYear,
          Lab: item.Lab || (item.section + '1'),
        });
        results.created++;
      } catch (e) {
        results.failed++;
        results.errors.push({ email: item.email, error: e.message });
      }
    }

    res.status(200).json({
      success: true,
      message: "Import completed",
      data: results,
    });
    await recordAudit(req, "IMPORT", "STUDENT", null, { created: results.created, failed: results.failed, departmentId: deptId });
  } catch (error) {
    console.error("Import error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to import students",
    });
  }
};

export const exportStudents = async (req, res) => {
  try {
    let query = db.orm.public.Student;
    if (isHod(req.user)) {
      query = query.where({ departmentId: req.user.departmentId });
    }

    const students = await query.all();
    const users = await db.orm.public.User.all();

    const data = students.map(s => {
      const u = users.find(user => user.id === s.userId);
      return { ...s, name: u?.name, email: u?.email };
    });

    // Return CSV by default; JSON available via ?format=json
    const format = req.query.format || 'csv';
    if (format === 'json') {
      return res.status(200).json({ success: true, data });
    }

    // Build CSV
    const headers = ['id', 'registerNumber', 'name', 'email', 'departmentId', 'semester', 'section', 'Lab', 'academicYear'];
    const csvRows = [
      headers.join(','),
      ...data.map(row =>
        headers.map(h => {
          const val = row[h] ?? '';
          // Escape values containing commas or quotes
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        }).join(',')
      ),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
    return res.status(200).send(csvRows.join('\n'));
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export students",
    });
  }
};

export const getStudents = async (req, res) => {
  try {
    const { role, departmentId } = req.user;
    const isHodUser = isHod(req.user);

    let targetDepartment = null;
    if (isHodUser) {
      targetDepartment = departmentId;
    } else {
      const queryDept = req.query.department;
      if (queryDept) {
        const departments = await db.orm.public.Department.all();
        const target = queryDept.trim().toUpperCase();
        const matchingDept = departments.find(
          (d) => d.code?.toUpperCase() === target || d.name?.toUpperCase().includes(target) || String(d.id) === target
        );
        if (matchingDept) {
          targetDepartment = matchingDept.id;
        }
      }
    }

    let query = db.orm.public.Student;
    if (targetDepartment) {
      query = query.where({ departmentId: Number(targetDepartment) });
    }

    const students = await query.all();
    const users = await db.orm.public.User.all();

    const result = students.map(student => {
      const user = users.find(u => u.id === student.userId);
      return {
        ...student,
        name: user?.name || 'Unknown',
        email: user?.email || 'Unknown',
        isActive: user?.isActive ?? false,
      };
    });

    const search = String(req.query.search || req.query.q || "").trim().toLowerCase();
    const semester = req.query.semester ? Number(req.query.semester) : null;
    const section = String(req.query.section || "").trim().toLowerCase();
    const status = String(req.query.status || "").trim().toLowerCase();
    const sortBy = ["name", "registerNumber", "semester", "departmentId", "createdAt"].includes(req.query.sortBy)
      ? req.query.sortBy
      : "createdAt";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
    const filtered = result.filter((student) => {
      const matchesSearch = !search || [student.name, student.email, student.registerNumber]
        .some((value) => String(value || "").toLowerCase().includes(search));
      const matchesSemester = !semester || student.semester === semester;
      const matchesSection = !section || String(student.section).toLowerCase() === section;
      const user = users.find((item) => item.id === student.userId);
      const matchesStatus = !status || (status === "active" ? user?.isActive === true : status === "inactive" ? user?.isActive === false : true);
      return matchesSearch && matchesSemester && matchesSection && matchesStatus;
    });
    filtered.sort((left, right) => String(left[sortBy] ?? "").localeCompare(String(right[sortBy] ?? ""), undefined, { numeric: true }) * sortOrder);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || req.query.pageSize) || 100));
    const total = filtered.length;

    res.status(200).json({
      success: true,
      data: filtered.slice((page - 1) * limit, page * limit),
      total,
      isHod: isHodUser,
      department: targetDepartment,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch students",
    });
  }
};

export const createStudent = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      registerNumber,
      departmentId,
      semester,
      section,
      academicYear,
    } = req.body;

    // Check required fields
    if (
      !name ||
      !email ||
      !password ||
      !registerNumber ||
      !departmentId ||
      !semester ||
      !section ||
      !academicYear
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Check whether email already exists
    const existingUsers = await db.orm.public.User.all();

    const emailExists = existingUsers.some((user) => user.email === email);

    if (emailExists) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    // Check whether register number already exists
    const existingStudents = await db.orm.public.Student.all();

    const registerExists = existingStudents.some(
      (student) => student.registerNumber === registerNumber,
    );

    if (registerExists) {
      return res.status(409).json({
        success: false,
        message: "Register number already exists",
      });
    }

    // Check department exists
    const department = await db.orm.public.Department.all();
    const selectedDepartment = department.find(
      (dept) => dept.id === Number(departmentId),
    );

    if (!selectedDepartment) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    if (isHod(req.user) && Number(departmentId) !== Number(req.user.departmentId)) {
      return res.status(403).json({
        success: false,
        message: "HODs can create students only in their own department",
      });
    }

    let finalDepartmentId = Number(departmentId);
    if (isHod(req.user)) {
      finalDepartmentId = req.user.departmentId;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create User
    const user = await db.orm.public.User.create({
      name,
      email: String(email).trim().toLowerCase(),
      passwordHash,
      role: "STUDENT",
      departmentId: finalDepartmentId,
      isActive: true,
      mustChangePassword: true,
    });

    // Create Student
    const student = await db.orm.public.Student.create({
      userId: user.id,
      registerNumber,
      departmentId: finalDepartmentId,
      semester: Number(semester),
      section,
      academicYear,
      Lab: req.body.Lab || (section + '1'),
    });

    res.status(201).json({
      success: true,
      message: "Student created successfully",
      data: {
        user,
        student,
      },
    });
    await recordAudit(req, "CREATE", "STUDENT", student.id, { departmentId: student.departmentId });
  } catch (error) {
    console.error("Error creating student:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create student",
    });
  }
};

export const getStudentDashboard = async (req, res) => {
  try {
    const users = await db.orm.public.User.all();

    const user = users.find((item) => item.id === Number(req.user.id));

    if (!user || user.role !== "STUDENT") {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const students = await db.orm.public.Student.all();

    const student = students.find((item) => item.userId === user.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const departments = await db.orm.public.Department.all();

    const department = departments.find(
      (item) => item.id === student.departmentId,
    );

    res.status(200).json({
      success: true,
      data: {
        student: {
          id: student.id,
          registerNumber: student.registerNumber,
          name: user.name,
          email: user.email,
          department: department?.name ?? null,
          semester: student.semester,
          section: student.section,
          academicYear: student.academicYear,
        },
      },
    });
  } catch (error) {
    console.error("Student dashboard error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch student dashboard",
    });
  }
};

export const getStudentProfile = async (req, res) => {
  try {
    const users = await db.orm.public.User.all();

    const user = users.find((item) => item.id === Number(req.user.id));

    if (!user || user.role !== "STUDENT") {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const students = await db.orm.public.Student.all();

    const student = students.find((item) => item.userId === user.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const departments = await db.orm.public.Department.all();

    const department = departments.find(
      (item) => item.id === student.departmentId,
    );

    res.status(200).json({
      success: true,
      data: {
        id: student.id,
        registerNumber: student.registerNumber,
        name: user.name,
        email: user.email,
        department: department?.name ?? null,
        departmentCode: department?.code ?? null,
        semester: student.semester,
        section: student.section,
        academicYear: student.academicYear,
      },
    });
  } catch (error) {
    console.error("Student profile error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch student profile",
    });
  }
};

export const getStudentSubjects = async (req, res) => {
  try {
    const studentId = await getStudentIdFromUser(req.user.id);

    if (!studentId) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const enrollments = await db.orm.public.Enrollment.all();
    const classes = await db.orm.public.Class.all();
    const subjects = await db.orm.public.Subject.all();
    const faculty = await db.orm.public.Faculty.all();
    const users = await db.orm.public.User.all();

    const studentEnrollments = enrollments.filter(
      (item) => item.studentId === studentId,
    );

    const data = studentEnrollments.map((enrollment) => {
      const classItem = classes.find((item) => item.id === enrollment.classId);

      const subject = subjects.find((item) => item.id === classItem?.subjectId);

      const facultyItem = faculty.find(
        (item) => item.id === classItem?.facultyId,
      );

      const facultyUser = users.find((item) => item.id === facultyItem?.userId);

      return {
        enrollmentId: enrollment.id,
        classId: classItem?.id ?? null,
        subjectId: subject?.id ?? null,
        code: subject?.code ?? null,
        name: subject?.name ?? null,
        credits: subject?.credits ?? null,
        faculty: facultyUser?.name ?? null,
        semester: classItem?.semester ?? null,
        section: classItem?.section ?? null,
        academicYear: classItem?.academicYear ?? null,
      };
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Student subjects error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch student subjects",
    });
  }
};

export const getStudentSubjectDetails = async (req, res) => {
  try {
    const studentId = await getStudentIdFromUser(req.user.id);
    const subjectId = Number(req.params.id);

    if (!studentId) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    if (!subjectId) {
      return res.status(400).json({
        success: false,
        message: "Invalid subject ID",
      });
    }

    const enrollments = await db.orm.public.Enrollment.all();
    const classes = await db.orm.public.Class.all();
    const subjects = await db.orm.public.Subject.all();
    const faculty = await db.orm.public.Faculty.all();
    const users = await db.orm.public.User.all();
    const sessions = await db.orm.public.AttendanceSession.all();
    const attendance = await db.orm.public.Attendance.all();

    // Find classes where this student is enrolled
    const studentEnrollments = enrollments.filter(
      (item) => item.studentId === studentId,
    );

    const enrollment = studentEnrollments.find((item) => {
      const classItem = classes.find(
        (classItem) => classItem.id === item.classId,
      );

      return classItem?.subjectId === subjectId;
    });

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "Subject not found for this student",
      });
    }

    const classItem = classes.find((item) => item.id === enrollment.classId);

    const subject = subjects.find((item) => item.id === classItem?.subjectId);

    const facultyItem = faculty.find(
      (item) => item.id === classItem?.facultyId,
    );

    const facultyUser = users.find((item) => item.id === facultyItem?.userId);

    // Sessions belonging to this class
    const classSessions = sessions.filter(
      (item) => item.classId === classItem.id,
    );

    // Attendance records belonging to this student and these sessions
    const studentAttendance = attendance.filter(
      (item) =>
        item.studentId === studentId &&
        classSessions.some((session) => session.id === item.sessionId),
    );

    const totalClasses = classSessions.length;

    const present = studentAttendance.filter(
      (item) => item.status === "PRESENT",
    ).length;

    const absent = studentAttendance.filter(
      (item) => item.status === "ABSENT",
    ).length;

    const late = studentAttendance.filter(
      (item) => item.status === "LATE",
    ).length;

    const attendancePercentage =
      totalClasses > 0
        ? Number(((present / totalClasses) * 100).toFixed(2))
        : 0;

    res.status(200).json({
      success: true,
      data: {
        subject: {
          id: subject.id,
          code: subject.code,
          name: subject.name,
          credits: subject.credits,
        },
        faculty: facultyUser?.name ?? null,
        class: {
          id: classItem.id,
          semester: classItem.semester,
          section: classItem.section,
          academicYear: classItem.academicYear,
        },
        attendance: {
          totalClasses,
          present,
          absent,
          late,
          percentage: attendancePercentage,
        },
      },
    });
  } catch (error) {
    console.error("Student subject details error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch subject details",
    });
  }
};

export const getStudentTimetable = async (req, res) => {
  try {
    const studentId = await getStudentIdFromUser(req.user.id);

    if (!studentId) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const enrollments = await db.orm.public.Enrollment.all();
    const classes = await db.orm.public.Class.all();
    const timetables = await db.orm.public.Timetable.all();
    const subjects = await db.orm.public.Subject.all();
    const faculty = await db.orm.public.Faculty.all();
    const users = await db.orm.public.User.all();

    const studentEnrollments = enrollments.filter(
      (item) => item.studentId === studentId,
    );

    const data = [];

    for (const enrollment of studentEnrollments) {
      const classItem = classes.find((item) => item.id === enrollment.classId);

      if (!classItem) continue;

      const subject = subjects.find((item) => item.id === classItem.subjectId);

      const facultyItem = faculty.find(
        (item) => item.id === classItem.facultyId,
      );

      const facultyUser = users.find((item) => item.id === facultyItem?.userId);

      const classTimetable = timetables.filter(
        (item) => item.classId === classItem.id,
      );

      for (const timetable of classTimetable) {
        data.push({
          id: timetable.id,
          dayOfWeek: timetable.dayOfWeek,
          startTime: timetable.startTime,
          endTime: timetable.endTime,
          room: timetable.room,
          subject: {
            id: subject?.id ?? null,
            code: subject?.code ?? null,
            name: subject?.name ?? null,
          },
          faculty: facultyUser?.name ?? null,
          classId: classItem.id,
        });
      }
    }

    data.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) {
        return a.dayOfWeek - b.dayOfWeek;
      }

      return a.startTime.localeCompare(b.startTime);
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Student timetable error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch student timetable",
    });
  }
};

export const getStudentAttendance = async (req, res) => {
  try {
    const studentId = await getStudentIdFromUser(req.user.id);

    if (!studentId) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const enrollments = await db.orm.public.Enrollment.all();
    const classes = await db.orm.public.Class.all();
    const subjects = await db.orm.public.Subject.all();
    const sessions = await db.orm.public.AttendanceSession.all();
    const attendance = await db.orm.public.Attendance.all();

    const studentEnrollments = enrollments.filter(
      (item) => item.studentId === studentId,
    );

    const data = studentEnrollments.map((enrollment) => {
      const classItem = classes.find((item) => item.id === enrollment.classId);

      const subject = subjects.find((item) => item.id === classItem?.subjectId);

      const classSessions = sessions.filter(
        (session) => session.classId === classItem?.id,
      );

      const studentAttendance = attendance.filter(
        (item) =>
          item.studentId === studentId &&
          classSessions.some((session) => session.id === item.sessionId),
      );

      const totalClasses = classSessions.length;

      const present = studentAttendance.filter(
        (item) => item.status === "PRESENT",
      ).length;

      const absent = studentAttendance.filter(
        (item) => item.status === "ABSENT",
      ).length;

      const late = studentAttendance.filter(
        (item) => item.status === "LATE",
      ).length;

      const percentage =
        totalClasses > 0
          ? Number(((present / totalClasses) * 100).toFixed(2))
          : 0;

      return {
        subjectId: subject?.id ?? null,
        code: subject?.code ?? null,
        subject: subject?.name ?? null,
        totalClasses,
        present,
        absent,
        late,
        percentage,
      };
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Student attendance error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch student attendance",
    });
  }
};

export const getStudentAttendanceHistory = async (req, res) => {
  try {
    const studentId = await getStudentIdFromUser(req.user.id);

    if (!studentId) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const attendance = await db.orm.public.Attendance.all();
    const sessions = await db.orm.public.AttendanceSession.all();
    const classes = await db.orm.public.Class.all();
    const subjects = await db.orm.public.Subject.all();

    const studentAttendance = attendance.filter(
      (item) => item.studentId === studentId,
    );

    const data = studentAttendance.map((record) => {
      const session = sessions.find((item) => item.id === record.sessionId);

      const classItem = classes.find((item) => item.id === session?.classId);

      const subject = subjects.find((item) => item.id === classItem?.subjectId);

      return {
        attendanceId: record.id,
        sessionId: record.sessionId,
        date: session?.sessionDate ?? null,
        markedAt: record.markedAt,
        status: record.status,
        source: record.source,
        subject: {
          id: subject?.id ?? null,
          code: subject?.code ?? null,
          name: subject?.name ?? null,
        },
      };
    });

    data.sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return new Date(b.date) - new Date(a.date);
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Student attendance history error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch attendance history",
    });
  }
};
