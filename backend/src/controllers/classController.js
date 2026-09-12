import { db } from "../prisma/db.js";
import { recordAudit } from "../utils/audit.js";

export const getClasses = async (req, res) => {
  try {
    let classes = await db.orm.public.Class.all();
    if (req.user.role === "ADMIN") {
      classes = classes.filter((item) => item.departmentId === Number(req.user.departmentId));
    } else if (req.user.role === "FACULTY") {
      const faculty = (await db.orm.public.Faculty.where({ userId: Number(req.user.id) }).all())[0];
      classes = faculty ? classes.filter((item) => item.facultyId === faculty.id) : [];
    }

    res.status(200).json({
      success: true,
      data: classes,
    });
  } catch (error) {
    console.error("Error fetching classes:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch classes",
    });
  }
};

const canManageClass = (user, classItem) =>
  user.role === "SUPER_ADMIN" || Number(user.departmentId) === Number(classItem.departmentId);

const getClassReferences = async (subjectId, facultyId, departmentId) => {
  const [subjects, faculty, departments] = await Promise.all([
    db.orm.public.Subject.all(),
    db.orm.public.Faculty.all(),
    db.orm.public.Department.all(),
  ]);
  const subject = subjects.find((item) => item.id === Number(subjectId));
  const selectedFaculty = faculty.find((item) => item.id === Number(facultyId));
  const department = departments.find((item) => item.id === Number(departmentId));
  return { subject, selectedFaculty, department };
};

export const updateClass = async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const classes = await db.orm.public.Class.all();
    const classItem = classes.find((item) => item.id === classId);
    if (!classItem) return res.status(404).json({ success: false, message: "Class not found" });
    if (!canManageClass(req.user, classItem)) return res.status(403).json({ success: false, message: "You are not authorized to update classes from other departments" });

    const target = {
      subjectId: req.body.subjectId === undefined ? classItem.subjectId : Number(req.body.subjectId),
      facultyId: req.body.facultyId === undefined ? classItem.facultyId : Number(req.body.facultyId),
      departmentId: req.body.departmentId === undefined ? classItem.departmentId : Number(req.body.departmentId),
      semester: req.body.semester === undefined ? classItem.semester : Number(req.body.semester),
      section: req.body.section === undefined ? classItem.section : String(req.body.section).trim(),
      academicYear: req.body.academicYear === undefined ? classItem.academicYear : String(req.body.academicYear).trim(),
    };
    if (req.user.role === "ADMIN" && target.departmentId !== Number(req.user.departmentId)) return res.status(403).json({ success: false, message: "HODs cannot move classes to another department" });
    if (!Number.isInteger(target.semester) || target.semester < 1 || target.semester > 8 || !target.section || !target.academicYear) return res.status(400).json({ success: false, message: "Valid semester, section, and academic year are required" });
    const { subject, selectedFaculty, department } = await getClassReferences(target.subjectId, target.facultyId, target.departmentId);
    if (!subject || !selectedFaculty || !department) return res.status(404).json({ success: false, message: "Class subject, faculty, or department not found" });
    if (subject.departmentId !== target.departmentId || selectedFaculty.departmentId !== target.departmentId) return res.status(400).json({ success: false, message: "Class faculty, subject, and department must match" });
    const updated = await db.orm.public.Class.where({ id: classId }).update(target);
    await recordAudit(req, "UPDATE", "CLASS", classId, { departmentId: target.departmentId });
    return res.status(200).json({ success: true, message: "Class updated successfully", data: updated });
  } catch (error) {
    console.error("Error updating class:", error);
    return res.status(500).json({ success: false, message: "Failed to update class" });
  }
};

export const deleteClass = async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const classes = await db.orm.public.Class.all();
    const classItem = classes.find((item) => item.id === classId);
    if (!classItem) return res.status(404).json({ success: false, message: "Class not found" });
    if (!canManageClass(req.user, classItem)) return res.status(403).json({ success: false, message: "You are not authorized to delete classes from other departments" });
    const [enrollments, timetable, sessions] = await Promise.all([
      db.orm.public.Enrollment.all(), db.orm.public.Timetable.all(), db.orm.public.AttendanceSession.all(),
    ]);
    if (enrollments.some((item) => item.classId === classId) || timetable.some((item) => item.classId === classId) || sessions.some((item) => item.classId === classId)) return res.status(409).json({ success: false, message: "Class cannot be deleted while it has enrollments, timetable entries, or attendance sessions" });
    await db.orm.public.Class.where({ id: classId }).delete();
    await recordAudit(req, "DELETE", "CLASS", classId, { departmentId: classItem.departmentId });
    return res.status(200).json({ success: true, message: "Class deleted successfully" });
  } catch (error) {
    console.error("Error deleting class:", error);
    return res.status(500).json({ success: false, message: "Failed to delete class" });
  }
};

