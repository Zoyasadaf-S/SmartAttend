import { NextResponse } from 'next/server'

const backend = () => process.env.BACKEND_INTERNAL_URL || process.env.ADMIN_BACKEND_URL || 'http://localhost:5001'

export async function POST(req: Request) {
  const response = await fetch(`${backend()}/api/admin/auth/logout`, {
    method: 'POST',
    headers: { cookie: req.headers.get('cookie') ?? '' },
    cache: 'no-store',
  })
  const next = NextResponse.json({ success: true, redirect: '/admin/login' })
  const cookie = response.headers.get('set-cookie')
  if (cookie) next.headers.set('set-cookie', cookie)
  next.cookies.set('sa_admin_session', '', { httpOnly: true, path: '/', maxAge: 0 })
  next.cookies.set('sa_session', '', { httpOnly: true, path: '/', maxAge: 0 })
  return next
}
