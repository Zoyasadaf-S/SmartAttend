# Manual login testing

SmartAttend does not ship hardcoded admin passwords.

Use accounts that already exist in your shared PostgreSQL `User` table.

## Roles

- `SUPER_ADMIN`: institution-wide access. Two SUPER_ADMIN accounts may exist (college and developer). Developer accounts stay hidden from college-facing audit presentation.
- `ADMIN`: department HOD. Scope is taken from `User.departmentId`, never from the browser.
- `FACULTY` / `STUDENT`: application users. They cannot use the admin portal login.

## How to test

1. Start PostgreSQL and set `DATABASE_URL` in `backend/.env`.
2. Apply `backend/migrations/sql/0001_security_admin_additive.sql` if those columns/tables are missing.
3. Start backend and frontend.
4. Open `/admin/login`.
5. Sign in with a real SUPER_ADMIN or HOD email and password from the database.
6. If `mustChangePassword` is true, you will be redirected to `/change-password`.

## Creating more accounts

- SUPER_ADMIN can create SUPER_ADMIN, ADMIN (HOD), faculty, and students.
- HOD/ADMIN can create another ADMIN in the same department, plus faculty and students (manual and import).
- Record the password you type when creating a user. It is hashed with bcrypt and is not stored in source control or logs.
- Student import generates a one-time temporary password in the import API response for the creating admin. It is not written to logs.

Do not commit real usernames/passwords.
