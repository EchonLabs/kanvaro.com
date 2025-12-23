'use client'

import { useState, useEffect, startTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { OrganizationLogo } from '@/components/ui/OrganizationLogo'
import { useOrganization } from '@/hooks/useOrganization'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { Permission } from '@/lib/permissions/permission-definitions'
import { 
  ChevronLeft, 
  ChevronRight,
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
  Rocket,
  Shield,
  Play,
  Bell,
  DollarSign,
  Sliders,
  LogOut,
  BookOpen,
  TestTube,
  TestTube2,
  ClipboardList,
  PlayCircle,
  FileText,
  Bug,
  Target,
  Activity
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/Popover'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { usePermissions } from '@/lib/permissions/permission-context'
import packageJson from '../../../package.json'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

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
        permission: Permission.TASK_READ
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
        permission: Permission.EPIC_VIEW
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
        permission: Permission.TIME_LOG_REPORT_ACCESS
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
        icon: DollarSign,
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
    permission: Permission.DOCUMENTATION_VIEW,
    children: [
      {
        id: 'docs-internal',
        label: 'Internal Docs',
        icon: FileText,
        path: '/docs/internal',
        permission: Permission.DOCUMENTATION_VIEW
      },
      {
        id: 'docs-public',
        label: 'Public Docs',
        icon: BookOpen,
        path: '/docs/public'
        // No permission required for public docs
      }
    ]
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    path: '/settings',
    permission: Permission.SETTINGS_READ
  }
]

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { organization, loading } = useOrganization()
  const { theme, resolvedTheme } = useTheme()
  const { hasPermission } = usePermissions()

  // Ensure component is mounted before rendering conditional content
  useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-expand parent sections when child pages are active
  useEffect(() => {
    const activeParentIds: string[] = []
    
    navigationItems.forEach(item => {
      if (item.children) {
        const isChildActive = item.children.some(child => pathname === child.path)
        if (isChildActive) {
          activeParentIds.push(item.id)
        }
      }
    })
    
    if (activeParentIds.length > 0) {
      setExpandedItems(prev => {
        const newExpanded = Array.from(new Set([...prev, ...activeParentIds]))
        return newExpanded
      })
    }
  }, [pathname])

  if (!mounted) return null

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
        // Clear any client-side state if needed
        router.push('/login')
      } else {
        console.error('Logout failed:', await response.text())
        // Still redirect to login even if logout API fails
        router.push('/login')
      }
    } catch (error) {
      console.error('Logout failed:', error)
      // Still redirect to login even if logout API fails
      router.push('/login')
    }
  }

  return (
    <>
    <div
      className={cn(
        'flex h-full flex-col border-r bg-background transition-all duration-300 rounded-r-2xl overflow-hidden',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Sidebar Header */}
      <div className="flex h-16 items-center justify-between px-4">
        {!collapsed && (
          <div className="flex items-center space-x-3">
            {!mounted || loading ? (
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
        )}
        
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-8 w-8 rounded-full"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="border-t" />

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto px-2 py-4">
        <nav className="space-y-1">
          {navigationItems.map((item) => (
            item.permission ? (
              <PermissionGate key={item.id} permission={item.permission}>
                <NavigationItem
                  item={item}
                  collapsed={collapsed}
                  pathname={pathname}
                  expandedItems={expandedItems}
                  onToggleExpanded={toggleExpanded}
                  setExpandedItems={setExpandedItems}
                  router={router}
                />
              </PermissionGate>
            ) : (
              <NavigationItem
                key={item.id}
                item={item}
                collapsed={collapsed}
                pathname={pathname}
                expandedItems={expandedItems}
                onToggleExpanded={toggleExpanded}
                setExpandedItems={setExpandedItems}
                router={router}
              />
            )
          ))}
        </nav>
      </div>

      {/* Version + Sticky Sign Out */}
      <div className="border-t p-2">
        {!collapsed && (
          <div className="px-1 pb-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>Version</span>
            <span className="font-mono">{packageJson.version}</span>
          </div>
        )}
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start text-muted-foreground hover:text-foreground rounded-lg',
            collapsed ? 'px-2' : 'px-3'
          )}
          onClick={() => setShowLogoutConfirm(true)}
        >
          <LogOut className={cn('h-4 w-4', collapsed ? 'mx-auto' : 'mr-2')} />
          {!collapsed && 'Logout'}
        </Button>
      </div>
    </div>
    {/* Logout Confirmation Modal */}
    <ConfirmationModal
      isOpen={showLogoutConfirm}
      onClose={() => setShowLogoutConfirm(false)}
      onConfirm={handleLogout}
      title="Logout"
      description="Are you sure you want to logout?"
      confirmText="Logout"
      cancelText="Cancel"
    />
    </>
  )
}

