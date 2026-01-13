'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { startTransition } from 'react'
import Link from 'next/link'
import { X, Menu, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { OrganizationLogo } from '@/components/ui/OrganizationLogo'
import { useOrganization } from '@/hooks/useOrganization'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { Permission } from '@/lib/permissions/permission-definitions'
import { usePermissions } from '@/lib/permissions/permission-context'
import { 
  LayoutDashboard,
  FolderOpen,
  CheckSquare,
  Users,
  Clock,
  BarChart,
  Settings,
  List,
  Columns,
  Calendar,
  User,
  Zap,
  Shield,
  Play,
  TestTube,
  TestTube2,
  ClipboardList,
  PlayCircle,
  FileText,
  Target,
  Activity,
  BookOpen,
  LogOut,
  Rocket
} from 'lucide-react'

const navigationItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
    permission: Permission.PROJECT_READ
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: FolderOpen,
    path: '/projects',
    permission: Permission.PROJECT_READ,
    children: [
      {
        id: 'projects-list',
        label: 'All Projects',
        icon: List,
        path: '/projects',
        permission: Permission.PROJECT_READ
      },
      {
        id: 'projects-kanban',
        label: 'Kanban Board',
        icon: Columns,
        path: '/kanban',
        permission: Permission.KANBAN_READ
      },
      {
        id: 'projects-calendar',
        label: 'Calendar View',
        icon: Calendar,
        path: '/calendar',
        permission: Permission.CALENDAR_READ
      }
    ]
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: CheckSquare,
    path: '/tasks',
    permission: Permission.TASK_READ,
    children: [
      {
        id: 'tasks-my',
        label: 'My Tasks',
        icon: User,
        path: '/tasks',
        permission: Permission.TASK_READ
      },
      {
        id: 'tasks-backlog',
        label: 'backlog',
        icon: List,
        path: '/backlog',
        permission: Permission.BACKLOG_READ
      },
      {
        id: 'tasks-user-stories',
        label: 'User Stories',
        icon: BookOpen,
        path: '/stories',
        permission: Permission.STORY_READ
      },
      {
        id: 'tasks-sprints',
        label: 'Sprints',
        icon: Zap,
        path: '/sprints',
        permission: Permission.SPRINT_VIEW
      },
      {
        id: 'tasks-epics',
        label: 'Epics',
        icon: Columns,
        path: '/epics',
        permission: Permission.EPIC_READ
      },
      {
        id: 'tasks-sprint-events',
        label: 'Sprint Events',
        icon: Calendar,
        path: '/sprint-events',
        permission: Permission.SPRINT_MANAGE
      },
    ]
  },
  {
    id: 'team',
    label: 'Team',
    icon: Users,
    path: '/team/members',
    permission: Permission.TEAM_READ,
    children: [
      {
        id: 'team-members',
        label: 'Members',
        icon: Users,
        path: '/team/members',
        permission: Permission.TEAM_READ
      },
      {
        id: 'team-roles',
        label: 'Roles & Permissions',
        icon: Shield,
        path: '/team/roles',
        permission: Permission.USER_MANAGE_ROLES
      }
    ]
  },
  {
    id: 'time',
    label: 'Time Tracking',
    icon: Clock,
    path: '/time-tracking',
    permission: Permission.TIME_TRACKING_READ,
    children: [
      {
        id: 'time-tracker',
        label: 'Timer',
        icon: Play,
        path: '/time-tracking/timer',
        permission: Permission.TIME_TRACKING_CREATE
      },
      {
        id: 'time-logs',
        label: 'Time Logs',
        icon: Clock,
        path: '/time-tracking/logs',
        permission: Permission.TIME_TRACKING_READ
      },
      {
        id: 'time-reports',
        label: 'Reports',
        icon: BarChart,
        path: '/time-tracking/reports',
        permission: Permission.TIME_TRACKING_READ
      }
    ]
  },
  {
    id: 'test-management',
    label: 'Test Management',
    icon: TestTube,
    path: '/test-management',
    permission: Permission.TEST_SUITE_READ,
    children: [
      {
        id: 'test-dashboard',
        label: 'Dashboard',
        icon: Activity,
        path: '/test-management',
        permission: Permission.TEST_SUITE_READ
      },
      {
        id: 'test-suites',
        label: 'Test Suites',
        icon: TestTube2,
        path: '/test-management/suites',
        permission: Permission.TEST_SUITE_READ
      },
      {
        id: 'test-cases',
        label: 'Test Cases',
        icon: ClipboardList,
        path: '/test-management/cases',
        permission: Permission.TEST_CASE_READ
      },
      {
        id: 'test-plans',
        label: 'Test Plans',
        icon: Target,
        path: '/test-management/plans',
        permission: Permission.TEST_PLAN_READ
      },
      {
        id: 'test-executions',
        label: 'Test Executions',
        icon: PlayCircle,
        path: '/test-management/executions',
        permission: Permission.TEST_EXECUTION_READ
      },
      {
        id: 'test-reports',
        label: 'Test Reports',
        icon: FileText,
        path: '/test-management/reports',
        permission: Permission.TEST_REPORT_VIEW
      }
    ]
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart,
    path: '/reports',
    permission: Permission.REPORTING_VIEW,
    children: [
      {
        id: 'reports-project',
        label: 'Project Reports',
        icon: FolderOpen,
        path: '/reports/project-reports',
        permission: Permission.REPORTING_VIEW
      },
      {
        id: 'reports-gantt',
        label: 'Gantt Chart',
        icon: Calendar,
        path: '/reports/project-reports/gantt',
        permission: Permission.REPORTING_VIEW
      },
      {
        id: 'reports-financial',
        label: 'Financial Reports',
        icon: BarChart,
        path: '/reports/financial',
        permission: Permission.FINANCIAL_READ
      },
      {
        id: 'reports-team',
        label: 'Team Reports',
        icon: Users,
        path: '/reports/team',
        permission: Permission.REPORTING_VIEW
      }
    ]
  },
  {
    id: 'docs',
    label: 'Documentation',
    icon: BookOpen,
    path: '/docs',
    permission: Permission.SETTINGS_READ
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    path: '/settings',
    permission: Permission.SETTINGS_READ
  }
]

