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
        <div className="space-y-4 sm:space-y-6 overflow-x-hidden">
          {/* Welcome Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 mb-1">
            <div className="flex-1 min-w-0 w-full sm:w-auto">
              <DashboardHeader user={user} />
            </div>
          </div>

          {dataError && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2 sm:p-3">
              <p className="text-destructive text-xs break-words">{dataError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="mt-1.5 w-full sm:w-auto text-xs"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Quick Actions - Full Width at Top */}
          <div className="w-full mb-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-foreground">Quick Actions</h2>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    Last login: {lastLoginText}
                  </span>
                  <Badge variant="secondary" className="text-[10px] h-4.5 px-1.5 py-0 hover:bg-secondary dark:hover:bg-secondary">
                    {user?.customRole?.name || formatToTitleCase(user?.role) || 'Team Member'}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="h-7 px-2 text-[10px]"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
            <QuickActions />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="lg:col-span-2 flex flex-col gap-4 sm:gap-6">
              <StatsCards
                stats={dashboardData?.stats}
                changes={dashboardData?.changes}
                isLoading={!dashboardData}
              />
              <NotificationsWidget />
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

            <div className="flex flex-col gap-3 sm:gap-4">
              {user.id && user.organization  && (
                <TimeTrackingWidget
                  userId={user.id}
                  organizationId={user.organization}
                  timeStats={dashboardData?.timeStats}
                />
              )}
              {user.organization && (
                <ActiveTimersWidget organizationId={user.organization} />
              )}
            </div>
          </div>
        </div>
      </PageContent>
    </MainLayout>
  )
}
