import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

const backend = () => process.env.BACKEND_INTERNAL_URL || process.env.ADMIN_BACKEND_URL || 'http://localhost:5001'

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1'
    const rateLimit = checkRateLimit(ip)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
    }

    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const response = await fetch(`${backend()}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: email, password }),
      cache: 'no-store',
    })
    const body = await response.json().catch(() => ({ error: 'Authentication service unavailable' }))
    if (!response.ok) {
      return NextResponse.json({ error: body.message || body.error || 'Login failed' }, { status: response.status })
    }

    const next = NextResponse.json({
      success: true,
      redirect: body.mustChangePassword ? '/change-password' : '/admin/dashboard',
      mustChangePassword: Boolean(body.mustChangePassword),
    })
    const cookie = response.headers.get('set-cookie')
    if (cookie) next.headers.set('set-cookie', cookie)
    return next
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Authentication service unavailable' }, { status: 500 })
  }
}
