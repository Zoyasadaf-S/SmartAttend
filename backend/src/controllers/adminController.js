import { db } from "../prisma/db.js";
import bcrypt from "bcryptjs";
import * as xlsx from "xlsx";
import { recordAudit } from "../utils/audit.js";
import { isHod, isSuperAdmin } from "../utils/rbac.js";
import { parseStudentFile } from "../utils/studentFileParser.js";
import { generatePdfTableBuffer } from "../utils/pdfGenerator.js";
import { generateSecureTemporaryCredential } from "../utils/credentialGenerator.js";

async function departmentCodeForUser(user) {
  if (!isHod(user) || user.departmentId == null) return null;
  const departments = await db.orm.public.Department.where({ id: Number(user.departmentId) }).all();
  return departments[0]?.code ?? null;
}

export const getAdminDashboard = async (req, res) => {
  try {
    const departmentId = isHod(req.user) ? Number(req.user.departmentId) : null;
    const allStudents = await db.orm.public.Student.all();
    const allFaculty = await db.orm.public.Faculty.all();
    const allClasses = await db.orm.public.Class.all();
    const sessions = await db.orm.public.AttendanceSession.all();
    const attendance = await db.orm.public.Attendance.all();
    const students = departmentId ? allStudents.filter((item) => item.departmentId === departmentId) : allStudents;
    const faculty = departmentId ? allFaculty.filter((item) => item.departmentId === departmentId) : allFaculty;
    const classes = departmentId ? allClasses.filter((item) => item.departmentId === departmentId) : allClasses;

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];

    const classIds = new Set(classes.map((item) => item.id));
    const visibleSessions = sessions.filter((session) => classIds.has(session.classId));
    const sessionIds = new Set(visibleSessions.map((item) => item.id));
    const visibleAttendance = attendance.filter((record) => sessionIds.has(record.sessionId));
    const todaySessions = visibleSessions.filter((session) =>
      String(session.sessionDate).startsWith(today),
    );

    const activeSessions = todaySessions.filter(
      (session) => session.endedAt === null,
    );

    const todayAttendance = visibleAttendance.filter((record) =>
      String(record.markedAt).startsWith(today),
    );

    const presentToday = todayAttendance.filter(
      (record) => record.status === "PRESENT",
    ).length;

    const absentToday = todayAttendance.filter(
      (record) => record.status === "ABSENT",
    ).length;

    return res.status(200).json({
      success: true,
      data: {
        totalStudents: students.length,
        totalFaculty: faculty.length,
        totalClasses: classes.length,
        activeSessions: activeSessions.length,
        todaySessions: todaySessions.length,
        todayAttendance: todayAttendance.length,
        presentToday,
        absentToday,
      },
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load admin dashboard",
    });
  }
};

// Helper to match student department code/name
const matchDepartment = (student, targetCode, departments = []) => {
  if (!targetCode) return true;
  const target = targetCode.trim().toUpperCase();

  // 1. Check against departments table if departmentId exists
  if (student.departmentId && departments.length > 0) {
    const dept = departments.find((d) => d.id === student.departmentId);
    if (dept) {
      const code = String(dept.code || "").toUpperCase();
      if (code === target) return true;
    }
  }

  // 2. Exact code match on student.departmentCode
  const sDeptCode = String(student.departmentCode || "").trim().toUpperCase();
  if (sDeptCode) {
    return sDeptCode === target;
  }

  // 3. Department name matching with strict keywords (avoid substring collisions like 'EE' in 'Engineering')
  const sDept = String(student.department || "").toUpperCase();

  if (target === "CSE-DS") {
    return sDept.includes("DATA SCIENCE") || sDept.includes("CSE-DS") || sDept.includes("CSE (DS)");
  }

  if (target === "CSE") {
    return (sDept.includes("COMPUTER SCIENCE") || sDept === "CSE") && !sDept.includes("DATA SCIENCE");
  }

  if (target === "AIML") {
    return sDept.includes("ARTIFICIAL INTELLIGENCE") || sDept.includes("AIML") || sDept.includes("AI & ML") || sDept.includes("AI/ML");
  }

  if (target === "ECE") {
    return sDept.includes("ELECTRONICS") || sDept === "ECE";
  }

  if (target === "EEE") {
    return sDept.includes("ELECTRICAL") || sDept === "EEE";
  }

  if (target === "MECH") {
    return sDept.includes("MECHANICAL") || sDept === "MECH";
  }

  if (target === "CIVIL") {
    return sDept.includes("CIVIL");
  }

  return sDept === target;
};

// Helper for validating USN range specification
export function parseAndValidateUsnRange(from, to) {
  const sFrom = String(from || "").trim().toUpperCase();
  const sTo = String(to || "").trim().toUpperCase();

  if (!sFrom || !sTo) {
    return { valid: false, error: "Both Beginning USN and Ending USN are required" };
  }

  // Case 1: Purely numeric (e.g. 1 to 23)
  const isFromNum = /^\d+$/.test(sFrom);
  const isToNum = /^\d+$/.test(sTo);

  if (isFromNum && isToNum) {
    const fromVal = parseInt(sFrom, 10);
    const toVal = parseInt(sTo, 10);
    if (fromVal > toVal) {
      return { valid: false, error: `Beginning USN (${sFrom}) cannot be greater than Ending USN (${sTo})` };
    }
    return { valid: true, isNumericOnly: true, fromVal, toVal, sFrom, sTo };
  }

  // Case 2: Alphanumeric prefix + numeric suffix (e.g. 2VD23CS001 to 2VD23CS023)
  const fromMatch = sFrom.match(/^(.*?)(\d+)$/);
  const toMatch = sTo.match(/^(.*?)(\d+)$/);

  if (fromMatch && toMatch) {
    const fromPrefix = fromMatch[1];
    const fromNum = parseInt(fromMatch[2], 10);
    const toPrefix = toMatch[1];
    const toNum = parseInt(toMatch[2], 10);

    if (fromPrefix !== toPrefix) {
      return {
        valid: false,
        error: `Beginning USN prefix ("${fromPrefix}") and Ending USN prefix ("${toPrefix}") do not match`,
      };
    }

    if (fromNum > toNum) {
      return {
        valid: false,
        error: `Beginning USN (${sFrom}) cannot be greater than Ending USN (${sTo})`,
      };
    }

    return {
      valid: true,
      prefix: fromPrefix,
      fromNum,
      toNum,
      sFrom,
      sTo,
    };
  }

  // Case 3: Lexicographical comparison
  if (sFrom > sTo) {
    return {
      valid: false,
      error: `Beginning USN (${sFrom}) cannot be greater than Ending USN (${sTo})`,
    };
  }

  return { valid: true, isLexical: true, sFrom, sTo };
}

// Helper for USN range matching
export function checkUsnRange(usn, from, to) {
  if (!from && !to) return true;
  const sUsn = String(usn || "").trim().toUpperCase();
  const rangeSpec = parseAndValidateUsnRange(from, to);
  if (!rangeSpec.valid) return false;

  if (rangeSpec.prefix !== undefined) {
    const match = sUsn.match(/^(.*?)(\d+)$/);
    if (!match) return false;
    const prefix = match[1];
    const num = parseInt(match[2], 10);
    return prefix === rangeSpec.prefix && num >= rangeSpec.fromNum && num <= rangeSpec.toNum;
  }

  if (rangeSpec.isNumericOnly) {
    const match = sUsn.match(/(\d+)$/);
    if (!match) return false;
    const num = parseInt(match[1], 10);
    return num >= rangeSpec.fromVal && num <= rangeSpec.toVal;
  }

  return sUsn >= rangeSpec.sFrom && sUsn <= rangeSpec.sTo;
}

// Helper for numeric-aware USN sorting (LOW -> HIGH)
export function compareUsn(a, b) {
  const sA = String(a || "").trim().toUpperCase();
  const sB = String(b || "").trim().toUpperCase();
  if (!sA && !sB) return 0;
  if (!sA) return 1;
  if (!sB) return -1;

  const matchA = sA.match(/^(.*?)(\d+)$/);
  const matchB = sB.match(/^(.*?)(\d+)$/);

  if (matchA && matchB) {
    const prefixA = matchA[1];
    const prefixB = matchB[1];
    if (prefixA === prefixB) {
      const numA = parseInt(matchA[2], 10);
      const numB = parseInt(matchB[2], 10);
      if (numA !== numB) return numA - numB;
    }
  }

  return sA.localeCompare(sB, undefined, { numeric: true, sensitivity: "base" });
}

