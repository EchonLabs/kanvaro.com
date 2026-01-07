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
    <Card className="overflow-x-hidden">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg truncate">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="grid grid-cols-1 gap-2 sm:gap-3">
          {loading && (
            <>
              {[0,1,2,3,4].map((i) => (
                <div key={i} className="h-12 sm:h-14 w-full animate-pulse rounded-md bg-muted/40" />
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
                <Button
                  variant="ghost"
                  className="h-auto p-3 sm:p-4 justify-start hover:bg-gray-50 dark:hover:bg-gray-800 w-full"
                >
                <div className={`p-1.5 sm:p-2 rounded-lg ${action.color} mr-2 sm:mr-3 flex-shrink-0`}>
                  <Icon className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                </div>
                <div className="text-left min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate">
                    {action.title}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
                    {action.description}
                  </div>
                </div>
                </Button>
              </Link>
            )
          })}
        </div>
        
        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t">
          <Link href="/projects" prefetch={true}>
            <Button 
              variant="outline" 
              className="w-full text-xs sm:text-sm"
            >
              <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
              View All Projects
              <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 ml-2" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
