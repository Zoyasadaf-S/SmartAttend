'use client'

import React, { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Calendar,
  Settings,
  Bell,
  Search,
  LogOut,
  ChevronDown,
  Shield,
  Activity,
  FileText,
} from 'lucide-react'

// Common UI Components
export function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block text-foreground">
      {children}
      {required && <span className="text-destructive ml-1">*</span>}
    </label>
  )
}

export function Inp({
  type = 'text',
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
  disabled
}: {
  type?: string
  value: string
  onChange: (val: string) => void
  placeholder?: string
  prefix?: ReactNode
  suffix?: ReactNode
  disabled?: boolean
}) {
  return (
    <div className="relative">
      {prefix && (
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
          {prefix}
        </div>
      )}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50
          ${prefix ? 'pl-10' : ''} ${suffix ? 'pr-10' : ''}
        `}
      />
      {suffix && (
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground">
          {suffix}
        </div>
      )}
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const isGood = ['active', 'linked', 'present', 'registered', 'bound'].includes(status.toLowerCase())
  const isWarn = ['pending', 'leave'].includes(status.toLowerCase())
  
  let bgClass = 'bg-muted text-muted-foreground border-border'
  let dotClass = 'bg-muted-foreground'
  
  if (isGood) {
    bgClass = 'bg-green-50 text-green-700 border-green-200'
    dotClass = 'bg-green-500'
  } else if (isWarn) {
    bgClass = 'bg-amber-50 text-amber-700 border-amber-200'
    dotClass = 'bg-amber-500'
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${bgClass}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      {status}
    </div>
  )
}

const SIDEBAR_ITEMS = [
  { label: 'Overview', icon: LayoutDashboard, href: '/admin/dashboard' },
  { label: 'Students', icon: GraduationCap, href: '/admin/students' },
  { label: 'Faculty', icon: Users, href: '/admin/faculty' },
  { label: 'Timetable', icon: Calendar, href: '/admin/timetable' },
  { label: 'Attendance Sheet', icon: FileText, href: '/admin/attendance-sheet' },
  { label: 'Reports', icon: FileText, href: '/admin/reports' },
  { label: 'Users', icon: Shield, href: '/admin/users' },
  { label: 'Audit Logs', icon: Activity, href: '/admin/audit-logs' },
  { label: 'Settings', icon: Settings, href: '/admin/settings' },
]

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  const [backendStatus, setBackendStatus] = React.useState<'checking' | 'live' | 'offline'>('checking')

  React.useEffect(() => {
    let mounted = true
    import('@/lib/api').then(({ checkBackendHealth }) => {
      checkBackendHealth().then(res => {
        if (mounted) {
          setBackendStatus(res.status === 'OK' ? 'live' : 'offline')
        }
      })
    })
    return () => { mounted = false }
  }, [])

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card hidden md:flex flex-col h-screen sticky top-0">
        {/* Brand */}
        <div className="h-14 border-b border-border flex items-center px-4 gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Shield className="size-4" />
          </div>
          <span className="font-semibold text-foreground tracking-tight">SmartAttend</span>
        </div>

        {/* Search */}
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search anything..."
              className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-4 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {SIDEBAR_ITEMS.map(item => {
            const Icon = item.icon
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* User Card */}
        <div className="p-4 border-t border-border">
          <button 
            onClick={handleLogout}
            className="flex w-full items-center justify-between rounded-md p-2 hover:bg-accent transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">
                AK
              </div>
              <div>
                <p className="text-sm font-medium text-foreground leading-none">Anita K.</p>
                <p className="text-xs text-muted-foreground mt-1">Super Admin</p>
              </div>
            </div>
            <LogOut className="size-4 text-muted-foreground" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 z-10 sticky top-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Admin Console</span>
            <span>/</span>
            <span className="text-foreground font-medium capitalize">
              {pathname.split('/').pop() || 'Dashboard'}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            {backendStatus === 'live' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Backend API Live
              </span>
            ) : backendStatus === 'offline' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800">
                <span className="size-1.5 rounded-full bg-amber-500" />
                Backend API Offline
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                <span className="size-1.5 rounded-full bg-muted-foreground animate-ping" />
                Connecting...
              </span>
            )}

            <button className="relative p-2 text-muted-foreground hover:bg-accent rounded-full transition-colors">
              <Bell className="size-4" />
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive border-2 border-card" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-background p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}

export function AdminContent({ children }: { children: ReactNode }) {
  // AdminContent is now just a pass-through since AdminShell handles layout
  return <>{children}</>
}

// Re-export constants for compatibility with existing files temporarily if they need it,
// though we aim to remove them all.
export const C = {
  navy: '#09090B',
  blue: '#18181B',
  blueLight: '#F4F4F5',
  blueFaint: '#FAFAFA',
  green: '#16A34A',
  greenLight: '#DCFCE7',
  red: '#DC2626',
  redLight: '#FEE2E2',
  orange: '#EA580C',
  orangeLight: '#FFEDD5',
  purple: '#9333EA',
  purpleLight: '#F3E8FF',
  textSecondary: '#71717A',
  border: '#E4E4E7',
  white: '#FFFFFF'
}