export const getAdminStudents = async (req, res) => {
  try {
    const hodDepartment = await departmentCodeForUser(req.user);

    // SECURITY ENFORCEMENT:
    // If caller is an HOD, their department is strictly locked to their assigned HOD department.
    // They cannot override this by passing ?department=... in the query string.
    let targetDepartment = null;
    if (hodDepartment) {
      targetDepartment = hodDepartment;
    } else {
      // Non-HOD users (e.g. Super Admin) can optionally filter by query parameter
      targetDepartment = req.query.department || null;
    }

    let result = [];
    let departments = [];

    try {
      const students = await db.orm.public.Student.all();
      const users = await db.orm.public.User.all();
      departments = await db.orm.public.Department.all();
      const devices = await db.orm.public.StudentDevice.all();

      if (students && students.length > 0) {
        result = students.map((student) => {
          const user = users.find((user) => user.id === student.userId);
          const department = departments.find(
            (department) => department.id === student.departmentId
          );
          const studentDevices = devices.filter(
            (device) => device.studentId === student.id && device.isActive === true
          );
          const deviceBound = studentDevices.length > 0;

          return {
            id: student.id,
            name: user?.name ?? "Unknown",
            usn: student.registerNumber,
            department: department?.name ?? "Unknown",
            departmentCode: department?.code ?? null,
            departmentId: student.departmentId,
            semester: student.semester,
            section: student.section,
            Lab: student.Lab || `${student.section || "A"}1`,
            lab: student.Lab || `${student.section || "A"}1`,
            academicYear: student.academicYear,
            email: user?.email ?? null,
            isActive: user?.isActive ?? false,
            account: user?.isActive === false ? "Inactive" : "Active",
            deviceBound,
            boundDeviceName: deviceBound ? "Registered Device" : null,
          };
        });
      }
    } catch (dbErr) {
      console.error("Failed to load students from database:", dbErr);
      return res.status(500).json({ success: false, message: "Failed to load students" });
    }

    // 1. STRICT BACKEND FILTERING: Apply HOD department restriction
    if (targetDepartment) {
      result = result.filter((student) =>
        matchDepartment(student, targetDepartment, departments)
      );
    }

    // 2. SEARCH FILTERING: Apply search within the allowed department subset
    const searchTerm = (req.query.search || req.query.query || req.query.q || "").trim().toLowerCase();
    if (searchTerm) {
      result = result.filter((student) =>
        student.name.toLowerCase().includes(searchTerm) ||
        student.usn.toLowerCase().includes(searchTerm) ||
        String(student.email || "").toLowerCase().includes(searchTerm)
      );
    }

    // 3. USN RANGE & DIVISION FILTERING
    const fromUsn = (req.query.fromUsn || "").trim();
    const toUsn = (req.query.toUsn || "").trim();
    const division = (req.query.division || req.query.section || "").trim().toUpperCase();

    if (fromUsn || toUsn) {
      result = result.filter((student) =>
        checkUsnRange(student.usn, fromUsn, toUsn)
      );
    }

    if (division) {
      result = result.filter((student) =>
        String(student.section || "").toUpperCase() === division
      );
    }

    // Sort students by USN LOW -> HIGH using numeric-aware comparator
    result.sort((a, b) => compareUsn(a.usn, b.usn));

    return res.status(200).json({
      success: true,
      data: result,
      students: result,
      total: result.length,
      isHod: Boolean(hodDepartment),
      department: targetDepartment,
    });
  } catch (error) {
    console.error("Admin students error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load students",
    });
  }
};

export const createAdminStudent = async (req, res) => {
  try {
    const {
      name,
      email,
      registerNumber,
      department,
      departmentId,
      semester,
      section,
      academicYear,
    } = req.body;

    // Basic validation
    if (!name || !email || !registerNumber) {
      return res.status(400).json({
        success: false,
        message: "Name, email and register number are required",
      });
    }

    // Find department
    const departments = await db.orm.public.Department.all();

    let selectedDepartment = null;
    const hodDepartment = await departmentCodeForUser(req.user);

    if (hodDepartment) {
      selectedDepartment = departments.find(
        (item) => item.code.toUpperCase() === hodDepartment.toUpperCase()
      );
    } else if (departmentId) {
      selectedDepartment = departments.find(
        (item) => item.id === Number(departmentId),
      );
    } else if (department) {
      selectedDepartment = departments.find(
        (item) =>
          item.name.toLowerCase() === String(department).trim().toLowerCase() ||
          item.code.toLowerCase() === String(department).trim().toLowerCase(),
      );
    }

    if (!selectedDepartment) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    // Convert semester if necessary
    const semesterNumber = Number(String(semester ?? "").replace(/\D/g, ""));

    if (!semesterNumber || semesterNumber < 1 || semesterNumber > 8) {
      return res.status(400).json({
        success: false,
        message: "Semester must be between 1 and 8",
      });
    }

    // Normalize values
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedRegisterNumber = String(registerNumber)
      .trim()
      .toUpperCase();

    // Check duplicate email
    const users = await db.orm.public.User.all();

    const emailExists = users.some(
      (user) => user.email.toLowerCase() === normalizedEmail,
    );

    if (emailExists) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    // Check duplicate USN
    const students = await db.orm.public.Student.all();

    const registerExists = students.some(
      (student) =>
        student.registerNumber.toUpperCase() === normalizedRegisterNumber,
    );

    if (registerExists) {
      return res.status(409).json({
        success: false,
        message: "Register number already exists",
      });
    }

    // Generate temporary password
    const temporaryPassword = generateSecureTemporaryCredential();

    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    // Create User
    const user = await db.orm.public.User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      role: "STUDENT",
      departmentId: selectedDepartment.id,
      isActive: true,
      mustChangePassword: true,
    });

    const cleanSection = section
      ? String(section)
          .replace(/section/i, "")
          .trim()
          .toUpperCase()
      : "A";
    const cleanLab = `${cleanSection}1`;

    // Create Student
    const student = await db.orm.public.Student.create({
      userId: user.id,
      registerNumber: normalizedRegisterNumber,
      departmentId: selectedDepartment.id,
      semester: semesterNumber,
      section: cleanSection,
      Lab: cleanLab,
      academicYear: academicYear || "2026-27",
    });

    return res.status(201).json({
      success: true,
      message: "Student account created successfully",
      data: {
        id: student.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        usn: student.registerNumber,
        department: selectedDepartment.name,
        departmentId: selectedDepartment.id,
        semester: student.semester,
        section: student.section,
        academicYear: student.academicYear,
        deviceBound: false,

        // Temporary for development/testing.
        // Remove this before production.
        temporaryPassword,
      },
    });
    await recordAudit(req, "CREATE", "STUDENT", student.id, { departmentId: student.departmentId });
  } catch (error) {
    console.error("Admin create student error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create student account",
    });
  }
};

/**
 * Bulk imports students from Excel or PDF file
 * 
 * Features:
 * - Automatically derives department from authenticated HOD JWT
 * - Applies single Year of Study to all extracted students
 * - Supports ?preview=true for pre-import validation without database modification
 * - Prevents intra-file duplicate USNs and database duplicate USNs
 * - Batches valid inserts with automatic User + Student creation
 */
