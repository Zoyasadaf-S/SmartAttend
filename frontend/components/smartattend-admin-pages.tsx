'use client'

import React, { useEffect, useState } from 'react'
import { Eye, EyeOff, Plus, ShieldAlert } from 'lucide-react'
import { AdminShell, AdminContent, StatusBadge } from './admin-shell'

type AdminUser = {
  id: number
  name: string
  email: string
  role: string
  isActive?: boolean
  departmentId?: number | null
}

export function UsersRolesPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'FACULTY', departmentId: '' })
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || json.error || 'Failed to load users')
      setUsers(json.data || [])
    } catch (err) {
      setUsers([])
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          departmentId: form.role === 'SUPER_ADMIN' ? null : Number(form.departmentId),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || json.error || 'Failed to create user')
      setForm({ name: '', email: '', password: '', role: 'FACULTY', departmentId: '' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminShell>
      <AdminContent>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Users & Roles</h1>
            <p className="text-sm text-muted-foreground mt-1">SUPER_ADMIN can create SUPER_ADMIN, HOD (ADMIN), and faculty accounts. HOD and faculty access remains department-scoped.</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <form onSubmit={createUser} className="rounded-xl border border-border bg-card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Name" className="h-10 rounded-md border border-input px-3 text-sm" />
            <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" className="h-10 rounded-md border border-input px-3 text-sm" />
            <div className="relative">
              <input required type={showPassword ? 'text' : 'password'} minLength={12} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Password (12+)" className="h-10 w-full rounded-md border border-input px-3 pr-10 text-sm" />
              <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="h-10 rounded-md border border-input px-3 text-sm">
              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
              <option value="ADMIN">ADMIN (HOD)</option>
              <option value="FACULTY">FACULTY</option>
            </select>
            <input value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })} placeholder="Dept ID" className="h-10 rounded-md border border-input px-3 text-sm" />
            <button disabled={saving} className="inline-flex items-center justify-center h-10 rounded-md text-sm font-medium bg-primary text-primary-foreground">
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </button>
          </form>
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3 border-b border-border">User</th>
                    <th className="px-6 py-3 border-b border-border">Role</th>
                    <th className="px-6 py-3 border-b border-border">Department</th>
                    <th className="px-6 py-3 border-b border-border">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td className="px-6 py-8 text-muted-foreground" colSpan={4}>Loading users…</td></tr>
                  ) : users.length === 0 ? (
                    <tr><td className="px-6 py-8 text-muted-foreground" colSpan={4}>No users found.</td></tr>
                  ) : users.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="px-6 py-4">{u.role}</td>
                      <td className="px-6 py-4">{u.departmentId ?? '—'}</td>
                      <td className="px-6 py-4"><StatusBadge status={u.isActive === false ? 'Inactive' : 'Active'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </AdminContent>
    </AdminShell>
  )
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/audit-logs', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load audit logs')
        setLogs(json.data || [])
      })
      .catch((err) => setError(err.message || 'Failed to load audit logs'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AdminShell>
      <AdminContent>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Audit Logs</h1>
            <p className="text-sm text-muted-foreground mt-1">Sensitive administrative actions from the live database.</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3 border-b border-border">Action</th>
                    <th className="px-6 py-3 border-b border-border">Performed By</th>
                    <th className="px-6 py-3 border-b border-border">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td className="px-6 py-8 text-muted-foreground" colSpan={3}>Loading audit logs…</td></tr>
                  ) : logs.length === 0 ? (
                    <tr><td className="px-6 py-8 text-muted-foreground" colSpan={3}>No audit entries yet.</td></tr>
                  ) : logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 rounded-full p-1 border bg-muted text-muted-foreground border-border">
                            <ShieldAlert className="size-3.5" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{log.action} {log.resourceType}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{log.resourceId || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{log.actorName || log.actorEmail || log.actorUserId}</td>
                      <td className="px-6 py-4 text-muted-foreground">{log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </AdminContent>
    </AdminShell>
  )
}

export function ReportsPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/reports/summary', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load reports')
        setData(json.data)
      })
      .catch((err) => setError(err.message || 'Failed to load reports'))
      .finally(() => setLoading(false))
  }, [])

  const cards = [
    { title: 'Students', value: data?.totalStudents },
    { title: 'Faculty', value: data?.totalFaculty },
    { title: 'Classes', value: data?.totalClasses },
    { title: 'Sessions', value: data?.totalSessions },
    { title: 'Present', value: data?.present },
    { title: 'Absent', value: data?.absent },
  ]

  return (
    <AdminShell>
      <AdminContent>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reports & Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">Live attendance metrics scoped to the authenticated account.</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {loading ? <p className="text-sm text-muted-foreground">Loading reports…</p> : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cards.map(card => (
                <div key={card.title} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <h3 className="font-semibold text-foreground">{card.title}</h3>
                  <p className="text-3xl font-semibold mt-3">{card.value ?? 0}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </AdminContent>
    </AdminShell>
  )
}

// ─── Settings Page ────────────────────────────────────────────────────────────
export function SettingsPage() {
  return (
    <AdminShell>
      <AdminContent>
        <div className="space-y-6 max-w-4xl">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">System Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">Configure global application preferences.</p>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex border-b border-border bg-muted/30">
              <button className="px-4 py-3 text-sm font-medium text-foreground border-b-2 border-primary bg-background">General</button>
              <button className="px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">Attendance Rules</button>
              <button className="px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">Security</button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Institution Name</label>
                  <input type="text" defaultValue="ABC Engineering College" className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Timezone</label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring">
                    <option>Asia/Kolkata (IST)</option>
                    <option>UTC</option>
                  </select>
                </div>
              </div>
              
              <div className="space-y-4 pt-4 border-t border-border">
                <h3 className="font-semibold text-foreground">Notifications</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Daily Summary Email</p>
                    <p className="text-xs text-muted-foreground">Receive attendance summary at 6 PM</p>
                  </div>
                  <div className="w-10 h-6 bg-primary rounded-full relative cursor-pointer">
                    <div className="w-4 h-4 bg-primary-foreground rounded-full absolute top-1 right-1" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Alert on Absentees</p>
                    <p className="text-xs text-muted-foreground">Notify when a class has &lt; 50% attendance</p>
                  </div>
                  <div className="w-10 h-6 bg-muted border border-border rounded-full relative cursor-pointer">
                    <div className="w-4 h-4 bg-muted-foreground rounded-full absolute top-1 left-1" />
                  </div>
                </div>
              </div>

              <div className="pt-6 flex justify-end">
                <button className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm">
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      </AdminContent>
    </AdminShell>
  )
}
