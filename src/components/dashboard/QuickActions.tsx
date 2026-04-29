'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Plus, FolderOpen, CheckSquare, Users, Clock, BarChart3, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'

interface QuickAction {
  title: string
  description: string
  icon: any
  color: string
  href: string
  permissions: Permission[]
}

const quickActions: QuickAction[] = [
  {
    title: 'New Project',
    description: 'Create a new project',
    icon: FolderOpen,
    color: 'bg-blue-500 hover:bg-blue-600',
    href: '/projects/create',
    permissions: [Permission.PROJECT_CREATE]
  },
  {
    title: 'Add Task',
    description: 'Create a new task',
    icon: CheckSquare,
    color: 'bg-green-500 hover:bg-green-600',
    href: '/tasks/create-new-task',
    permissions: [Permission.TASK_CREATE]
  },
  {
    title: 'Invite Team',
    description: 'Invite team members',
    icon: Users,
    color: 'bg-purple-500 hover:bg-purple-600',
    href: '/team/members',
    permissions: [Permission.TEAM_INVITE]
  },
  {
    title: 'Start Timer',
    description: 'Start time tracking',
    icon: Clock,
    color: 'bg-orange-500 hover:bg-orange-600',
    href: '/time-tracking/timer',
    permissions: [Permission.TIME_TRACKING_CREATE]
  },
  {
    title: 'View Reports',
    description: 'View time tracking reports',
    icon: BarChart3,
    color: 'bg-indigo-500 hover:bg-indigo-600',
    href: '/time-tracking/reports',
    permissions: [Permission.TIME_TRACKING_READ]
  }
]

export function QuickActions() {
  const { hasAnyPermission, loading } = usePermissions()

  // While permissions are loading, show all actions (they'll be filtered once loaded)
  // This prevents empty state when cache is cleared and permissions are being fetched
  const availableActions = loading
    ? quickActions
    : quickActions.filter(action => hasAnyPermission(action.permissions))

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {loading && (
          <>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 sm:h-28 w-full animate-pulse rounded-lg bg-muted/40" />
            ))}
          </>
        )}
        {!loading && availableActions.map((action, index) => {
          const Icon = action.icon

          return (
            <Link
              key={index}
              href={action.href}
              prefetch={true}
            >
              <Card className="h-full hover:shadow-md transition-all duration-200 hover:scale-105 cursor-pointer border border-border">
                <CardContent className="p-2.5 sm:p-3 h-full flex flex-col items-center justify-center text-center gap-2">
                  <div className={`p-1.5 sm:p-2 rounded-md ${action.color}`}>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-foreground truncate">
                      {action.title}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {action.description}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