export const importAdminStudents = async (req, res) => {
  try {
    const callerRole = req.user?.role;
    const hodDepartment = await departmentCodeForUser(req.user);

    // SECURITY ENFORCEMENT:
    // Department MUST be resolved from the authenticated HOD.
    // Client-supplied department parameter is ignored for HOD callers.
    let targetDepartmentCode = null;

    if (hodDepartment) {
      targetDepartmentCode = hodDepartment;
    } else if (isSuperAdmin(req.user) || callerRole === "SUPER_ADMIN") {
      targetDepartmentCode = String(req.body.department || req.query.department || "").trim().toUpperCase();
      if (!targetDepartmentCode) {
        return res.status(400).json({
          success: false,
          message: "department is required for institution-wide imports",
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to import students",
      });
    }

    // Validate uploaded file
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: "Please upload an Excel (.xlsx, .xls) or PDF (.pdf) file",
      });
    }

    // Validate Year of Study (1 to 4)
    const rawYear = req.body.year || req.query.year;
    const year = Number(String(rawYear ?? "").replace(/\D/g, ""));

    if (!year || year < 1 || year > 4) {
      return res.status(400).json({
        success: false,
        message: "Year of Study must be selected (1st, 2nd, 3rd, or 4th Year)",
      });
    }

    // Parse the uploaded file (Excel or PDF)
    let parsed;
    try {
      parsed = await parseStudentFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
    } catch (parseErr) {
      return res.status(400).json({
        success: false,
        message: parseErr.message || "Failed to parse the uploaded file",
      });
    }

    if (!parsed.students || parsed.students.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No student records found in the uploaded file",
      });
    }

    // Find target department in database
    const departments = await db.orm.public.Department.all();
    const targetDept = departments.find(
      (d) =>
        d.code?.toUpperCase() === targetDepartmentCode ||
        d.name?.toUpperCase().includes(targetDepartmentCode)
    );

    if (!targetDept) {
      return res.status(404).json({
        success: false,
        message: `Department ${targetDepartmentCode} not found in database`,
      });
    }

    // Fetch existing records for duplicate detection
    const existingStudents = await db.orm.public.Student.all();
    const existingUsers = await db.orm.public.User.all();

    const existingUsnMap = new Map();
    for (const s of existingStudents) {
      existingUsnMap.set(String(s.registerNumber || "").trim().toUpperCase(), s);
    }

    const existingEmailSet = new Set(
      existingUsers.map((u) => String(u.email || "").trim().toLowerCase())
    );

    // Validate each row and check for duplicates
    const seenUsnsInFile = new Set();
    const evaluatedRows = [];

    for (const student of parsed.students) {
      const usn = String(student.usn || "").trim().toUpperCase();
      const name = String(student.name || "").trim().toUpperCase();

      let status = "READY";
      let reason = null;

      if (student.invalidReason || !usn || !name) {
        status = "INVALID";
        reason = student.invalidReason || (!usn ? "Missing USN" : "Missing student name");
      } else if (seenUsnsInFile.has(usn)) {
        status = "DUPLICATE_IN_FILE";
        reason = "Duplicate USN in uploaded file";
      } else if (existingUsnMap.has(usn)) {
        status = "ALREADY_EXISTS";
        reason = "USN already exists in database";
      } else {
        seenUsnsInFile.add(usn);
      }

      evaluatedRows.push({
        usn,
        name,
        year,
        department: targetDepartmentCode,
        status,
        reason,
      });
    }

    const readyRows = evaluatedRows.filter((r) => r.status === "READY");
    const alreadyExistsRows = evaluatedRows.filter((r) => r.status === "ALREADY_EXISTS");
    const duplicateInFileRows = evaluatedRows.filter((r) => r.status === "DUPLICATE_IN_FILE");
    const invalidRows = evaluatedRows.filter((r) => r.status === "INVALID");

    // Check if this is a Preview request
    const isPreview =
      String(req.query.preview ?? req.body.preview ?? "").toLowerCase() === "true";

    if (isPreview) {
      // PREVIEW STAGE: Return validation analysis WITHOUT modifying database
      return res.status(200).json({
        success: true,
        preview: true,
        department: targetDepartmentCode,
        departmentName: targetDept.name,
        year,
        totalFound: evaluatedRows.length,
        readyToImport: readyRows.length,
        alreadyExists: alreadyExistsRows.length,
        duplicatesInFile: duplicateInFileRows.length,
        invalidRows: invalidRows.length,
        summary: {
          totalFound: evaluatedRows.length,
          readyToImport: readyRows.length,
          alreadyExists: alreadyExistsRows.length,
          duplicatesInFile: duplicateInFileRows.length,
          invalidRows: invalidRows.length,
          department: targetDepartmentCode,
          year,
        },
        students: evaluatedRows,
      });
    }

    // COMMIT STAGE: Insert valid new students into database
    if (readyRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No new or valid students to import. All records already exist or are duplicates.",
        summary: {
          totalFound: evaluatedRows.length,
          readyToImport: 0,
          alreadyExists: alreadyExistsRows.length,
          duplicatesInFile: duplicateInFileRows.length,
          invalidRows: invalidRows.length,
        },
      });
    }

    // Determine semester from year of study:
    // 1st Year -> Semester 1, 2nd Year -> Semester 3, 3rd Year -> Semester 5, 4th Year -> Semester 7
    const semester = year * 2 - 1;
    const insertedStudents = [];

    for (const item of readyRows) {
      let email = `${item.usn.toLowerCase()}@klsvdit.edu.in`;
      if (existingEmailSet.has(email)) {
        email = `${item.usn.toLowerCase()}.${Date.now()}@klsvdit.edu.in`;
      }
      existingEmailSet.add(email);

      const temporaryPassword = generateSecureTemporaryCredential();
      const passwordHash = await bcrypt.hash(temporaryPassword, 12);

      // 1. Create User account
      const user = await db.orm.public.User.create({
        name: item.name,
        email,
        passwordHash,
        role: "STUDENT",
        departmentId: targetDept.id,
        isActive: true,
        mustChangePassword: true,
      });

      // 2. Create Student record
      const student = await db.orm.public.Student.create({
        userId: user.id,
        registerNumber: item.usn,
        departmentId: targetDept.id,
        semester,
        section: "A",
        Lab: "A1",
        academicYear: "2026-27",
      });

      insertedStudents.push({
        id: student.id,
        name: user.name,
        usn: student.registerNumber,
        department: targetDepartmentCode,
        semester,
        year,
        email,
        temporaryPassword,
      });
    }

    return res.status(201).json({
      success: true,
      preview: false,
      message: `Successfully imported ${insertedStudents.length} students into ${targetDepartmentCode} (${year} Year).`,
      summary: {
        imported: insertedStudents.length,
        skipped: evaluatedRows.length - insertedStudents.length,
        alreadyExists: alreadyExistsRows.length,
        duplicatesInFile: duplicateInFileRows.length,
        invalidRows: invalidRows.length,
        totalFound: evaluatedRows.length,
        department: targetDepartmentCode,
        year,
      },
      data: insertedStudents,
    });
    await recordAudit(req, "IMPORT", "STUDENT", null, {
      created: insertedStudents.length,
      departmentId: targetDept.id,
      year,
    });
  } catch (error) {
    console.error("Admin import students error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while importing students",
    });
  }
};

/**
 * Assign division (A, B, C, D) to students within a USN range.
 * Strictly respects HOD department isolation from verified JWT.
 */
