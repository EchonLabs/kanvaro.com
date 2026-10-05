'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { startTransition } from 'react'
import Link from 'next/link'
import { X, Menu, ChevronRight, Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from 'next-themes'
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
        label: 'Backlog',
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
      {
        id: 'tasks-standup-dashboard',
        label: 'Standup Dashboard',
        icon: Activity,
        path: '/tasks/standup-dashboard',
        permission: Permission.PROJECT_MANAGE_TEAM
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
    permission: Permission.SETTINGS_VIEW,
    children: [
      {
        id: 'document-templates',
        label: 'Document Templates',
        icon: FileText,
        path: '/docs/templates',
        permission: Permission.DOCUMENTATION_VIEW
      }
    ]
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    path: '/settings',
    permission: Permission.SETTINGS_VIEW
  }
]

interface MobileMenuProps {
  isOpen: boolean
  onClose: () => void
}

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { organization, loading } = useOrganization()
  const { hasPermission } = usePermissions()
  const { theme, setTheme } = useTheme()

  useEffect(() => { setMounted(true) }, [])

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
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
        onClick={onClose}
      />

      {/* Mobile Drawer */}
      <div className="fixed inset-y-0 left-0 w-72 apple-sidebar-material border-r border-[var(--apple-separator)] z-50 lg:hidden overflow-y-auto">
        {/* Header */}
        <div className="flex h-14 items-center justify-between px-3 border-b border-[var(--apple-separator)]">
          <div className="flex items-center min-w-0 flex-1">
            {loading ? (
              <div className="h-7 w-28 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] animate-pulse" />
            ) : organization?.logo || organization?.darkLogo ? (
              <OrganizationLogo
                lightLogo={organization?.logo}
                darkLogo={organization?.darkLogo}
                logoMode={organization?.logoMode}
                fallbackText={organization?.name?.charAt(0) || 'K'}
                size="sm"
                className="rounded-[var(--apple-radius-sm)]"
              />
            ) : (
              <img
                src="/Kanvaro.svg"
                alt="Kanvaro"
                className="h-8 w-auto object-contain dark:brightness-0 dark:invert"
              />
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 rounded-full hover:bg-[var(--apple-quaternary-fill)]"
          >
            <X className="h-3.5 w-3.5 text-[var(--apple-secondary-label)]" />
          </Button>
        </div>

        {/* Navigation Items */}
        <div className="px-2 py-3">
          <nav className="space-y-0.5">
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

        {/* Appearance — theme toggle */}
        {mounted && (
          <div className="border-t border-[var(--apple-separator)] px-2 py-3">
            <p className="apple-section-label px-1 mb-2">Appearance</p>
            <div className="flex items-center bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-pill)] p-0.5 gap-0.5">
              {([
                { value: 'light',  Icon: Sun,     label: 'Light' },
                { value: 'dark',   Icon: Moon,    label: 'Dark' },
                { value: 'system', Icon: Monitor, label: 'System' },
              ] as const).map(({ value, Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[var(--apple-radius-pill)] text-[13px] font-medium apple-transition',
                    theme === value
                      ? 'bg-card shadow-sm text-[var(--apple-label)]'
                      : 'text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sign Out */}
        <div className="border-t border-[var(--apple-separator)] p-2">
          <Button
            variant="ghost"
            className="w-full justify-start h-8 rounded-[12px] text-[var(--apple-system-red)] hover:bg-[var(--apple-system-red)]/10 hover:text-[var(--apple-system-red)] px-3"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            <span className="text-sm">Sign out</span>
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
      <div className="space-y-0.5">
        {hasChildren ? (
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start h-9 px-3 rounded-[12px] apple-transition text-sm',
              isActive
                ? 'bg-[var(--apple-system-blue)]/12 text-[var(--apple-system-blue)] font-medium'
                : 'text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] hover:bg-[var(--apple-quaternary-fill)]'
            )}
            onClick={() => onToggleExpanded(item.id)}
          >
            <Icon className={cn('h-4 w-4 mr-2 flex-shrink-0', isActive ? 'text-[var(--apple-system-blue)]' : 'text-[var(--apple-secondary-label)]')} />
            <span className="flex-1 text-left">{item.label}</span>
            {hasChildren && (
              <ChevronRight
                className={cn(
                  'h-3.5 w-3.5 transition-transform text-[var(--apple-tertiary-label)]',
                  isExpanded && 'rotate-90'
                )}
              />
            )}
          </Button>
        ) : (
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start h-9 px-3 rounded-[12px] apple-transition text-sm',
              isActive
                ? 'bg-[var(--apple-system-blue)]/12 text-[var(--apple-system-blue)] font-medium'
                : 'text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] hover:bg-[var(--apple-quaternary-fill)]'
            )}
            asChild
          >
            <Link href={item.path} prefetch onMouseEnter={() => router.prefetch(item.path)}>
              <Icon className={cn('h-4 w-4 mr-2 flex-shrink-0', isActive ? 'text-[var(--apple-system-blue)]' : 'text-[var(--apple-secondary-label)]')} />
              <span className="flex-1 text-left">{item.label}</span>
            </Link>
          </Button>
        )}

        {/* Sub-navigation */}
        {hasChildren && isExpanded && (
          <div className="ml-3 space-y-0.5 border-l border-[var(--apple-separator)] pl-2">
            {item.children.map((child: any) => (
              <PermissionGate key={child.id} permission={child.permission}>
                <Button
                  variant="ghost"
                  className={cn(
                    'w-full justify-start text-sm h-8 px-2 rounded-[10px] apple-transition',
                    pathname === child.path
                      ? 'bg-[var(--apple-system-blue)]/12 text-[var(--apple-system-blue)] font-medium'
                      : 'text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] hover:bg-[var(--apple-quaternary-fill)]'
                  )}
                  asChild
                >
                  <Link href={child.path} prefetch onMouseEnter={() => router.prefetch(child.path)}>
                    <child.icon className={cn('mr-2 h-3.5 w-3.5', pathname === child.path ? 'text-[var(--apple-system-blue)]' : 'text-[var(--apple-tertiary-label)]')} />
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
