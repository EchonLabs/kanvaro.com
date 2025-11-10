'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { 
  ArrowLeft, 
  Search, 
  Filter, 
  RefreshCw, 
  Activity, 
  Users, 
  Calendar,
  CheckCircle,
  Plus,
  MessageSquare,
  Timer,
  Clock
} from 'lucide-react'
import { PageContent } from '@/components/ui/PageContent'

interface ActivityItem {
  id: string
  type: 'task' | 'project' | 'time'
  action: string
  target: string
  project: string
  user: {
    _id: string
    firstName: string
    lastName: string
    email: string
    avatar?: string
  }
  timestamp: string
  status?: string
  duration?: number
}

interface ActivityFilters {
  type: string
  action: string
  project: string
  user: string
  dateRange: string
}

export default function ActivityPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [projects, setProjects] = useState<Array<{ _id: string; name: string }>>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [filters, setFilters] = useState<ActivityFilters>({
    type: 'all',
    action: 'all',
    project: 'all',
    user: 'all',
    dateRange: 'all'
  })
  const [user, setUser] = useState<any>(null)
  const [authError, setAuthError] = useState('')
  const [dataError, setDataError] = useState('')
  const router = useRouter()

  const getActionIcon = (action: string) => {
    if (action === 'completed') return CheckCircle
    if (action === 'created' || action === 'started') return Plus
    if (action === 'commented') return MessageSquare
    if (action === 'logged') return Timer
    return Clock
  }

  const formatTimestamp = (timestamp: string) => {
    const now = new Date()
    const activityTime = new Date(timestamp)
    const diffInMinutes = Math.floor((now.getTime() - activityTime.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    
    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) return `${diffInHours}h ago`
    
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) return `${diffInDays}d ago`
    
    return activityTime.toLocaleDateString()
  }

  const getActionText = (action: string) => {
    switch (action) {
      case 'completed': return 'completed'
      case 'created': return 'created'
      case 'started': return 'started'
      case 'commented': return 'commented on'
      case 'logged': return 'logged time for'
      case 'updated': return 'updated'
      default: return action
    }
  }

  const loadActivities = useCallback(async () => {
    try {
      const response = await fetch('/api/activity')
      if (response.ok) {
        const data = await response.json()
        setActivities(data.activities || [])
        setDataError('')
      } else {
        setDataError('Failed to load activity data')
      }
    } catch (error) {
      console.error('Failed to load activity data:', error)
      setDataError('Failed to load activity data')
    }
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
        setAuthError('')
        await loadActivities()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json()
          setUser(refreshData.user)
          setAuthError('')
          await loadActivities()
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
  }, [router, loadActivities])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await loadActivities()
    } finally {
      setIsRefreshing(false)
    }
  }, [loadActivities])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Load projects for the Project filter dropdown
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setProjectsLoading(true)
        const res = await fetch('/api/projects?limit=1000&page=1')
        if (res.ok) {
          const data = await res.json()
          const items = (data?.data || []).map((p: any) => ({ _id: p._id, name: p.name }))
          setProjects(items)
        }
      } catch (e) {
        console.error('Failed to load projects for activity filter:', e)
      } finally {
        setProjectsLoading(false)
      }
    }
    loadProjects()
  }, [])

  // Filter activities based on search and filters
  const filteredActivities = activities.filter(activity => {
    const matchesSearch = searchTerm === '' || 
      activity.target.toLowerCase().includes(searchTerm.toLowerCase()) ||
      activity.project.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${activity.user.firstName} ${activity.user.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesType = filters.type === 'all' || activity.type === filters.type
    const matchesAction = filters.action === 'all' || activity.action === filters.action
    const matchesProject = filters.project === 'all' || activity.project === filters.project
    const matchesUser = filters.user === 'all' || activity.user._id === filters.user

    return matchesSearch && matchesType && matchesAction && matchesProject && matchesUser
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-pulse mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading activity...</p>
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
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div>
                <h1 className="text-3xl font-bold">Team Activity</h1>
                <p className="text-muted-foreground">View all team activities and updates</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {dataError && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <p className="text-destructive text-sm">{dataError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="mt-2"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search activities..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <Select value={filters.type} onValueChange={(value) => setFilters(prev => ({ ...prev, type: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="task">Tasks</SelectItem>
                      <SelectItem value="project">Projects</SelectItem>
                      <SelectItem value="time">Time Tracking</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Action</label>
                  <Select value={filters.action} onValueChange={(value) => setFilters(prev => ({ ...prev, action: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Actions</SelectItem>
                      <SelectItem value="created">Created</SelectItem>
                      <SelectItem value="updated">Updated</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="logged">Time Logged</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Project</label>
                  <Select value={filters.project} onValueChange={(value) => setFilters(prev => ({ ...prev, project: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      {projectsLoading ? (
                        <SelectItem value="loading" disabled>Loading projects...</SelectItem>
                      ) : projects.length === 0 ? (
                        <SelectItem value="none" disabled>No projects found</SelectItem>
                      ) : (
                        projects.map((p) => (
                          <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Date Range</label>
                  <Select value={filters.dateRange} onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activities List */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Activities</CardTitle>
                <Badge variant="secondary">
                  {filteredActivities.length} activities
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {filteredActivities.length === 0 ? (
                <div className="text-center py-12">
                  <div className="p-4 bg-muted/50 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <Activity className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No activities found</h3>
                  <p className="text-muted-foreground mb-6">
                    {searchTerm || Object.values(filters).some(f => f !== 'all') 
                      ? 'Try adjusting your search or filters'
                      : 'Team activity will appear here as members work on projects and tasks.'
                    }
                  </p>
                  {(searchTerm || Object.values(filters).some(f => f !== 'all')) && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearchTerm('')
                        setFilters({
                          type: 'all',
                          action: 'all',
                          project: 'all',
                          user: 'all',
                          dateRange: 'all'
                        })
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredActivities.map((activity) => {
                    const ActionIcon = getActionIcon(activity.action)
                    
                    return (
                      <div 
                        key={activity.id} 
                        className="flex items-center space-x-4 p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <div className="relative">
                          <GravatarAvatar 
                            user={{
                              avatar: activity.user.avatar,
                              firstName: activity.user.firstName,
                              lastName: activity.user.lastName,
                              email: activity.user.email
                            }}
                            size={40}
                            className="h-10 w-10"
                          />
                          <div className="absolute -bottom-1 -right-1 p-1 bg-background border border-border rounded-full">
                            <ActionIcon className="h-3 w-3 text-muted-foreground" />
                          </div>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-semibold text-foreground">
                              {activity.user.firstName} {activity.user.lastName}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {getActionText(activity.action)}
                            </span>
                          </div>
                          
                          <p className="text-sm text-muted-foreground mb-2">
                            {activity.target}
                          </p>
                          
                          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {activity.type}
                            </Badge>
                            <span>{activity.project}</span>
                            <span>•</span>
                            <span>{formatTimestamp(activity.timestamp)}</span>
                            {activity.duration && (
                              <>
                                <span>•</span>
                                <span>{activity.duration} minutes</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </MainLayout>
  )
}
