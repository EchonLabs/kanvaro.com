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
  const router = useRouter()
  const { loading: permissionsLoading, error: permissionsError, permissions } = usePermissionContext()

  const loadDashboardData = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard')
      if (response.ok) {
        const data = await response.json()
        setDashboardData(data.data)
        setDataError('')
      } else {
        setDataError('Failed to load dashboard data')
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
      setDataError('Failed to load dashboard data')
    }
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      console.log('Dashboard: Checking authentication...')
      const response = await fetch('/api/auth/me')
      console.log('Dashboard: Auth response status:', response.status)

      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
        setAuthError('')
        // Load dashboard data after successful auth
        await loadDashboardData()
      } else if (response.status === 401) {
        // Try to refresh token
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json()
          setUser(refreshData.user)
          setAuthError('')
          // Load dashboard data after successful refresh
          await loadDashboardData()
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
    }
  }, [router, loadDashboardData])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await loadDashboardData()
    } finally {
      setIsRefreshing(false)
    }
  }, [loadDashboardData])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Set up periodic auth check to handle token expiration
  useEffect(() => {
    const interval = setInterval(() => {
      checkAuth()
    }, 5 * 60 * 1000) // Check every 5 minutes

    return () => clearInterval(interval)
  }, [checkAuth])

  // Wait for permissions to load before showing dashboard
  // Only show loading if permissions are actually being fetched (not just initialized)
  if (permissionsLoading && !permissions) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading permissions...</p>
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading dashboard...</p>
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
