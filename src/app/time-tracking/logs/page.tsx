"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { TimeLogs } from '@/components/time-tracking/TimeLogs'
import { Clock, Loader2 } from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'

export default function TimeLogsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()

  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

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
          <p className="text-muted-foreground">Loading time logs...</p>
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
      <div className="space-y-6">
        <div className="mb-4">
          <h1 className="text-3xl font-bold text-foreground flex items-center space-x-2">
            <Clock className="h-8 w-8 text-blue-600" />
            <span>Time Logs</span>
          </h1>
          <p className="text-muted-foreground">Review and manage your time entries</p>
        </div>

        <TimeLogs
          userId={(user as any)._id || (user as any).id}
          organizationId={user.organization}
          showManualLogButtons={true}
        />
      </div>
    </MainLayout>
  )
}