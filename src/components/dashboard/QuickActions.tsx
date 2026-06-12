'use client'

import { FolderOpen, CheckSquare, Users, Clock, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'

interface QuickAction {
  title: string
  icon: any
  color: string
  href: string
  permissions: Permission[]
}

const quickActions: QuickAction[] = [
  {
    title: 'New Project',
    icon: FolderOpen,
    color: 'var(--apple-system-blue)',
    href: '/projects/create',
    permissions: [Permission.PROJECT_CREATE]
  },
  {
    title: 'Add Task',
    icon: CheckSquare,
    color: 'var(--apple-system-green)',
    href: '/tasks/create-new-task',
    permissions: [Permission.TASK_CREATE]
  },
  {
    title: 'Invite Team',
    icon: Users,
    color: 'var(--apple-system-purple)',
    href: '/team/members',
    permissions: [Permission.TEAM_INVITE]
  },
  {
    title: 'Start Timer',
    icon: Clock,
    color: 'var(--apple-system-orange)',
    href: '/time-tracking/timer',
    permissions: [Permission.TIME_TRACKING_CREATE]
  },
  {
    title: 'View Reports',
    icon: BarChart3,
    color: 'var(--apple-system-teal)',
    href: '/time-tracking/reports',
    permissions: [Permission.TIME_LOG_REPORT_ACCESS]
  }
]

const SM_GRID_COLS: Record<number, string> = {
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
}

export function QuickActions() {
  const { hasAnyPermission, loading } = usePermissions()

  const availableActions = loading
    ? quickActions
    : quickActions.filter(action => hasAnyPermission(action.permissions))

  if (loading) {
    return (
      /* Mobile: 3-col equal grid | sm+: full-width 5-col grid */
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-[88px] rounded-[var(--apple-radius-xl)] bg-[var(--apple-quaternary-fill)] animate-pulse"
          />
        ))}
      </div>
    )
  }

  const count = availableActions.length
  const useFullWidth = count >= 3

  /* Mobile: always 3-col grid. sm+: full-width grid (≥3 actions) or left-aligned flex (<3 actions) */
  const containerClass = useFullWidth
    ? `grid grid-cols-3 gap-3 ${SM_GRID_COLS[count] ?? 'sm:grid-cols-5'}`
    : 'grid grid-cols-3 gap-3 sm:flex sm:flex-wrap sm:gap-3'

  return (
    <div className={containerClass}>
      {availableActions.map((action, index) => {
        const Icon = action.icon
        return (
          <Link
            key={index}
            href={action.href}
            prefetch
            className={useFullWidth ? 'contents sm:block' : 'contents sm:block sm:flex-shrink-0'}
          >
            <div className={`group flex flex-col items-center justify-center gap-2 h-[88px] px-2 py-3 rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card hover:bg-[var(--apple-quaternary-fill)] hover:border-[var(--apple-chart-to)]/30 apple-transition cursor-pointer active:scale-[0.97]${useFullWidth ? '' : ' sm:w-[100px]'}`}>
              <div
                className="h-9 w-9 rounded-[var(--apple-radius-md)] flex items-center justify-center flex-shrink-0 apple-transition"
                style={{ background: 'color-mix(in srgb, var(--apple-chart-to) 12%, transparent)' }}
              >
                <Icon
                  className="h-[18px] w-[18px] apple-transition"
                  style={{ color: 'var(--apple-chart-to)' }}
                  strokeWidth={1.6}
                />
              </div>
              <span className="text-[12px] font-medium text-[var(--apple-secondary-label)] group-hover:text-[var(--apple-label)] text-center leading-tight apple-transition">
                {action.title}
              </span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
