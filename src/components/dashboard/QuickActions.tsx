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

export function QuickActions() {
  const { hasAnyPermission, loading } = usePermissions()

  const availableActions = loading
    ? quickActions
    : quickActions.filter(action => hasAnyPermission(action.permissions))

  if (loading) {
    return (
      /* Mobile: 3-col equal grid | sm+: flex-wrap fixed-size cards */
      <div className="grid grid-cols-3 gap-3 sm:flex sm:flex-wrap">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-[88px] sm:w-[100px] rounded-[var(--apple-radius-xl)] bg-[var(--apple-quaternary-fill)] animate-pulse"
          />
        ))}
      </div>
    )
  }

  return (
    /* Mobile: 3-col equal-width grid | sm+: flex-wrap so cards sit at natural 100px width */
    <div className="grid grid-cols-3 gap-3 sm:flex sm:flex-wrap">
      {availableActions.map((action, index) => {
        const Icon = action.icon
        return (
          <Link key={index} href={action.href} prefetch className="contents sm:block sm:flex-shrink-0">
            <div className="flex flex-col items-center justify-center gap-2 h-[88px] sm:w-[100px] px-2 py-3 rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card hover:bg-[var(--apple-quaternary-fill)] apple-transition cursor-pointer active:scale-[0.97]">
              <div
                className="h-9 w-9 rounded-[var(--apple-radius-md)] flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: action.color }}
              >
                <Icon className="h-4 w-4 text-white" />
              </div>
              <span className="text-[13px] font-medium text-[var(--apple-label)] text-center leading-tight">
                {action.title}
              </span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