export const assignAdminStudentDivision = async (req, res) => {
  try {
    const hodDepartment = await departmentCodeForUser(req.user);

    // Support both parameter names: startUsn/endUsn or fromUsn/toUsn
    const startUsn = String(req.body.startUsn ?? req.body.fromUsn ?? "").trim().toUpperCase();
    const endUsn = String(req.body.endUsn ?? req.body.toUsn ?? "").trim().toUpperCase();
    const division = String(req.body.division ?? "").trim().toUpperCase();
    const isPreview = String(req.query.preview ?? req.body.preview ?? "").toLowerCase() === "true";

    // 1. Validation: Missing fields
    if (!startUsn) {
      return res.status(400).json({
        success: false,
        message: "Beginning USN is required",
      });
    }

    if (!endUsn) {
      return res.status(400).json({
        success: false,
        message: "Ending USN is required",
      });
    }

    if (!division) {
      return res.status(400).json({
        success: false,
        message: "Division is required (must be A, B, C, or D)",
      });
    }

    // 2. Validation: Division strictly A, B, C, or D
    if (!["A", "B", "C", "D"].includes(division)) {
      return res.status(400).json({
        success: false,
        message: "Invalid division selected. Division must be one of: A, B, C, D",
      });
    }

    // 3. Validation: USN Range ordering and prefix compatibility
    const rangeSpec = parseAndValidateUsnRange(startUsn, endUsn);
    if (!rangeSpec.valid) {
      return res.status(400).json({
        success: false,
        message: rangeSpec.error || "Invalid USN range specification",
      });
    }

    // 4. Resolve target department strictly from authenticated HOD
    const departments = await db.orm.public.Department.all();
    let targetDept = null;
    if (hodDepartment) {
      targetDept = departments.find(
        (d) => d.code?.toUpperCase() === hodDepartment.toUpperCase()
      );
    }

    // 5. Query students from database
    const allStudents = await db.orm.public.Student.all();
    const allUsers = await db.orm.public.User.all();

    let targetStudents = allStudents;
    if (targetDept) {
      targetStudents = targetStudents.filter(
        (s) => s.departmentId === targetDept.id
      );
    }

    // Filter students strictly within the validated USN range
    let matchedStudents = targetStudents.filter((s) =>
      checkUsnRange(s.registerNumber, startUsn, endUsn)
    );


    if (matchedStudents.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No students found in USN range ${startUsn} to ${endUsn}${targetDept ? ` for department ${targetDept.code}` : ""}.`,
      });
    }

    // Sort matched students by USN LOW -> HIGH
    matchedStudents.sort((a, b) =>
      compareUsn(a.registerNumber || a.usn, b.registerNumber || b.usn)
    );

    // Map matched student details
    const studentSummaries = matchedStudents.map((s) => {
      const u = allUsers.find((user) => user.id === s.userId);
      const willRealignLab = !String(s.Lab || "").startsWith(division);
      return {
        id: s.id,
        usn: s.registerNumber || s.usn,
        name: u?.name || s.name || "Student",
        currentDivision: s.section || "A",
        newDivision: division,
        currentLab: s.Lab || `${s.section || "A"}1`,
        newLab: willRealignLab ? `${division}1` : (s.Lab || `${division}1`),
        semester: s.semester,
      };
    });

    // 6. Preview Mode: Return affected count and student details without modifying DB
    if (isPreview) {
      return res.status(200).json({
        success: true,
        preview: true,
        startUsn,
        endUsn,
        division,
        department: targetDept?.code || hodDepartment || "ALL",
        departmentName: targetDept?.name || hodDepartment || "All Departments",
        affectedCount: matchedStudents.length,
        students: studentSummaries,
      });
    }

    // 7. Commit Mode: Update each student record in PostgreSQL
    for (const student of matchedStudents) {
      if (student.id) {
        try {
          const updateFields = { section: division };
          // If existing Lab does not match the new division, re-align to default batch (e.g. B1)
          // Preserves the non-null constraint while keeping division and lab strictly consistent
          if (!String(student.Lab || "").startsWith(division)) {
            const defaultLab = `${division}1`;
            updateFields.Lab = defaultLab;
            student.Lab = defaultLab;
          }
          await db.orm.public.Student.where({ id: student.id }).update(updateFields);
          student.section = division;
        } catch (dbUpdateErr) {
          // Fallback update in memory if DB is offline
          student.section = division;
          if (!String(student.Lab || "").startsWith(division)) {
            student.Lab = `${division}1`;
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      preview: false,
      message: `Division ${division} assigned to ${matchedStudents.length} student${matchedStudents.length === 1 ? "" : "s"}.`,
      updatedCount: matchedStudents.length,
      division,
      startUsn,
      endUsn,
      department: targetDept?.code || hodDepartment || "ALL",
      students: studentSummaries,
    });
  } catch (error) {
    console.error("Assign student division error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to assign division to students",
    });
  }
};

/**
 * Assign lab batch (A1-A4, B1-B4, C1-C4, D1-D4) to students within a USN range.
 * Updates PostgreSQL Student.Lab directly (SINGLE SOURCE OF TRUTH).
 * Strictly enforces HOD department isolation and division-matching constraints.
 */
export const assignAdminStudentLabBatch = async (req, res) => {
  try {
    const hodDepartment = await departmentCodeForUser(req.user);

    const startUsn = String(req.body.startUsn ?? req.body.fromUsn ?? "").trim().toUpperCase();
    const endUsn = String(req.body.endUsn ?? req.body.toUsn ?? "").trim().toUpperCase();
    const labBatch = String(req.body.labBatch ?? req.body.lab ?? "").trim().toUpperCase();
    const isPreview = String(req.query.preview ?? req.body.preview ?? "").toLowerCase() === "true";

    // 1. Validation: Missing fields
    if (!startUsn) {
      return res.status(400).json({
        success: false,
        message: "Beginning USN is required",
      });
    }

    if (!endUsn) {
      return res.status(400).json({
        success: false,
        message: "Ending USN is required",
      });
    }

    if (!labBatch) {
      return res.status(400).json({
        success: false,
        message: "Lab Batch is required (must be A1-A4, B1-B4, C1-C4, or D1-D4)",
      });
    }

    // 2. Validation: Batch format and max 4 batches per division
    const VALID_LAB_BATCHES = [
      "A1", "A2", "A3", "A4",
      "B1", "B2", "B3", "B4",
      "C1", "C2", "C3", "C4",
      "D1", "D2", "D3", "D4",
    ];

    if (!VALID_LAB_BATCHES.includes(labBatch)) {
      return res.status(400).json({
        success: false,
        message: `Invalid lab batch "${labBatch}". Maximum 4 batches per division allowed: A1-A4, B1-B4, C1-C4, D1-D4.`,
      });
    }

    const targetDivision = labBatch[0]; // e.g. "A" for "A1"

    // 3. Validation: USN Range ordering and prefix compatibility
    const rangeSpec = parseAndValidateUsnRange(startUsn, endUsn);
    if (!rangeSpec.valid) {
      return res.status(400).json({
        success: false,
        message: rangeSpec.error || "Invalid USN range specification",
      });
    }

    // 4. Resolve target department strictly from authenticated HOD
    const departments = await db.orm.public.Department.all();
    let targetDept = null;
    if (hodDepartment) {
      targetDept = departments.find(
        (d) => d.code?.toUpperCase() === hodDepartment.toUpperCase()
      );
    }

    // 5. Query students from database
    const allStudents = await db.orm.public.Student.all();
    const allUsers = await db.orm.public.User.all();

    let targetStudents = allStudents;
    if (targetDept) {
      targetStudents = targetStudents.filter(
        (s) => s.departmentId === targetDept.id
      );
    }

    // Filter students strictly within the validated USN range
    let matchedStudents = targetStudents.filter((s) =>
      checkUsnRange(s.registerNumber, startUsn, endUsn)
    );


    if (matchedStudents.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No students found in USN range ${startUsn} to ${endUsn}${targetDept ? ` for department ${targetDept.code}` : ""}.`,
      });
    }

    // Sort matched students by USN LOW -> HIGH
    matchedStudents.sort((a, b) =>
      compareUsn(a.registerNumber || a.usn, b.registerNumber || b.usn)
    );

    // 6. CRITICAL DIVISION CONSISTENCY CHECK
    // Every student in the selected range must have section matching the lab batch prefix
    const mismatchedStudents = [];
    const validDivisionStudents = [];

    for (const s of matchedStudents) {
      const studentSec = String(s.section || "").trim().toUpperCase();
      const u = allUsers.find((user) => user.id === s.userId);
      const studentInfo = {
        id: s.id,
        usn: s.registerNumber || s.usn,
        name: u?.name || s.name || "Student",
        section: studentSec,
        currentLab: s.Lab || `${studentSec}1`,
        semester: s.semester,
      };

      if (studentSec !== targetDivision) {
        mismatchedStudents.push(studentInfo);
      } else {
        validDivisionStudents.push(studentInfo);
      }
    }

    const hasMismatch = mismatchedStudents.length > 0;

    // Existing lab assignments breakdown
    let alreadyAssignedCount = 0;
    let reassignedCount = 0;
    const existingBreakdown = {};

    for (const s of matchedStudents) {
      const currentLab = s.Lab || `${s.section || "A"}1`;
      existingBreakdown[currentLab] = (existingBreakdown[currentLab] || 0) + 1;
      if (currentLab === labBatch) {
        alreadyAssignedCount++;
      } else {
        reassignedCount++;
      }
    }

    const studentSummaries = matchedStudents.map((s) => {
      const u = allUsers.find((user) => user.id === s.userId);
      const studentSec = String(s.section || "").trim().toUpperCase();
      return {
        id: s.id,
        usn: s.registerNumber || s.usn,
        name: u?.name || s.name || "Student",
        division: studentSec || "A",
        currentLab: s.Lab || `${studentSec || "A"}1`,
        newLab: labBatch,
        isMismatched: studentSec !== targetDivision,
        semester: s.semester,
      };
    });

    // 7. Preview Mode
    if (isPreview) {
      return res.status(200).json({
        success: true,
        preview: true,
        canApply: !hasMismatch,
        startUsn,
        endUsn,
        labBatch,
        division: targetDivision,
        department: targetDept?.code || hodDepartment || "ALL",
        departmentName: targetDept?.name || hodDepartment || "All Departments",
        affectedCount: matchedStudents.length,
        alreadyAssignedCount,
        reassignedCount,
        existingBreakdown,
        hasMismatch,
        mismatchedCount: mismatchedStudents.length,
        mismatchedStudents,
        mismatchMessage: hasMismatch
          ? `Range contains ${mismatchedStudents.length} student${mismatchedStudents.length === 1 ? "" : "s"} belonging to a division other than "${targetDivision}". Selected lab batch ${labBatch} can only be assigned to Division ${targetDivision} students.`
          : null,
        students: studentSummaries,
      });
    }

    // 8. Commit Mode (Apply)
    // REJECT if any student in range does not match division
    if (hasMismatch) {
      const firstMismatch = mismatchedStudents[0];
      return res.status(400).json({
        success: false,
        message: `Cannot assign lab batch ${labBatch}: Range contains student ${firstMismatch.usn} (${firstMismatch.name}) belonging to Division "${firstMismatch.section}". All students in the range must belong to Division "${targetDivision}".`,
        mismatchedCount: mismatchedStudents.length,
        mismatchedStudents,
      });
    }

    // Directly update PostgreSQL Student.Lab
    for (const student of matchedStudents) {
      if (student.id) {
        try {
          await db.orm.public.Student.where({ id: student.id }).update({
            Lab: labBatch,
          });
          student.Lab = labBatch;
        } catch (dbUpdateErr) {
          student.Lab = labBatch;
        }
      }
    }

    return res.status(200).json({
      success: true,
      preview: false,
      message: `Lab batch ${labBatch} successfully assigned to ${matchedStudents.length} student${matchedStudents.length === 1 ? "" : "s"} in Division ${targetDivision}.`,
      updatedCount: matchedStudents.length,
      labBatch,
      division: targetDivision,
      startUsn,
      endUsn,
      department: targetDept?.code || hodDepartment || "ALL",
      students: studentSummaries,
    });
  } catch (error) {
    console.error("Assign student lab batch error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to assign lab batch to students",
    });
  }
};

