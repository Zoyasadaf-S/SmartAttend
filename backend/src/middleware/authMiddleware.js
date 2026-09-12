import jwt from "jsonwebtoken";
import { db } from "../prisma/db.js";

export const authenticate = async (req, res, next) => {
  try {
    let token = null;

    // 1. Check for Bearer token in Authorization header (for Mobile/Common APIs)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
    // 2. Fallback to sa_admin_session cookie (for Admin Portal)
    else if (req.cookies?.sa_admin_session) {
      token = req.cookies.sa_admin_session;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const users = await db.orm.public.User.where({ id: Number(decoded.id) }).all();
    const user = users[0];

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid or inactive account",
      });
    }

    if (
      decoded.sessionVersion !== undefined &&
      Number(decoded.sessionVersion) !== Number(user.sessionVersion || 0)
    ) {
      return res.status(401).json({
        success: false,
        message: "Authentication session is no longer valid",
      });
    }

    // Authorization scope comes from the current database row, never the client token.
    req.user = {
      ...decoded,
      id: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      isDeveloperAccount: user.isDeveloperAccount === true,
      sessionVersion: user.sessionVersion || 0,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token",
    });
  }
};
