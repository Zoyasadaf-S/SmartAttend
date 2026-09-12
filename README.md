# SmartAttend

Production-oriented attendance platform: Express + Prisma backend and Next.js admin portal sharing one PostgreSQL database.

## Structure

- `backend/` Express API, Prisma, auth/RBAC, student import/export, mobile/BLE attendance APIs
- `frontend/` Next.js admin portal (teammate UI)
- `mobile/` existing mobile app (do not change for this integration)

## Fresh developer setup

1. Install Node.js 18+.
2. Create a PostgreSQL database.
3. Copy environment templates:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

4. Set `DATABASE_URL`, `JWT_SECRET`, and CORS/frontend URLs. Do not commit `.env` files.
5. Install dependencies:

```bash
npm run install:all
```

6. Apply additive schema updates if your database does not already contain the security/admin columns:

```bash
psql "$DATABASE_URL" -f backend/migrations/sql/0001_security_admin_additive.sql
```

Then emit the Prisma contract from `backend/`:

```bash
npm run contract:emit --prefix backend
```

7. Start both apps:

```bash
npm run dev
```

- Admin UI: http://localhost:3000
- API: http://localhost:5000
- Health: http://localhost:5000/api/health

## Authentication

Admin portal uses an HttpOnly `sa_admin_session` cookie. Do not store tokens in localStorage.

- SUPER_ADMIN: institution-wide
- ADMIN: HOD, own `User.departmentId` only
- Faculty/student mobile APIs continue to use Bearer tokens

See `docs/TEST_LOGIN.md` for how to test with real database accounts.

## Notes

- Live Attendance and Devices were removed from the admin web UI. Mobile/BLE/attendance backends remain.
- There is no demo/mock data fallback. API failures show error states.
- The database is shared. Admin portal changes use the same PostgreSQL schema as the mobile app.