/**
 * PATCH /api/admin/students/:id
 * Updates an existing student.
 * Only allows editing:
 * 1. name (stored on User model)
 * 2. deviceStatus (stored on StudentDevice model - active or inactive)
 *
 * All other fields (usn, department, departmentId, semester, academicYear, section, role, email, password)
 * are strictly immutable and ignored.
 *
 * HOD department isolation: Caller can only update students belonging to their department.
 */
export const updateAdminStudent = async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (isNaN(studentId)) {
      return res.status(400).json({ success: false, message: "Invalid student ID" });
    }

    // 1. Verify caller's HOD department scope
    const hodDepartment = await departmentCodeForUser(req.user);

    const students = await db.orm.public.Student.where({ id: studentId }).all();
    if (!students || students.length === 0) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    const student = students[0];

    const departments = await db.orm.public.Department.all();
    const studentDept = departments.find((d) => d.id === student.departmentId);

    if (hodDepartment && (!studentDept || studentDept.code.toUpperCase() !== hodDepartment.toUpperCase())) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You cannot modify students outside your department.",
      });
    }

    // 2. Whitelist ONLY name and deviceStatus - all other fields discarded
    const { name, deviceStatus } = req.body;
    let updatedName = null;
    let updatedDeviceStatus = null;

    // Update Name on User record if provided
    if (typeof name === "string" && name.trim()) {
      const trimmedName = name.trim();
      if (student.userId) {
        await db.orm.public.User.where({ id: student.userId }).update({ name: trimmedName });
        updatedName = trimmedName;
      }
    }

    // Update Device Status on StudentDevice if provided
    if (deviceStatus !== undefined && deviceStatus !== null) {
      const isRegistered =
        deviceStatus === "Registered" ||
        deviceStatus === true ||
        deviceStatus === "Linked" ||
        deviceStatus === "Active";

      const existingDevices = await db.orm.public.StudentDevice.where({ studentId: student.id }).all();

      if (isRegistered) {
        if (existingDevices.length > 0) {
          // Reactivate existing device
          await db.orm.public.StudentDevice.where({ studentId: student.id }).update({ isActive: true });
          updatedDeviceStatus = "Registered";
        } else {
          // If no mobile device has registered yet, inform caller or maintain consistency
          updatedDeviceStatus = "No Device Bound";
        }
      } else {
        // Deactivate device binding
        if (existingDevices.length > 0) {
          await db.orm.public.StudentDevice.where({ studentId: student.id }).update({ isActive: false });
        }
        updatedDeviceStatus = "Not Registered";
      }
    }

    return res.status(200).json({
      success: true,
      message: "Student updated successfully.",
      data: {
        id: student.id,
        usn: student.registerNumber,
        name: updatedName,
        deviceStatus: updatedDeviceStatus,
      },
    });
  } catch (error) {
    console.error("Update admin student error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update student",
    });
  }
};

/**
 * GET /api/admin/students/:id/device
 * Retrieves device binding details for a student.
 * HOD department isolation strictly enforced.
 */
export const getAdminStudentDevice = async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (isNaN(studentId)) {
      return res.status(400).json({ success: false, message: "Invalid student ID" });
    }
    const hodDepartment = await departmentCodeForUser(req.user);

    const students = await db.orm.public.Student.where({ id: studentId }).all();
    if (!students || students.length === 0) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    const student = students[0];

    const departments = await db.orm.public.Department.all();
    const studentDept = departments.find((d) => d.id === student.departmentId);

    if (hodDepartment && (!studentDept || studentDept.code.toUpperCase() !== hodDepartment.toUpperCase())) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You cannot access device information for students outside your department.",
      });
    }

    const devices = await db.orm.public.StudentDevice.where({ studentId: student.id }).all();
    const users = await db.orm.public.User.where({ id: student.userId }).all();
    const user = users[0];

    return res.status(200).json({
      success: true,
      data: {
        studentId: student.id,
        usn: student.registerNumber,
        studentName: user?.name || "Student",
        department: studentDept?.code || "Unknown",
        devices: devices.map((d) => ({
          id: d.id,
          publicKeyFingerprint: d.publicKey && d.publicKey.length > 16 
            ? `${d.publicKey.substring(0, 8)}...${d.publicKey.substring(d.publicKey.length - 8)}`
            : d.publicKey,
          isActive: d.isActive,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
        isBound: devices.some((d) => d.isActive === true),
      },
    });
  } catch (error) {
    console.error("Get admin student device error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve student device information",
    });
  }
};

/**
 * POST /api/admin/students/:id/device/reset
 * Resets/Unbinds a student's mobile device binding.
 * Used when a student changes or loses their mobile phone.
 * HOD department isolation strictly enforced.
 */
export const resetAdminStudentDevice = async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (isNaN(studentId)) {
      return res.status(400).json({ success: false, message: "Invalid student ID" });
    }
    const hodDepartment = await departmentCodeForUser(req.user);

    const students = await db.orm.public.Student.where({ id: studentId }).all();
    if (!students || students.length === 0) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    const student = students[0];

    const departments = await db.orm.public.Department.all();
    const studentDept = departments.find((d) => d.id === student.departmentId);

    if (hodDepartment && (!studentDept || studentDept.code.toUpperCase() !== hodDepartment.toUpperCase())) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You cannot reset device binding for students outside your department.",
      });
    }

    // Deactivate/reset existing device binding
    await db.orm.public.StudentDevice.where({ studentId: student.id }).update({ isActive: false });

    return res.status(200).json({
      success: true,
      message: "Student device binding has been reset successfully. The student can now register their new device.",
    });
  } catch (error) {
    console.error("Reset admin student device error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reset student device binding",
    });
  }
};

/**
 * DELETE /api/admin/students/:id
 * Safely deletes a student.
 * Guard: If attendance records exist, deletion is rejected to protect academic audit history.
 * Cascades: Removes StudentDevice and Enrollment records, Student record, and linked User record.
 * HOD department isolation strictly enforced.
 */
