'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { 
  Clock, 
  Play, 
  FileText, 
  BarChart3, 
  Target,
  Timer,
  Calendar,
  TrendingUp,
  Loader2,
  ArrowRight,
  Plus,
  Clock3,
  CheckCircle2
} from 'lucide-react'

export default function TimeTrackingPage() {
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me')
        
        if (response.ok) {
          const userData = await response.json()
          setUser(userData)
          setAuthError('')
        } else if (response.status === 401) {
          const refreshResponse = await fetch('/api/auth/refresh', {
            method: 'POST'
          })
          
          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json()
            setUser(refreshData.user)
            setAuthError('')
          } else {
            setAuthError('Session expired')
            setTimeout(() => {
              router.push('/login')
            }, 2000)
          }
        } else {
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
    }

    checkAuth()
  }, [router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading time tracking...</p>
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center space-x-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <Clock className="h-8 w-8 text-blue-600" />
              </div>
              <span>Time Tracking</span>
            </h1>
            <p className="text-muted-foreground mt-2">
              Track your time, manage entries, and view detailed reports
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push('/time-tracking/timer')}>
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                  <Play className="h-6 w-6 text-green-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">Start Timer</h3>
                  <p className="text-sm text-muted-foreground">Begin tracking time for a task</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push('/time-tracking/logs')}>
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                  <FileText className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">Time Logs</h3>
                  <p className="text-sm text-muted-foreground">View and manage time entries</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push('/time-tracking/reports')}>
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                  <BarChart3 className="h-6 w-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">Reports</h3>
                  <p className="text-sm text-muted-foreground">Analyze time tracking data</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Timer Section */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Timer className="h-5 w-5" />
                  <span>Active Timer</span>
                </CardTitle>
                <CardDescription>
                  Current time tracking session
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <div className="p-4 bg-muted rounded-lg inline-block mb-4">
                    <Clock3 className="h-12 w-12 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No Active Timer</h3>
                  <p className="text-muted-foreground mb-4">
                    Start tracking time for your tasks
                  </p>
                  <Button onClick={() => router.push('/time-tracking/timer')} className="w-full">
                    <Play className="h-4 w-4 mr-2" />
                    Start Timer
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5" />
                  <span>Today's Summary</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Time Tracked</span>
                  <span className="font-medium">0h 0m</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Billable Time</span>
                  <span className="font-medium">0h 0m</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Tasks Completed</span>
                  <span className="font-medium">0</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calendar className="h-5 w-5" />
                  <span>This Week</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Hours</span>
                  <span className="font-medium">0h 0m</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Average Daily</span>
                  <span className="font-medium">0h 0m</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Most Active Day</span>
                  <span className="font-medium">-</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Recent Activity</span>
            </CardTitle>
            <CardDescription>
              Your latest time tracking entries
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className="p-4 bg-muted rounded-lg inline-block mb-4">
                <CheckCircle2 className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No Recent Activity</h3>
              <p className="text-muted-foreground mb-4">
                Start tracking time to see your activity here
              </p>
              <Button variant="outline" onClick={() => router.push('/time-tracking/logs')}>
                <FileText className="h-4 w-4 mr-2" />
                View All Logs
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Tips */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Target className="h-5 w-5" />
                <span>Getting Started</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Select a project and task to track time</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Set your hourly rate for billable time</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Use categories and tags to organize</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Pause and resume as needed</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5" />
                <span>Best Practices</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>Start timer when beginning work</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>Use descriptive entries</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>Review and approve time entries</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>Generate reports regularly</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}
