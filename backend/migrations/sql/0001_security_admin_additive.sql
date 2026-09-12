-- Additive SmartAttend security/admin schema updates.
-- Safe to run on a compatible existing PostgreSQL database.
-- Do not run prisma migrate reset, DROP, or TRUNCATE.

DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "departmentId" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isDeveloperAccount" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMPTZ;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "temporaryPasswordExpiresAt" TIMESTAMPTZ;

ALTER TABLE "Faculty" ADD COLUMN IF NOT EXISTS "designation" TEXT;

CREATE TABLE IF NOT EXISTS "AdminSession" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "PasswordReset" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "otpHash" TEXT NOT NULL,
  "resetHash" TEXT UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "verifiedAt" TIMESTAMPTZ,
  "usedAt" TIMESTAMPTZ,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" SERIAL PRIMARY KEY,
  "actorUserId" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "metadata" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'COLLEGE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
