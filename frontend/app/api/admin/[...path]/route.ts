import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const backend = () => process.env.BACKEND_INTERNAL_URL || process.env.ADMIN_BACKEND_URL || 'http://localhost:5001'

function targetPath(path: string[]) {
  const joined = path.join('/')
  if (joined === 'timetable' || joined.startsWith('timetable/')) {
    return `/api/timetable/${joined.slice('timetable'.length).replace(/^\//, '')}`.replace(/\/$/, '') || '/api/timetable'
  }
  if (joined === 'classes' || joined.startsWith('classes/')) {
    return `/api/classes/${joined.slice('classes'.length).replace(/^\//, '')}`.replace(/\/$/, '') || '/api/classes'
  }
  if (joined === 'students' || joined.startsWith('students/')) {
    return `/api/admin/students/${joined.slice('students'.length).replace(/^\//, '')}`.replace(/\/$/, '') || '/api/admin/students'
  }
  if (joined === 'faculty' || joined.startsWith('faculty/')) {
    return `/api/admin/faculty/${joined.slice('faculty'.length).replace(/^\//, '')}`.replace(/\/$/, '') || '/api/admin/faculty'
  }
  return `/api/admin/${joined}`
}

async function forward(req: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  const url = new URL(req.url)
  const contentType = req.headers.get('content-type') ?? ''
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.from(await req.arrayBuffer())
  const headers: Record<string, string> = {
    cookie: req.headers.get('cookie') ?? '',
  }
  if (contentType) headers['Content-Type'] = contentType
  const response = await fetch(`${backend()}${targetPath(path)}${url.search}`, {
    method: req.method,
    headers,
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  })
  const result = new NextResponse(await response.arrayBuffer(), { status: response.status })
  result.headers.set('Content-Type', response.headers.get('content-type') ?? 'application/json')
  const disposition = response.headers.get('content-disposition')
  if (disposition) result.headers.set('Content-Disposition', disposition)
  const setCookie = response.headers.get('set-cookie')
  if (setCookie) result.headers.set('set-cookie', setCookie)
  if (response.status === 401) {
    result.cookies.set('sa_admin_session', '', { httpOnly: true, path: '/', maxAge: 0 })
    result.cookies.set('sa_session', '', { httpOnly: true, path: '/', maxAge: 0 })
  }
  return result
}

export const GET = forward
export const POST = forward
export const PUT = forward
export const PATCH = forward
export const DELETE = forward
