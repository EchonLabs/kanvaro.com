"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { TimeLogs } from '@/components/time-tracking/TimeLogs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Clock, Loader2 } from 'lucide-react'

export default function TimeLogsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const userData = await response.json()
          setUser(userData)
          setAuthError('')
        } else if (response.status === 401) {
          const refreshResponse = await fetch('/api/auth/refresh', { method: 'POST' })
          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json()
            setUser(refreshData.user)
            setAuthError('')
          } else {
            setAuthError('Session expired')
            setTimeout(() => { router.push('/login') }, 2000)
          }
        } else {
          router.push('/login')
        }
      } catch {
        setAuthError('Authentication failed')
        setTimeout(() => { router.push('/login') }, 2000)
      } finally {
        setIsLoading(false)
      }
    }
    checkAuth()
  }, [router])

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
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center space-x-2">
            <Clock className="h-8 w-8 text-blue-600" />
            <span>Time Logs</span>
          </h1>
          <p className="text-muted-foreground">Review and manage your time entries</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Time Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TimeLogs
              userId={user._id}
              organizationId={user.organization}
            />
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}