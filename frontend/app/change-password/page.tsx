'use client'

import { FormEvent, useState } from 'react'
import { Eye, EyeOff, Shield } from 'lucide-react'

export default function ChangePasswordPage() {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    const form = new FormData(event.currentTarget)
    const newPassword = String(form.get('newPassword') || '')
    if (newPassword !== form.get('confirmPassword')) {
      setLoading(false)
      return setMessage('Passwords do not match.')
    }
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: form.get('currentPassword'),
        newPassword,
      }),
    })
    const body = await response.json().catch(() => ({}))
    setLoading(false)
    if (!response.ok) return setMessage(body.error || body.message || 'Password change failed.')
    window.location.assign('/admin/dashboard')
  }

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-background">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-8">
        <div className="flex items-center gap-2">
          <Shield className="size-4" />
          <h1 className="text-2xl font-semibold">Choose a new password</h1>
        </div>
        <p className="text-sm text-muted-foreground">Use at least 12 characters with uppercase, lowercase, and a number.</p>
        {(['currentPassword', 'newPassword', 'confirmPassword'] as const).map((name) => (
          <div key={name} className="relative">
            <input
              required
              name={name}
              type={visible[name] ? 'text' : 'password'}
              placeholder={name === 'currentPassword' ? 'Current password' : name === 'newPassword' ? 'New password' : 'Confirm password'}
              className="w-full h-10 rounded-md border border-input px-3 pr-10 text-sm"
            />
            <button
              type="button"
              aria-label={visible[name] ? `Hide ${name}` : `Show ${name}`}
              onClick={() => setVisible((state) => ({ ...state, [name]: !state[name] }))}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
            >
              {visible[name] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        ))}
        <button disabled={loading} className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm" type="submit">
          Change password
        </button>
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      </form>
    </main>
  )
}
