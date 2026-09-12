import bcrypt from "bcryptjs";
import { db } from "../prisma/db.js";
import { generateToken } from "../utils/jwt.js";

export const login = async (req, res) => {
  try {
    const { password } = req.body;
    const identifier = req.body.identifier ?? req.body.email;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Identifier and password are required",
      });
    }

    const normalizedIdentifier = String(identifier).trim().toLowerCase();

    // 1. Try to find user by email
    const usersByEmail = await db.orm.public.User.where({
      email: normalizedIdentifier,
    }).all();
    let user = usersByEmail[0];

    // 2. If not found, try Student login using USN / register number
    if (!user) {
      try {
        const studentsByReg = await db.orm.public.Student.where({
          registerNumber: normalizedIdentifier,
        }).all();
        const student = studentsByReg[0];

        if (student) {
          const usersById = await db.orm.public.User.where({
            id: student.userId,
          }).all();
          user = usersById[0];
        }
      } catch (e) {
        console.error("Error fetching student during login:", e);
      }
    }

    // 3. If still not found, try Faculty login using Faculty ID / employee ID
    if (!user) {
      try {
        const facultiesById = await db.orm.public.Faculty.where({
          employeeId: normalizedIdentifier,
        }).all();
        const faculty = facultiesById[0];

        if (faculty) {
          const usersById = await db.orm.public.User.where({
            id: faculty.userId,
          }).all();
          user = usersById[0];
        }
      } catch (e) {
        console.error("Error fetching faculty during login:", e);
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid identifier or password",
      });
    }

    if (req.adminOnly && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "User account is inactive",
      });
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid identifier or password",
      });
    }

    const token = generateToken(user);

    res.cookie("sa_admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          departmentId: user.departmentId ?? null,
          mustChangePassword: Boolean(user.mustChangePassword),
        },
        token,
      },
      mustChangePassword: Boolean(user.mustChangePassword),
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

export const getMe = async (req, res) => {
  try {
    const usersById = await db.orm.public.User.where({
      id: Number(req.user.id),
    }).all();
    const user = usersById[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        departmentId: user.departmentId ?? null,
        mustChangePassword: Boolean(user.mustChangePassword),
        isDeveloperAccount: user.isDeveloperAccount === true,
      },
    });
  } catch (error) {
    console.error("Get current user error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch current user",
    });
  }
};

const isStrongPassword = (password) =>
  typeof password === "string" &&
  password.length >= 12 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /\d/.test(password);

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "New password must contain at least 12 characters, an uppercase letter, a lowercase letter, and a number",
      });
    }

    const usersById = await db.orm.public.User.where({
      id: Number(req.user.id),
    }).all();
    const user = usersById[0];

    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from the current password",
      });
    }

    await db.orm.public.User.where({ id: user.id }).update({
      passwordHash: await bcrypt.hash(newPassword, 12),
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
      passwordChangedAt: new Date().toISOString(),
      sessionVersion: (user.sessionVersion || 0) + 1,
    });

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({
      success: false,
      message: "Password change failed",
    });
  }
};