export const deleteAdminStudent = async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (isNaN(studentId)) {
      return res.status(400).json({ success: false, message: "Invalid student ID" });
    }
    const hodDepartment = await departmentCodeForUser(req.user);

    const students = await db.orm.public.Student.where({ id: studentId }).all();
    if (!students || students.length === 0) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    const student = students[0];

    const departments = await db.orm.public.Department.all();
    const studentDept = departments.find((d) => d.id === student.departmentId);

    if (hodDepartment && (!studentDept || studentDept.code.toUpperCase() !== hodDepartment.toUpperCase())) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You cannot delete students outside your department.",
      });
    }

    // 1. Guard against deleting student with existing attendance history
    const attendanceRecords = await db.orm.public.Attendance.where({ studentId: student.id }).all();
    if (attendanceRecords && attendanceRecords.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete student with ${attendanceRecords.length} existing attendance record(s). Academic attendance records must be preserved.`,
      });
    }

    // 2. Safe deletion of related records
    // Remove Enrollments
    const enrollments = await db.orm.public.Enrollment.where({ studentId: student.id }).all();
    if (enrollments && enrollments.length > 0) {
      await db.orm.public.Enrollment.where({ studentId: student.id }).delete();
    }

    // Remove Student Devices
    const devices = await db.orm.public.StudentDevice.where({ studentId: student.id }).all();
    if (devices && devices.length > 0) {
      await db.orm.public.StudentDevice.where({ studentId: student.id }).delete();
    }

    // Remove Student record
    await db.orm.public.Student.where({ id: student.id }).delete();

    // Remove associated User record if present
    if (student.userId) {
      const notifs = await db.orm.public.Notification.where({ userId: student.userId }).all();
      if (notifs && notifs.length > 0) {
        await db.orm.public.Notification.where({ userId: student.userId }).delete();
      }
      await db.orm.public.User.where({ id: student.userId }).delete();
    }

    return res.status(200).json({
      success: true,
      message: "Student deleted successfully.",
      data: {
        id: student.id,
        usn: student.registerNumber,
      },
    });
  } catch (error) {
    console.error("Delete admin student error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete student",
    });
  }
};

/**
 * GET /api/admin/faculty
 * Retrieves faculty directory with HOD department isolation and DEAN filtering.
 */
export const getAdminFaculty = async (req, res) => {
  try {
    const isAdmin = isSuperAdmin(req.user) || req.user?.role === "ADMIN";
    const hodDepartment = await departmentCodeForUser(req.user);
    const isHod = Boolean(hodDepartment);

    if (!isAdmin && !isHod) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission to access the faculty directory.",
      });
    }

    // SECURITY ENFORCEMENT:
    // If caller is an HOD, their department is strictly locked from their verified JWT.
    let targetDepartment = null;
    if (hodDepartment) {
      targetDepartment = hodDepartment;
    } else {
      const queryDept = (req.query.department || "").trim().toUpperCase();
      if (queryDept && queryDept !== "ALL" && queryDept !== "DEAN" && queryDept !== "ALL DEPARTMENTS") {
        targetDepartment = queryDept;
      }
    }

    const isDeanFilter =
      String(req.query.filter || req.query.department || "").trim().toUpperCase() === "DEAN" ||
      String(req.query.isDean || "").toLowerCase() === "true";

    const faculties = await db.orm.public.Faculty.all();
    const users = await db.orm.public.User.all();
    const departments = await db.orm.public.Department.all();

    let result = (faculties || []).map((f) => {
      const u = users.find((user) => user.id === f.userId);
      const d = departments.find((dept) => dept.id === f.departmentId);
      return {
        id: f.id,
        userId: f.userId,
        name: u?.name || "Unknown",
        email: u?.email || "",
        employeeId: f.employeeId,
        department: d?.name || "Unknown",
        departmentCode: d?.code || "Unknown",
        departmentId: f.departmentId,
        designation: f.designation || null,
        isActive: u?.isActive ?? false,
        status: u?.isActive === false ? "Inactive" : "Active",
      };
    });

    // 1. Department Filter / HOD Isolation
    if (targetDepartment) {
      result = result.filter((f) =>
        hodDepartment
          ? Number(f.departmentId) === Number(req.user.departmentId)
          : f.departmentCode.toUpperCase() === targetDepartment.toUpperCase() ||
            f.department.toLowerCase().includes(targetDepartment.toLowerCase())
      );
    }

    // 2. DEAN Filter (matches faculty whose designation contains "Dean", case-insensitive)
    if (isDeanFilter) {
      result = result.filter((f) =>
        f.designation && String(f.designation).toLowerCase().includes("dean")
      );
    }

    // 3. Search Filter: Faculty Name, Employee ID, Department, Designation
    const searchTerm = (req.query.search || req.query.query || req.query.q || "")
      .trim()
      .toLowerCase();
    if (searchTerm) {
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(searchTerm) ||
          f.employeeId.toLowerCase().includes(searchTerm) ||
          f.department.toLowerCase().includes(searchTerm) ||
          f.departmentCode.toLowerCase().includes(searchTerm) ||
          (f.designation && String(f.designation).toLowerCase().includes(searchTerm))
      );
    }

    // Sort by name ASC
    result.sort((a, b) => a.name.localeCompare(b.name));

    return res.status(200).json({
      success: true,
      data: result,
      faculty: result,
      total: result.length,
      isHod: Boolean(hodDepartment),
      department: targetDepartment,
    });
  } catch (error) {
    console.error("Get admin faculty error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load faculty records",
    });
  }
};

/**
 * POST /api/admin/faculty
 * Adds a new faculty member manually.
 * Enforces HOD department isolation and validates unique employeeId & email.
 */
export const createAdminFaculty = async (req, res) => {
  try {
    const isAdmin = isSuperAdmin(req.user) || req.user?.role === "ADMIN";
    const hodDepartment = await departmentCodeForUser(req.user);
    const isHod = Boolean(hodDepartment);

    if (!isAdmin && !isHod) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission to add faculty.",
      });
    }

    const { name, employeeId, department, departmentId, email, password } = req.body;

    // Validation of required fields
    if (!name || !employeeId) {
      return res.status(400).json({
        success: false,
        message: "Faculty Name and Employee ID are required",
      });
    }

    const departments = await db.orm.public.Department.all();
    let selectedDept = null;

    if (hodDepartment) {
      // HOD can only add faculty to their authorized department
      selectedDept = departments.find(
        (d) => d.code?.toUpperCase() === hodDepartment.toUpperCase()
      );
      if (!selectedDept) {
        return res.status(403).json({
          success: false,
          message: `Department ${hodDepartment} not found in database`,
        });
      }
    } else if (departmentId) {
      selectedDept = departments.find((d) => d.id === Number(departmentId));
    } else if (department) {
      selectedDept = departments.find(
        (d) =>
          d.code?.toUpperCase() === String(department).trim().toUpperCase() ||
          d.name?.toLowerCase() === String(department).trim().toLowerCase()
      );
    }

    if (!selectedDept) {
      return res.status(400).json({
        success: false,
        message: "A valid Department is required",
      });
    }

    const normalizedEmployeeId = String(employeeId).trim().toUpperCase();
    const normalizedEmail = email
      ? String(email).trim().toLowerCase()
      : `${normalizedEmployeeId.toLowerCase()}@klsvdit.edu.in`;

    // Check duplicate employee ID
    const existingFaculty = await db.orm.public.Faculty.all();
    if (existingFaculty.some((f) => f.employeeId.toUpperCase() === normalizedEmployeeId)) {
      return res.status(409).json({
        success: false,
        message: `Employee ID "${normalizedEmployeeId}" already exists`,
      });
    }

    // Check duplicate email
    const existingUsers = await db.orm.public.User.all();
    if (existingUsers.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      return res.status(409).json({
        success: false,
        message: `Email "${normalizedEmail}" already exists`,
      });
    }

    // Secure credential handling:
    // 1. If caller explicitly provides a strong password (>= 8 chars), use it.
    // 2. Otherwise, generate a cryptographically random, high-entropy temporary credential.
    // NEVER use a universal known password (e.g. 'admin123').
    let rawPassword = password;
    let temporaryPassword = null;

    if (typeof rawPassword === "string" && rawPassword.trim().length >= 8) {
      rawPassword = rawPassword.trim();
    } else if (rawPassword && typeof rawPassword === "string" && rawPassword.trim().length > 0) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    } else {
      temporaryPassword = generateSecureTemporaryCredential();
      rawPassword = temporaryPassword;
    }

    const passwordHash = await bcrypt.hash(rawPassword, 12);

    // 1. Create User
    const user = await db.orm.public.User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      role: "FACULTY",
      departmentId: selectedDept.id,
      isActive: true,
      mustChangePassword: true,
    });

    // 2. Create Faculty record
    const faculty = await db.orm.public.Faculty.create({
      userId: user.id,
      employeeId: normalizedEmployeeId,
      departmentId: selectedDept.id,
    });

    const facultyData = {
      id: faculty.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      employeeId: faculty.employeeId,
      department: selectedDept.name,
      departmentCode: selectedDept.code,
      departmentId: selectedDept.id,
      designation: faculty.designation,
      ...(temporaryPassword ? { temporaryPassword } : {}),
    };

    return res.status(201).json({
      success: true,
      message: "Faculty member added successfully",
      data: facultyData,
      faculty: facultyData,
    });
  } catch (error) {
    console.error("Create admin faculty error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add faculty member",
    });
  }
};

/**
 * PATCH /api/admin/faculty/:id
 * Updates an existing faculty member's Name, Employee ID, Department, Designation.
 * Enforces HOD department isolation.
 */
export const updateAdminFaculty = async (req, res) => {
  try {
    const facultyId = parseInt(req.params.id, 10);
    if (isNaN(facultyId)) {
      return res.status(400).json({ success: false, message: "Invalid faculty ID" });
    }
    const isAdmin = isSuperAdmin(req.user) || req.user?.role === "ADMIN";
    const hodDepartment = await departmentCodeForUser(req.user);
    const isHod = Boolean(hodDepartment);

    if (!isAdmin && !isHod) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission to update faculty.",
      });
    }

    const faculties = await db.orm.public.Faculty.where({ id: facultyId }).all();
    if (!faculties || faculties.length === 0) {
      return res.status(404).json({ success: false, message: "Faculty member not found" });
    }
    const faculty = faculties[0];

    const departments = await db.orm.public.Department.all();
    const currentDept = departments.find((d) => d.id === faculty.departmentId);

    // HOD ISOLATION: verify target faculty belongs to HOD's department
    if (isHod && (!currentDept || currentDept.code?.toUpperCase() !== hodDepartment.toUpperCase())) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You cannot update faculty outside your authorized department.",
      });
    }

    const { name, employeeId, department, departmentId } = req.body;

    // HOD ISOLATION: An HOD MUST NOT be able to move faculty to another department.
    if (isHod && (department !== undefined || departmentId !== undefined)) {
      const reqDeptStr = String(department || "").trim().toUpperCase();
      const reqDeptId =
        departmentId !== undefined && departmentId !== null && String(departmentId).trim() !== ""
          ? Number(departmentId)
          : null;

      const targetDept = departments.find(
        (d) =>
          (reqDeptId !== null && !isNaN(reqDeptId) && d.id === reqDeptId) ||
          (reqDeptStr &&
            (d.code?.toUpperCase() === reqDeptStr ||
              d.name?.toUpperCase() === reqDeptStr))
      );

      if (targetDept) {
        if (targetDept.code?.toUpperCase() !== hodDepartment.toUpperCase()) {
          return res.status(403).json({
            success: false,
            message: "Forbidden: HODs cannot move faculty to another department.",
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid or nonexistent department specified.",
        });
      }
    }

    // 1. Update Name on User
    let updatedName = undefined;
    if (name && String(name).trim().length > 0) {
      updatedName = String(name).trim();
      await db.orm.public.User.where({ id: faculty.userId }).update({ name: updatedName });
    }

    // 2. Check and update Employee ID
    const facultyUpdates = {};
    if (employeeId && String(employeeId).trim().toUpperCase() !== faculty.employeeId) {
      const normalizedEmployeeId = String(employeeId).trim().toUpperCase();
      const allFaculty = await db.orm.public.Faculty.all();
      if (allFaculty.some((f) => f.id !== faculty.id && f.employeeId.toUpperCase() === normalizedEmployeeId)) {
        return res.status(409).json({
          success: false,
          message: `Employee ID "${normalizedEmployeeId}" is already assigned to another faculty member.`,
        });
      }
      facultyUpdates.employeeId = normalizedEmployeeId;
    }

    // 4. Update Department (Super Admin can change faculty department to any valid department in PostgreSQL)
    if (isAdmin && (department !== undefined || departmentId !== undefined)) {
      const deptQuery = String(department || "").trim();
      const deptIdQuery =
        departmentId !== undefined && departmentId !== null && String(departmentId).trim() !== ""
          ? Number(departmentId)
          : null;

      const newDept = departments.find(
        (d) =>
          (deptIdQuery !== null && !isNaN(deptIdQuery) && d.id === deptIdQuery) ||
          (deptQuery &&
            (d.code?.toUpperCase() === deptQuery.toUpperCase() ||
              d.name?.toLowerCase() === deptQuery.toLowerCase()))
      );

      if (!newDept) {
        return res.status(400).json({
          success: false,
          message: "Invalid or nonexistent department specified.",
        });
      }

      facultyUpdates.departmentId = newDept.id;
    }

    if (Object.keys(facultyUpdates).length > 0) {
      await db.orm.public.Faculty.where({ id: faculty.id }).update(facultyUpdates);
    }

    // Return updated profile
    const users = await db.orm.public.User.where({ id: faculty.userId }).all();
    const updatedUser = users[0];
    const updatedDept = departments.find(
      (d) => d.id === (facultyUpdates.departmentId || faculty.departmentId)
    );

    const updatedFacultyData = {
      id: faculty.id,
      name: updatedName || updatedUser?.name || "Faculty",
      employeeId: facultyUpdates.employeeId || faculty.employeeId,
      department: updatedDept?.name || currentDept?.name,
      departmentCode: updatedDept?.code || currentDept?.code,
      departmentId: updatedDept?.id || faculty.departmentId,
    };

    return res.status(200).json({
      success: true,
      message: "Faculty member updated successfully",
      data: updatedFacultyData,
      faculty: updatedFacultyData,
    });
  } catch (error) {
    console.error("Update admin faculty error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update faculty member",
    });
  }
};

/**
 * DELETE /api/admin/faculty/:id
 * Safely deletes a faculty member with dependency guards and HOD isolation.
 */
export const deleteAdminFaculty = async (req, res) => {
  try {
    const facultyId = parseInt(req.params.id, 10);
    if (isNaN(facultyId)) {
      return res.status(400).json({ success: false, message: "Invalid faculty ID" });
    }
    const isAdmin = isSuperAdmin(req.user) || req.user?.role === "ADMIN";
    const hodDepartment = await departmentCodeForUser(req.user);
    const isHod = Boolean(hodDepartment);

    if (!isAdmin && !isHod) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission to delete faculty.",
      });
    }

    const faculties = await db.orm.public.Faculty.where({ id: facultyId }).all();
    if (!faculties || faculties.length === 0) {
      return res.status(404).json({ success: false, message: "Faculty member not found" });
    }
    const faculty = faculties[0];

    const departments = await db.orm.public.Department.all();
    const currentDept = departments.find((d) => d.id === faculty.departmentId);

    // HOD ISOLATION: verify target faculty belongs to HOD's department
    if (isHod && (!currentDept || currentDept.code?.toUpperCase() !== hodDepartment.toUpperCase())) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You cannot delete faculty outside your authorized department.",
      });
    }

    // Safest deletion guard: Check if faculty has active class assignments
    const classes = await db.orm.public.Class.where({ facultyId: faculty.id }).all();
    if (classes && classes.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete faculty member assigned to ${classes.length} active academic class(es). Please reassign or remove class assignments first.`,
      });
    }

    // Clean up notifications for faculty user
    if (faculty.userId) {
      const notifs = await db.orm.public.Notification.where({ userId: faculty.userId }).all();
      if (notifs && notifs.length > 0) {
        await db.orm.public.Notification.where({ userId: faculty.userId }).delete();
      }
    }

    // Delete Faculty record
    await db.orm.public.Faculty.where({ id: faculty.id }).delete();

    // Delete associated User record if role is FACULTY
    if (faculty.userId) {
      const users = await db.orm.public.User.where({ id: faculty.userId }).all();
      const user = users[0];
      if (user && user.role === "FACULTY") {
        await db.orm.public.User.where({ id: user.id }).delete();
      }
    }

    return res.status(200).json({
      success: true,
      message: "Faculty member deleted successfully.",
      data: {
        id: faculty.id,
        employeeId: faculty.employeeId,
      },
    });
  } catch (error) {
    console.error("Delete admin faculty error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete faculty member",
    });
  }
};