export const createClass = async (req, res) => {
  try {
    const {
      subjectId,
      facultyId,
      departmentId,
      semester,
      section,
      academicYear,
    } = req.body;

    if (
      !subjectId ||
      !facultyId ||
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

    // Check subject
    const subjects = await db.orm.public.Subject.all();

    const subject = subjects.find((item) => item.id === Number(subjectId));

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    // Check faculty
    const faculty = await db.orm.public.Faculty.all();

    const selectedFaculty = faculty.find(
      (item) => item.id === Number(facultyId),
    );

    if (!selectedFaculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    // Check department
    const departments = await db.orm.public.Department.all();

    const department = departments.find(
      (item) => item.id === Number(departmentId),
    );

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    if (req.user.role === "ADMIN" && Number(departmentId) !== Number(req.user.departmentId)) {
      return res.status(403).json({
        success: false,
        message: "HODs can create classes only in their own department",
      });
    }

    if (selectedFaculty.departmentId !== Number(departmentId) || subject.departmentId !== Number(departmentId)) {
      return res.status(400).json({
        success: false,
        message: "Class faculty, subject, and department must match",
      });
    }

    // Create class
    const newClass = await db.orm.public.Class.create({
      subjectId: Number(subjectId),
      facultyId: Number(facultyId),
      departmentId: Number(departmentId),
      semester: Number(semester),
      section,
      academicYear,
    });

    res.status(201).json({
      success: true,
      message: "Class created successfully",
      data: newClass,
    });
    await recordAudit(req, "CREATE", "CLASS", newClass.id, { departmentId: newClass.departmentId });
  } catch (error) {
    console.error("Error creating class:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create class",
    });
  }
};

export const getFacultyClasses = async (req, res) => {
  try {
    const userId = Number(req.user.id);

    // Find the faculty linked to the logged-in user
    const facultyList = await db.orm.public.Faculty.all();

    const faculty = facultyList.find((item) => item.userId === userId);

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty profile not found",
      });
    }

    // Get classes handled by this faculty
    const classes = await db.orm.public.Class.all();

    const facultyClasses = classes.filter(
      (item) => item.facultyId === faculty.id,
    );

    // Get subjects
    const subjects = await db.orm.public.Subject.all();

    // Get departments
    const departments = await db.orm.public.Department.all();

    const result = facultyClasses.map((classItem) => {
      const subject = subjects.find((item) => item.id === classItem.subjectId);

      const department = departments.find(
        (item) => item.id === classItem.departmentId,
      );

      return {
        id: classItem.id,
        semester: classItem.semester,
        section: classItem.section,
        academicYear: classItem.academicYear,
        subject: subject
          ? {
              id: subject.id,
              code: subject.code,
              name: subject.name,
              credits: subject.credits,
            }
          : null,
        department: department
          ? {
              id: department.id,
              name: department.name,
              code: department.code,
            }
          : null,
      };
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error fetching faculty classes:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch faculty classes",
    });
  }
};

export const getClassDetails = async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const classId = Number(req.params.id);

    if (!Number.isInteger(classId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid class ID",
      });
    }

    // Find the logged-in faculty
    const facultyList = await db.orm.public.Faculty.all();

    const faculty = facultyList.find((item) => item.userId === userId);

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty profile not found",
      });
    }

    // Find the class
    const classes = await db.orm.public.Class.all();

    const classItem = classes.find(
      (item) => item.id === classId && item.facultyId === faculty.id,
    );

    if (!classItem) {
      return res.status(404).json({
        success: false,
        message: "Class not found or not assigned to this faculty",
      });
    }

    // Find subject
    const subjects = await db.orm.public.Subject.all();

    const subject = subjects.find((item) => item.id === classItem.subjectId);

    // Find department
    const departments = await db.orm.public.Department.all();

    const department = departments.find(
      (item) => item.id === classItem.departmentId,
    );

    // Find enrolled students
    const enrollments = await db.orm.public.Enrollment.all();

    const classEnrollments = enrollments.filter(
      (item) => item.classId === classItem.id,
    );

    const students = await db.orm.public.Student.all();
    const users = await db.orm.public.User.all();

    const enrolledStudents = classEnrollments.map((enrollment) => {
      const student = students.find((item) => item.id === enrollment.studentId);

      const user = users.find((item) => item.id === student?.userId);

      return {
        enrollmentId: enrollment.id,
        studentId: student?.id ?? null,
        registerNumber: student?.registerNumber ?? null,
        name: user?.name ?? null,
        email: user?.email ?? null,
        semester: student?.semester ?? null,
        section: student?.section ?? null,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        id: classItem.id,
        semester: classItem.semester,
        section: classItem.section,
        academicYear: classItem.academicYear,
        subject: subject
          ? {
              id: subject.id,
              code: subject.code,
              name: subject.name,
              credits: subject.credits,
            }
          : null,
        department: department
          ? {
              id: department.id,
              name: department.name,
              code: department.code,
            }
          : null,
        students: enrolledStudents,
        totalStudents: enrolledStudents.length,
      },
    });
  } catch (error) {
    console.error("Error fetching class details:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch class details",
    });
  }
};