interface MobileMenuProps {
  isOpen: boolean
  onClose: () => void
}

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const pathname = usePathname()
  const router = useRouter()
  const { organization, loading } = useOrganization()
  const { hasPermission } = usePermissions()

  const toggleExpanded = (itemId: string) => {
    setExpandedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    )
  }

  const handleLogout = async () => {
    try {
      // Clear permission cache before logout
      try {
        sessionStorage.removeItem('kanvaro_permissions')
        sessionStorage.removeItem('kanvaro_permissions_timestamp')
      } catch (cacheError) {
        console.error('Error clearing permission cache:', cacheError)
      }

      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (response.ok) {
        router.push('/login')
      } else {
        console.error('Logout failed:', await response.text())
        router.push('/login')
      }
    } catch (error) {
      console.error('Logout failed:', error)
      router.push('/login')
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
        onClick={onClose}
      />
      
      {/* Mobile Menu */}
      <div className="fixed inset-y-0 left-0 w-80 bg-background border-r z-50 lg:hidden overflow-y-auto">
        {/* Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b">
          <div className="flex items-center space-x-3">
            {loading ? (
              <div className="h-8 w-8 rounded bg-primary/10 animate-pulse" />
            ) : (
              <OrganizationLogo 
                lightLogo={organization?.logo} 
                darkLogo={organization?.darkLogo}
                logoMode={organization?.logoMode}
                fallbackText={organization?.name?.charAt(0) || 'K'}
                size="sm"
                className="rounded"
              />
            )}
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Navigation Items */}
        <div className="px-2 py-4">
          <nav className="space-y-1">
            {navigationItems
              .filter((item) => hasPermission(item.permission))
              .map((item) => ({
                ...item,
                children: item.children?.filter((child: any) => hasPermission(child.permission)) || []
              }))
              .map((item) => (
              <MobileNavigationItem
                key={item.id}
                item={item}
                pathname={pathname}
                expandedItems={expandedItems}
                onToggleExpanded={toggleExpanded}
                router={router}
              />
            ))}
          </nav>
        </div>

        {/* Sign Out */}
        <div className="border-t p-2 mt-auto">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-foreground px-3"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </>
  )
}

interface MobileNavigationItemProps {
  item: any
  pathname: string
  expandedItems: string[]
  onToggleExpanded: (itemId: string) => void
  router: any
}

function MobileNavigationItem({ item, pathname, expandedItems, onToggleExpanded, router }: MobileNavigationItemProps) {
  const isActive = pathname === item.path
  const hasChildren = item.children && item.children.length > 0
  const isExpanded = expandedItems.includes(item.id)
  const Icon = item.icon

  return (
    <PermissionGate permission={item.permission}>
      <div className="space-y-1">
        {hasChildren ? (
          <Button
            variant={isActive ? 'secondary' : 'ghost'}
            className="w-full justify-start px-3"
            onClick={() => onToggleExpanded(item.id)}
          >
            <Icon className="h-4 w-4 mr-2" />
            <span className="flex-1 text-left">{item.label}</span>
            {hasChildren && (
              <ChevronRight
                className={cn(
                  'h-4 w-4 transition-transform',
                  isExpanded && 'rotate-90'
                )}
              />
            )}
          </Button>
        ) : (
          <Button
            variant={isActive ? 'secondary' : 'ghost'}
            className="w-full justify-start px-3"
            asChild
          >
            <Link href={item.path} prefetch onMouseEnter={() => router.prefetch(item.path)}>
              <Icon className="h-4 w-4 mr-2" />
              <span className="flex-1 text-left">{item.label}</span>
            </Link>
          </Button>
        )}

        {/* Sub-navigation */}
        {hasChildren && isExpanded && (
          <div className="ml-4 space-y-1">
            {item.children.map((child: any) => (
              <PermissionGate key={child.id} permission={child.permission}>
                <Button
                  variant={pathname === child.path ? 'secondary' : 'ghost'}
                  className="w-full justify-start text-sm"
                  asChild
                >
                  <Link href={child.path} prefetch onMouseEnter={() => router.prefetch(child.path)}>
                    <child.icon className="mr-2 h-4 w-4" />
                    {child.label}
                  </Link>
                </Button>
              </PermissionGate>
            ))}
          </div>
        )}
      </div>
    </PermissionGate>
  )
}
