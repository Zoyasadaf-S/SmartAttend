import { db } from "../prisma/db.js";

export const recordAudit = async (req, action, resourceType, resourceId, metadata = {}) => {
  await db.orm.public.AuditLog.create({
    actorUserId: Number(req.user.id),
    action,
    resourceType,
    resourceId: resourceId === undefined || resourceId === null ? null : String(resourceId),
    metadata: JSON.stringify(metadata),
    visibility: req.user.isDeveloperAccount ? "INTERNAL" : "COLLEGE",
  });
};