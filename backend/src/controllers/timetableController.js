import { db } from "../prisma/db.js";
import { recordAudit } from "../utils/audit.js";

export const getTimetable = async (req, res) => {
  try {
    const timetable = await db.orm.public.Timetable.all();
    let visibleTimetable = timetable;

    if (req.user.role === "ADMIN") {
      const classes = await db.orm.public.Class.all();
      const scopedClassIds = classes
        .filter((item) => item.departmentId === Number(req.user.departmentId))
        .map((item) => item.id);
      visibleTimetable = timetable.filter((item) => scopedClassIds.includes(item.classId));
    } else if (req.user.role === "FACULTY") {
      const faculty = (await db.orm.public.Faculty.where({ userId: Number(req.user.id) }).all())[0];
      const classes = await db.orm.public.Class.all();
      const classIds = new Set(classes.filter((item) => item.facultyId === faculty?.id).map((item) => item.id));
      visibleTimetable = timetable.filter((item) => classIds.has(item.classId));
    } else if (req.user.role === "STUDENT") {
      const student = (await db.orm.public.Student.where({ userId: Number(req.user.id) }).all())[0];
      const enrollments = student ? await db.orm.public.Enrollment.all() : [];
      const classIds = new Set(enrollments.filter((item) => item.studentId === student?.id).map((item) => item.classId));
      visibleTimetable = timetable.filter((item) => classIds.has(item.classId));
    }

    res.status(200).json({
      success: true,
      data: visibleTimetable,
    });
  } catch (error) {
    console.error("Error fetching timetable:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch timetable",
    });
  }
};

export const createTimetable = async (req, res) => {
  try {
    const { classId, dayOfWeek, startTime, endTime, room } = req.body;

    if (!classId || dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Class ID, day, start time and end time are required",
      });
    }

    // Check class
    const classes = await db.orm.public.Class.all();

    const selectedClass = classes.find((item) => item.id === Number(classId));

    if (!selectedClass) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    if (req.user.role === "ADMIN" && selectedClass.departmentId !== Number(req.user.departmentId)) {
      return res.status(403).json({
        success: false,
        message: "HODs can manage timetable only for their own department",
      });
    }

    const day = Number(dayOfWeek);
    if (!Number.isInteger(day) || day < 0 || day > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || startTime >= endTime) {
      return res.status(400).json({
        success: false,
        message: "Valid day and non-overlapping start/end times are required",
      });
    }

    const existing = await db.orm.public.Timetable.all();
    if (existing.some((item) => item.classId === Number(classId) && item.dayOfWeek === day && startTime < item.endTime && endTime > item.startTime)) return res.status(409).json({ success: false, message: "Timetable entry conflicts with an existing entry" });

    const timetable = await db.orm.public.Timetable.create({
      classId: Number(classId),
      dayOfWeek: day,
      startTime,
      endTime,
      room: room || null,
    });

    res.status(201).json({
      success: true,
      message: "Timetable created successfully",
      data: timetable,
    });
    await recordAudit(req, "CREATE", "TIMETABLE", timetable.id, { classId: timetable.classId });
  } catch (error) {
    console.error("Error creating timetable:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create timetable",
    });
  }
};

const getScopedTimetable = async (req, timetableId) => {
  const entries = await db.orm.public.Timetable.where({ id: timetableId }).all();
  const entry = entries[0];
  if (!entry) return { entry: null, classItem: null };
  const classes = await db.orm.public.Class.all();
  return { entry, classItem: classes.find((item) => item.id === entry.classId) };
};

const canManageTimetable = (user, classItem) =>
  Boolean(classItem) && (user.role === "SUPER_ADMIN" || Number(user.departmentId) === Number(classItem.departmentId));

export const updateTimetable = async (req, res) => {
  try {
    const timetableId = Number(req.params.id);
    const { entry, classItem } = await getScopedTimetable(req, timetableId);
    if (!entry) return res.status(404).json({ success: false, message: "Timetable entry not found" });
    if (!canManageTimetable(req.user, classItem)) return res.status(403).json({ success: false, message: "You are not authorized to update this timetable entry" });
    const day = req.body.dayOfWeek === undefined ? entry.dayOfWeek : Number(req.body.dayOfWeek);
    const startTime = req.body.startTime === undefined ? entry.startTime : String(req.body.startTime);
    const endTime = req.body.endTime === undefined ? entry.endTime : String(req.body.endTime);
    if (!Number.isInteger(day) || day < 0 || day > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || startTime >= endTime) return res.status(400).json({ success: false, message: "Valid day and non-overlapping start/end times are required" });
    const existing = await db.orm.public.Timetable.all();
    if (existing.some((item) => item.id !== timetableId && item.classId === entry.classId && item.dayOfWeek === day && startTime < item.endTime && endTime > item.startTime)) return res.status(409).json({ success: false, message: "Timetable entry conflicts with an existing entry" });
    const updated = await db.orm.public.Timetable.where({ id: timetableId }).update({ dayOfWeek: day, startTime, endTime, room: req.body.room === undefined ? entry.room : req.body.room || null });
    await recordAudit(req, "UPDATE", "TIMETABLE", timetableId, { classId: entry.classId });
    return res.status(200).json({ success: true, message: "Timetable updated successfully", data: updated });
  } catch (error) {
    console.error("Error updating timetable:", error);
    return res.status(500).json({ success: false, message: "Failed to update timetable" });
  }
};

export const deleteTimetable = async (req, res) => {
  try {
    const timetableId = Number(req.params.id);
    const { entry, classItem } = await getScopedTimetable(req, timetableId);
    if (!entry) return res.status(404).json({ success: false, message: "Timetable entry not found" });
    if (!canManageTimetable(req.user, classItem)) return res.status(403).json({ success: false, message: "You are not authorized to delete this timetable entry" });
    await db.orm.public.Timetable.where({ id: timetableId }).delete();
    await recordAudit(req, "DELETE", "TIMETABLE", timetableId, { classId: entry.classId });
    return res.status(200).json({ success: true, message: "Timetable entry deleted successfully" });
  } catch (error) {
    console.error("Error deleting timetable:", error);
    return res.status(500).json({ success: false, message: "Failed to delete timetable entry" });
  }
};