/**
 * GET /api/admin/faculty/export
 * Generates server-side authorized exports (PDF, XLS, XLSX) for faculty.
 * Respects search, department filter, DEAN filter, and strict HOD isolation.
 * Columns: Faculty Name, Employee ID, Department, Designation (Status is omitted).
 */
export const exportAdminFaculty = async (req, res) => {
  try {
    const isAdmin = isSuperAdmin(req.user) || req.user?.role === "ADMIN";
    const hodDepartment = await departmentCodeForUser(req.user);
    const isHod = Boolean(hodDepartment);

    if (!isAdmin && !isHod) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission to export faculty records.",
      });
    }

    let targetDepartment = null;
    if (hodDepartment) {
      targetDepartment = hodDepartment;
    } else {
      const queryDept = (req.query.department || "").trim().toUpperCase();
      if (queryDept && queryDept !== "ALL" && queryDept !== "DEAN" && queryDept !== "ALL DEPARTMENTS") {
        targetDepartment = queryDept;
      }
    }

    const isDeanFilter =
      String(req.query.filter || req.query.department || "").trim().toUpperCase() === "DEAN" ||
      String(req.query.isDean || "").toLowerCase() === "true";

    const faculties = await db.orm.public.Faculty.all();
    const users = await db.orm.public.User.all();
    const departments = await db.orm.public.Department.all();

    let list = (faculties || []).map((f) => {
      const u = users.find((user) => user.id === f.userId);
      const d = departments.find((dept) => dept.id === f.departmentId);
      return {
        name: u?.name || "Unknown",
        employeeId: f.employeeId,
        department: d?.name || "Unknown",
        departmentCode: d?.code || "Unknown",
        departmentId: f.departmentId,
        designation: f.designation || "N/A",
      };
    });

    if (targetDepartment) {
      list = list.filter((f) =>
        hodDepartment
          ? Number(f.departmentId) === Number(req.user.departmentId)
          : f.departmentCode.toUpperCase() === targetDepartment.toUpperCase() ||
            f.department.toLowerCase().includes(targetDepartment.toLowerCase())
      );
    }

    if (isDeanFilter) {
      list = list.filter(
        (f) => f.designation && String(f.designation).toLowerCase().includes("dean")
      );
    }

    const searchTerm = (req.query.search || req.query.query || req.query.q || "")
      .trim()
      .toLowerCase();
    if (searchTerm) {
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(searchTerm) ||
          f.employeeId.toLowerCase().includes(searchTerm) ||
          f.department.toLowerCase().includes(searchTerm) ||
          f.departmentCode.toLowerCase().includes(searchTerm) ||
          f.designation.toLowerCase().includes(searchTerm)
      );
    }

    list.sort((a, b) => a.name.localeCompare(b.name));

    const format = String(req.query.format || "xlsx").toLowerCase();
    const timestamp = new Date().toISOString().split("T")[0];
    const deptTag = targetDepartment || (isDeanFilter ? "DEAN" : "all");

    if (format === "pdf") {
      const columns = [
        { label: "Faculty Name", width: 170 },
        { label: "Employee ID", width: 90 },
        { label: "Department", width: 150 },
        { label: "Designation", width: 110 },
      ];
      const rows = list.map((f) => [f.name, f.employeeId, f.department, f.designation]);
      const subtitle = `Filter: ${isDeanFilter ? "Dean Category" : targetDepartment || "All Departments"} | Date: ${timestamp} | Total: ${list.length} records`;

      const pdfBuffer = await generatePdfTableBuffer({
        title: "SmartAttend - Faculty Directory",
        subtitle,
        columns,
        rows,
        orientation: "portrait",
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="faculty_${deptTag}_${timestamp}.pdf"`
      );
      return res.send(pdfBuffer);
    }

    // Excel export (XLS or XLSX)
    const headerRow = ["Faculty Name", "Employee ID", "Department", "Designation"];
    const aoa = [
      headerRow,
      ...list.map((f) => [f.name, f.employeeId, f.department, f.designation]),
    ];

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(aoa);
    xlsx.utils.book_append_sheet(wb, ws, "Faculty");

    if (format === "xls") {
      const xlsBuffer = xlsx.write(wb, { type: "buffer", bookType: "biff8" });
      res.setHeader("Content-Type", "application/vnd.ms-excel");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="faculty_${deptTag}_${timestamp}.xls"`
      );
      return res.send(xlsBuffer);
    }

    // Default XLSX
    const xlsxBuffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="faculty_${deptTag}_${timestamp}.xlsx"`
    );
    return res.send(xlsxBuffer);
  } catch (error) {
    console.error("Export admin faculty error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to export faculty records",
    });
  }
};

/**
 * GET /api/admin/students/export
 * Generates server-side authorized exports (PDF, XLS, XLSX) for students.
 * Preserves USN numeric LOW -> HIGH sorting, division, lab batch, and strict HOD isolation.
 * Columns: USN, Student Name, Department, Semester, Section, Lab Batch, Academic Year, Email, Device Status.
 */
export const exportAdminStudents = async (req, res) => {
  try {
    const hodDepartment = await departmentCodeForUser(req.user);

    let targetDepartment = null;
    if (hodDepartment) {
      targetDepartment = hodDepartment;
    } else {
      const queryDept = (req.query.department || "").trim().toUpperCase();
      if (queryDept && queryDept !== "ALL" && queryDept !== "ALL DEPARTMENTS") {
        targetDepartment = queryDept;
      }
    }

    const students = await db.orm.public.Student.all();
    const users = await db.orm.public.User.all();
    const departments = await db.orm.public.Department.all();
    const devices = await db.orm.public.StudentDevice.all();

    let list = (students || []).map((s) => {
      const u = users.find((user) => user.id === s.userId);
      const d = departments.find((dept) => dept.id === s.departmentId);
      const bound = devices.some((dev) => dev.studentId === s.id && dev.isActive === true);
      return {
        usn: s.registerNumber,
        name: u?.name || "Unknown",
        department: d?.name || "Unknown",
        departmentCode: d?.code || "Unknown",
        departmentId: s.departmentId,
        semester: s.semester,
        section: s.section || "A",
        lab: s.Lab || `${s.section || "A"}1`,
        academicYear: s.academicYear || "2026-27",
        email: u?.email || "",
        deviceStatus: bound ? "Registered" : "Not Registered",
      };
    });

    // 1. Department Filter / HOD Isolation
    if (targetDepartment) {
      list = list.filter(
        (s) =>
          s.departmentCode.toUpperCase() === targetDepartment.toUpperCase() ||
          s.department.toLowerCase().includes(targetDepartment.toLowerCase())
      );
    }

    // 2. Division / Section Filter
    const sectionFilter = (req.query.section || req.query.division || "").trim().toUpperCase();
    if (sectionFilter) {
      list = list.filter((s) => s.section === sectionFilter);
    }

    // 3. Lab Batch Filter
    const labFilter = (req.query.lab || req.query.labBatch || "").trim().toUpperCase();
    if (labFilter) {
      list = list.filter((s) => s.lab === labFilter);
    }

    // 4. Search Filter
    const searchTerm = (req.query.search || req.query.query || req.query.q || "")
      .trim()
      .toLowerCase();
    if (searchTerm) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(searchTerm) ||
          s.usn.toLowerCase().includes(searchTerm) ||
          s.email.toLowerCase().includes(searchTerm)
      );
    }

    // 5. Sort by USN LOW -> HIGH numeric-aware
    list.sort((a, b) => compareUsn(a.usn, b.usn));

    const format = String(req.query.format || "xlsx").toLowerCase();
    const timestamp = new Date().toISOString().split("T")[0];
    const deptTag = targetDepartment || "all";

    if (format === "pdf") {
      const columns = [
        { label: "USN", width: 80 },
        { label: "Student Name", width: 140 },
        { label: "Department", width: 110 },
        { label: "Sem", width: 35 },
        { label: "Sec", width: 35 },
        { label: "Lab", width: 40 },
        { label: "Academic Year", width: 80 },
      ];
      const rows = list.map((s) => [
        s.usn,
        s.name,
        s.departmentCode || s.department,
        String(s.semester),
        s.section,
        s.lab,
        s.academicYear,
      ]);
      const subtitle = `Department: ${targetDepartment || "All"} | Date: ${timestamp} | Total: ${list.length} students (Sorted USN Low -> High)`;

      const pdfBuffer = await generatePdfTableBuffer({
        title: "SmartAttend - Student Directory",
        subtitle,
        columns,
        rows,
        orientation: "portrait",
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="students_${deptTag}_${timestamp}.pdf"`
      );
      return res.send(pdfBuffer);
    }

    // Excel export (XLS or XLSX)
    const headerRow = [
      "USN",
      "Student Name",
      "Department",
      "Semester",
      "Section",
      "Lab Batch",
      "Academic Year",
      "Email",
      "Device Status",
    ];
    const aoa = [
      headerRow,
      ...list.map((s) => [
        s.usn,
        s.name,
        s.department,
        s.semester,
        s.section,
        s.lab,
        s.academicYear,
        s.email,
        s.deviceStatus,
      ]),
    ];

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(aoa);
    xlsx.utils.book_append_sheet(wb, ws, "Students");

    if (format === "xls") {
      const xlsBuffer = xlsx.write(wb, { type: "buffer", bookType: "biff8" });
      res.setHeader("Content-Type", "application/vnd.ms-excel");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="students_${deptTag}_${timestamp}.xls"`
      );
      return res.send(xlsBuffer);
    }

    // Default XLSX
    const xlsxBuffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="students_${deptTag}_${timestamp}.xlsx"`
    );
    return res.send(xlsxBuffer);
  } catch (error) {
    console.error("Export admin students error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to export student records",
    });
  }
};
