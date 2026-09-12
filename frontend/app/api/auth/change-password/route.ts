import { NextResponse } from 'next/server'

const backend = () => process.env.BACKEND_INTERNAL_URL || process.env.ADMIN_BACKEND_URL || 'http://localhost:5001'

export async function POST(req: Request) {
  const body = await req.json()
  const response = await fetch(`${backend()}/api/admin/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') ?? '',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({ error: 'Password service unavailable' }))
  return NextResponse.json(
    { success: response.ok, error: payload.message || payload.error, message: payload.message },
    { status: response.status },
  )
}
