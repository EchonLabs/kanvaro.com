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
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PageContent } from '@/components/ui/PageContent'
import { usePermissionContext } from '@/lib/permissions/permission-context'

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
  const [user, setUser] = useState<any>(null)
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [authError, setAuthError] = useState('')
  const [dataError, setDataError] = useState('')
  const [permissionsRefreshed, setPermissionsRefreshed] = useState(false)
  const [initialPermissionCheckDone, setInitialPermissionCheckDone] = useState(false)
  const [dashboardLoaded, setDashboardLoaded] = useState(false)
  const [isAuthChecking, setIsAuthChecking] = useState(false)
  const router = useRouter()
  const { loading: permissionsLoading, error: permissionsError, permissions, refreshPermissions } = usePermissionContext()

  const loadDashboardData = useCallback(async (force = false) => {
    // Prevent multiple simultaneous dashboard loads
    if (!force && dashboardLoaded && !isRefreshing) {
      console.log('Dashboard: Skipping dashboard load - already loaded')
      return
    }

    try {
      console.log('Dashboard: Loading dashboard data...')
      const response = await fetch('/api/dashboard')
      if (response.ok) {
        const data = await response.json()
        setDashboardData(data.data)
        setDashboardLoaded(true)
        setDataError('')
        console.log('Dashboard: Dashboard data loaded successfully')

        // Quick refresh of permissions after dashboard loads to ensure they're current
        if (!permissionsRefreshed) {
          console.log('Dashboard: Scheduling permission refresh after dashboard load')
          setTimeout(async () => {
            try {
              await refreshPermissions()
              setPermissionsRefreshed(true)
              console.log('Dashboard: Permissions refreshed successfully')
            } catch (error) {
              console.error('Dashboard: Failed to refresh permissions:', error)
            }
          }, 500) // Small delay to ensure dashboard is fully rendered
        }
      } else {
        setDataError('Failed to load dashboard data')
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
      setDataError('Failed to load dashboard data')
    }
  }, [dashboardLoaded, isRefreshing, permissionsRefreshed, refreshPermissions])

  const checkAuth = useCallback(async (forceLoadDashboard = false) => {
    // Prevent multiple simultaneous auth checks
    if (isAuthChecking && !forceLoadDashboard) {
      console.log('Dashboard: Auth check already in progress, skipping')
      return
    }

    try {
      setIsAuthChecking(true)
      console.log('Dashboard: Checking authentication...')
      console.log('Dashboard: Permissions loading:', permissionsLoading, 'Permissions available:', !!permissions)
      const response = await fetch('/api/auth/me')
      console.log('Dashboard: Auth response status:', response.status)

      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
        setAuthError('')

        // Only load dashboard data if not already loaded or if forced
        if (!dashboardLoaded || forceLoadDashboard) {
          await loadDashboardData(forceLoadDashboard)
        } else {
          console.log('Dashboard: Skipping dashboard load - already loaded')
        }
      } else if (response.status === 401) {
        // Try to refresh token
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json()
          setUser(refreshData.user)
          setAuthError('')

          // Only load dashboard data if not already loaded or if forced
          if (!dashboardLoaded || forceLoadDashboard) {
            await loadDashboardData(forceLoadDashboard)
          } else {
            console.log('Dashboard: Skipping dashboard load after token refresh - already loaded')
          }
        } else {
          // Both access and refresh tokens are invalid
          setAuthError('Session expired')
          setTimeout(() => {
            router.push('/login')
          }, 2000)
        }
      } else {
        // Other error, redirect to login
        router.push('/login')
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setAuthError('Authentication failed')
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } finally {
      setIsLoading(false)
      setIsAuthChecking(false)
    }
  }, [router, loadDashboardData, isAuthChecking, dashboardLoaded, permissionsLoading, permissions])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await loadDashboardData()
    } finally {
      setIsRefreshing(false)
    }
  }, [loadDashboardData])

  // Initial auth check on mount
  useEffect(() => {
    if (!dashboardLoaded) {
    checkAuth()
    }
  }, []) // Empty dependency array to run only once on mount

  // Ensure permissions are current when component mounts
  useEffect(() => {
    if (!permissionsLoading && permissions && !initialPermissionCheckDone) {
      console.log('Dashboard: Ensuring permissions are current on mount')
      // Quick check to refresh permissions if needed
      const timer = setTimeout(async () => {
        try {
          await refreshPermissions()
          setPermissionsRefreshed(true)
          setInitialPermissionCheckDone(true)
          console.log('Dashboard: Initial permission refresh completed')
        } catch (error) {
          console.error('Dashboard: Failed initial permission refresh:', error)
          setInitialPermissionCheckDone(true) // Prevent infinite retries
        }
      }, 100)

      return () => clearTimeout(timer)
    }
  }, [permissionsLoading, permissions, initialPermissionCheckDone, refreshPermissions])

  // Set up periodic auth check to handle token expiration (less frequent)
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('Dashboard: Periodic auth check')
      checkAuth(true) // Force dashboard reload on periodic checks
    }, 10 * 60 * 1000) // Check every 10 minutes instead of 5

    return () => clearInterval(interval)
  }, []) // Empty dependency array

  // Handle loading states consistently to prevent hydration mismatch
  // Show loading until permissions are loaded, auth check is complete, initial permission check done, and dashboard data is ready
  // Ensure permissions are fully available and refreshed before showing dashboard
  const isInitialLoading = permissionsLoading || isLoading || !permissions || !initialPermissionCheckDone || (!permissionsRefreshed && dashboardData);

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

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-destructive mb-4">{authError}</p>
          <p className="text-muted-foreground">Redirecting to login...</p>
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
        <div className="space-y-8 sm:space-y-10 overflow-x-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 min-w-0 w-full sm:w-auto">
              <DashboardHeader user={user} />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full sm:w-auto flex-shrink-0"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {dataError && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 sm:p-4">
              <p className="text-destructive text-xs sm:text-sm break-words">{dataError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="mt-2 w-full sm:w-auto"
              >
                Try Again
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="lg:col-span-2 flex flex-col gap-6 sm:gap-8">
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

            <div className="flex flex-col gap-6 sm:gap-8">
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
              <QuickActions />
            </div>
          </div>
        </div>
      </PageContent>
    </MainLayout>
  )
}