interface NavigationItemProps {
  item: any
  collapsed: boolean
  pathname: string
  expandedItems: string[]
  onToggleExpanded: (itemId: string) => void
  setExpandedItems: React.Dispatch<React.SetStateAction<string[]>>
  router: any
}

function NavigationItem({ item, collapsed, pathname, expandedItems, onToggleExpanded, setExpandedItems, router }: NavigationItemProps) {
  const isActive = pathname === item.path
  const hasChildren = item.children && item.children.length > 0
  const isExpanded = expandedItems.includes(item.id)
  const Icon = item.icon

  // For collapsed sidebar with children, show popover
  if (collapsed && hasChildren) {
    return (
      <PermissionGate permission={item.permission}>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={isActive ? 'secondary' : 'ghost'}
              className={cn(
                'w-full justify-center px-2 rounded-xl',
                isActive && 'bg-secondary text-secondary-foreground'
              )}
              title={item.label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-48 p-1 rounded-xl">
            <div className="space-y-1">
              <div className="px-2 py-1.5 text-sm font-medium text-foreground border-b">
                {item.label}
              </div>
              {item.children.map((child: any) => (
                <PermissionGate key={child.id} permission={child.permission}>
                  <Button
                    variant={pathname === child.path ? 'secondary' : 'ghost'}
                    className="w-full justify-start text-sm h-8 rounded-md"
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
          </PopoverContent>
        </Popover>
      </PermissionGate>
    )
  }

  // Regular navigation item (expanded sidebar or no children)
  return (
    <PermissionGate permission={item.permission}>
      <div className="space-y-1">
        <Button
          variant={isActive ? 'secondary' : 'ghost'}
          className={cn(
            'w-full justify-start',
            collapsed ? 'px-2' : 'px-3',
            isActive && 'bg-secondary text-secondary-foreground'
          )}
          title={collapsed ? item.label : undefined}
          onClick={() => {
            console.log('Sidebar: Navigation item clicked:', item.label, 'path:', item.path, 'hasChildren:', hasChildren, 'collapsed:', collapsed)
            if (hasChildren && !collapsed) {
              console.log('Sidebar: Expanding parent item:', item.id)
              onToggleExpanded(item.id)
              // If clicking on a parent with children, expand it and keep it expanded
              if (!expandedItems.includes(item.id)) {
                setExpandedItems(prev => [...prev, item.id])
              }
            } else {
              console.log('Sidebar: Navigating to path:', item.path)
              // Use startTransition for non-blocking navigation
              startTransition(() => {
                console.log('Sidebar: Executing router.push for:', item.path)
                router.push(item.path)
              })
            }
          }}
        >
          <Icon className={cn('h-4 w-4', collapsed ? 'mx-auto' : 'mr-2')} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              {hasChildren && (
                <ChevronRight
                  className={cn(
                    'h-4 w-4 transition-transform',
                    isExpanded && 'rotate-90'
                  )}
                />
              )}
            </>
          )}
        </Button>

        {/* Sub-navigation */}
        {hasChildren && isExpanded && !collapsed && (
          <div className="ml-4 space-y-1">
            {item.children.map((child: any) => {
              const isChildActive = pathname === child.path
              return (
                <PermissionGate key={child.id} permission={child.permission}>
                  <Button
                    variant={isChildActive ? 'secondary' : 'ghost'}
                    className={cn(
                      "w-full justify-start text-sm rounded-md",
                      isChildActive && 'bg-secondary text-secondary-foreground'
                    )}
                    asChild
                  >
                    <Link
                      href={child.path}
                      prefetch
                      onMouseEnter={() => router.prefetch(child.path)}
                      onClick={() => {
                        console.log('Sidebar: Child navigation clicked:', child.label, 'path:', child.path)
                        // Keep parent expanded when navigating to child
                        if (!expandedItems.includes(item.id)) {
                          setExpandedItems(prev => [...prev, item.id])
                        }
                      }}
                    >
                      <child.icon className="mr-2 h-4 w-4" />
                      {child.label}
                    </Link>
                  </Button>
                </PermissionGate>
              )
            })}
          </div>
        )}
      </div>
    </PermissionGate>
  )
}
