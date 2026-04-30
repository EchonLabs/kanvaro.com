'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { TimeReports } from '@/components/time-tracking/TimeReports'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { BarChart3, Loader2, Shield } from 'lucide-react'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { useAuthContext } from '@/contexts/AuthContext'

export default function TimeReportsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()

  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const { hasPermission } = usePermissions()

  const canAccessTimeReports = hasPermission(Permission.TIME_LOG_REPORT_ACCESS)

  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      setIsLoading(false)
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, user, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading reports...</p>
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

  // Check if user has permission to access time reports
  if (!canAccessTimeReports) {
    return (
      <MainLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                <Shield className="h-6 w-6 text-red-600" />
              </div>
              <CardTitle className="text-red-600">Access Denied</CardTitle>
              <CardDescription>
                You don't have permission to access Time Reports. This feature is restricted to Administrators and HR personnel only.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button onClick={() => router.push('/dashboard')} variant="outline">
                Return to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground flex items-center space-x-2">
              <BarChart3 className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-purple-600 flex-shrink-0" />
              <span className="truncate">Time Reports</span>
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">Analyze your time tracking data and generate insights</p>
          </div>
        </div>

        <TimeReports
          userId={(user as any)._id || (user as any).id}
          organizationId={user.organization}
        />
      </div>
    </MainLayout>
  )
}
