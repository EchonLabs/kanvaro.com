'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { DashboardHeader } from '@/components/dashboard/DashboardHeader'
import { StatsCards } from '@/components/dashboard/StatsCards'
import { RecentProjects } from '@/components/dashboard/RecentProjects'
import { RecentTasks } from '@/components/dashboard/RecentTasks'
import { TeamActivity } from '@/components/dashboard/TeamActivity'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { TimeTrackingWidget } from '@/components/dashboard/TimeTrackingWidget'
import { ActiveTimersWidget } from '@/components/dashboard/ActiveTimersWidget'
import { NotificationsWidget } from '@/components/dashboard/NotificationsWidget'
import { Loader2, RefreshCw, Play, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { PageContent } from '@/components/ui/PageContent'
import { usePermissionContext } from '@/lib/permissions/permission-context'
import { useOrganization } from '@/hooks/useOrganization'
import { useAuthContext } from '@/contexts/AuthContext'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'

interface DashboardData {
  stats: {
    activeProjects: number
    completedTasks: number
    teamMembers: number
    hoursTracked: number
    projectsCount: number
    tasksCount: number
    timeEntriesCount: number
  }
  changes: {
    activeProjects: number
    completedTasks: number
    teamMembers: number
    hoursTracked: number
  }
  recentProjects: any[]
  recentTasks: any[]
  teamActivity: any[]
  timeStats: {
    today: { duration: number; cost: number }
    week: { duration: number; cost: number }
    month: { duration: number; cost: number }
    totalDuration: number
    totalCost: number
  }
}

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { user, isLoading: authLoading, isAuthenticated } = useAuthContext()
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [dataError, setDataError] = useState('')
  const [dashboardLoaded, setDashboardLoaded] = useState(false)
  const router = useRouter()
  const { loading: permissionsLoading, error: permissionsError, permissions, refreshPermissions } = usePermissionContext()

  const lastLoginText = user?.lastLogin
    ? new Date(user.lastLogin).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Not available'

  const loadDashboardData = useCallback(async (force = false) => {
    // Prevent multiple simultaneous dashboard loads
    if (!force && dashboardLoaded && !isRefreshing) {
      return
    }

    try {
      const response = await fetch('/api/dashboard')
      if (response.ok) {
        const data = await response.json()
        setDashboardData(data.data)
        setDashboardLoaded(true)
        setDataError('')

        setDashboardLoaded(true)
        setDataError('')
      } else {
        setDataError('Failed to load dashboard data')
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
      setDataError('Failed to load dashboard data')
    }
  }, [dashboardLoaded, isRefreshing])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await loadDashboardData(true)
    } finally {
      setIsRefreshing(false)
    }
  }, [loadDashboardData])

  // Load dashboard data when authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated && !dashboardLoaded) {
      loadDashboardData()
      setIsLoading(false)
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, dashboardLoaded, loadDashboardData, router])


  // Handle loading states consistently to prevent hydration mismatch
  // Show loading until permissions are loaded, auth check is complete, and dashboard data is ready
  const isInitialLoading = permissionsLoading || authLoading || (!permissions && !permissionsError) || (isLoading && !dashboardLoaded);

  if (isInitialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (permissionsError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-sm text-destructive">Failed to load permissions</p>
          <p className="text-xs text-muted-foreground mt-1">{permissionsError}</p>
        </div>
      </div>
    )
  }


  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">No user data available</p>
        </div>
      </div>
    )
  }

  return (
    <MainLayout>
      <PageContent>
        <div className="space-y-5 overflow-x-hidden">

          {/* Row 0: Header + role badge + refresh */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DashboardHeader user={user} />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-[var(--apple-secondary-label)] hidden sm:inline whitespace-nowrap">
                Last login: {lastLoginText}
              </span>
              <Badge variant="secondary" className="text-[10px] h-5 px-2">
                {user?.customRole?.name || formatToTitleCase(user?.role) || 'Team Member'}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-8"
              >
                <RefreshCw className={`h-3 w-3 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Error state */}
          {dataError && (
            <div className="bg-[var(--apple-system-red)]/10 border border-[var(--apple-system-red)]/20 rounded-[var(--apple-radius-md)] p-3">
              <p className="text-[var(--apple-system-red)] text-xs break-words">{dataError}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-2">
                Try Again
              </Button>
            </div>
          )}

          {/* Row 1: Quick Actions — fixed-size cards, aligned left */}
          <div>
            <p className="apple-section-label mb-2.5">Quick Actions</p>
            <QuickActions />
          </div>

          {/* Row 2: 4 Stat Cards with area sparklines */}
          <StatsCards
            stats={dashboardData?.stats}
            changes={dashboardData?.changes}
            isLoading={!dashboardData}
          />

          {/* Row 3: Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Left column — 2/3: Projects → Tasks → Activity */}
            <div className="lg:col-span-2 flex flex-col gap-4 order-2 lg:order-1">
              <RecentProjects
                projects={dashboardData?.recentProjects}
                isLoading={!dashboardData}
              />
              <RecentTasks
                tasks={dashboardData?.recentTasks}
                isLoading={!dashboardData}
                onTaskUpdate={loadDashboardData}
              />
              <TeamActivity
                activities={dashboardData?.teamActivity}
                isLoading={!dashboardData}
              />
            </div>

            {/* Right column — 1/3: Timer → Active Timers → Notifications */}
            <div className="flex flex-col gap-4 order-1 lg:order-2">
              {user.id && user.organization && (
                <TimeTrackingWidget
                  userId={user.id}
                  organizationId={user.organization}
                  timeStats={dashboardData?.timeStats}
                />
              )}
              {user.organization && (
                <ActiveTimersWidget organizationId={user.organization} />
              )}
              <NotificationsWidget />
            </div>

          </div>
        </div>
      </PageContent>
    </MainLayout>
  )
}
