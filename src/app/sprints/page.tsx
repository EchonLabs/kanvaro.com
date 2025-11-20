'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { Progress } from '@/components/ui/Progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Calendar, 
  Clock,
  CheckCircle,
  AlertTriangle,
  Pause,
  XCircle,
  Play,
  Loader2,
  User,
  Target,
  Zap,
  BarChart3,
  List,
  Kanban,
  Users,
  TrendingUp,
  Calendar as CalendarIcon,
  Eye,
  Settings,
  Edit,
  Trash2
} from 'lucide-react'

interface Sprint {
  _id: string
  name: string
  description: string
  status: 'planning' | 'active' | 'completed' | 'cancelled'
  project: {
    _id: string
    name: string
  }
  startDate: string
  endDate: string
  goal: string
  capacity: number
  velocity: number
  teamMembers: Array<{
    firstName: string
    lastName: string
    email: string
  }>
  createdBy: {
    firstName: string
    lastName: string
    email: string
  }
  progress: {
    completionPercentage: number
    tasksCompleted: number
    totalTasks: number
    storyPointsCompleted: number
    totalStoryPoints: number
  }
  createdAt: string
  updatedAt: string
}

export default function SprintsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [success, setSuccess] = useState('')

  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showSuccess = useCallback((message: string) => {
    setSuccess(message)
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current)
    }
    successTimeoutRef.current = setTimeout(() => {
      setSuccess('')
      successTimeoutRef.current = null
    }, 3000)
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await fetchSprints()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          await fetchSprints()
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
    }
  }, [router])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    const successParam = searchParams?.get('success')
    if (successParam === 'sprint-created') {
      showSuccess('Sprint created successfully.')
      router.replace('/sprints', { scroll: false })
    }
  }, [searchParams, showSuccess, router])

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
    }
  }, [])

  const fetchSprints = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/sprints')
      const data = await response.json()

      if (data.success) {
        setSprints(data.data)
      } else {
        setError(data.error || 'Failed to fetch sprints')
      }
    } catch (err) {
      setError('Failed to fetch sprints')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSprint = async (sprintId: string) => {
    try {
      const res = await fetch(`/api/sprints/${sprintId}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.success) {
        setSprints(prev => prev.filter(s => s._id !== sprintId))
        showSuccess('Sprint deleted successfully.')
      } else {
        setError(data.error || 'Failed to delete sprint')
      }
    } catch (e) {
      setError('Failed to delete sprint')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planning': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'completed': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'planning': return <Calendar className="h-4 w-4" />
      case 'active': return <Play className="h-4 w-4" />
      case 'completed': return <CheckCircle className="h-4 w-4" />
      case 'cancelled': return <XCircle className="h-4 w-4" />
      default: return <Calendar className="h-4 w-4" />
    }
  }

  const filteredSprints = sprints.filter(sprint => {
    const matchesSearch = !searchQuery || 
      sprint.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sprint.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sprint.project.name.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || sprint.status === statusFilter

    return matchesSearch && matchesStatus
  })

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading sprints...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (authError) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive mb-4">{authError}</p>
            <p className="text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Sprints</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Manage your agile sprints and iterations</p>
          </div>
          <Button onClick={() => router.push('/sprints/create')} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            New Sprint
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert variant="success">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <Card className="overflow-x-hidden">
          <CardHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>All Sprints</CardTitle>
                  <CardDescription>
                    {filteredSprints.length} sprint{filteredSprints.length !== 1 ? 's' : ''} found
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search sprints..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-full"
                  />
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="planning">Planning</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'grid' | 'list')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="grid">Grid View</TabsTrigger>
                <TabsTrigger value="list">List View</TabsTrigger>
              </TabsList>

              <TabsContent value="grid" className="space-y-4">
                <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {filteredSprints.map((sprint) => (
                    <Card 
                      key={sprint._id} 
                      className="hover:shadow-md transition-shadow cursor-pointer overflow-x-hidden"
                      onClick={() => router.push(`/sprints/${sprint._id}`)}
                    >
                      <CardHeader className="p-3 sm:p-6">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 flex-1 min-w-0">
                            <CardTitle className="text-base sm:text-lg truncate" title={sprint.name}>
                              {sprint.name}
                            </CardTitle>
                            <CardDescription className="line-clamp-2 text-xs sm:text-sm" title={sprint.description || 'No description'}>
                              {sprint.description || 'No description'}
                            </CardDescription>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/sprints/${sprint._id}`)
                              }}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Sprint
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/sprints/${sprint._id}?tab=settings`)
                              }}>
                                <Settings className="h-4 w-4 mr-2" />
                                Settings
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/sprints/${sprint._id}/edit`)
                              }}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Sprint
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (confirm('Are you sure you want to delete this sprint? This action cannot be undone.')) {
                                    handleDeleteSprint(sprint._id)
                                  }
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Sprint
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="p-3 sm:p-6 pt-0 space-y-3 sm:space-y-4">
                        <div className="flex items-center space-x-2">
                          <Badge className={`${getStatusColor(sprint?.status)} text-xs`}>
                            {getStatusIcon(sprint?.status)}
                            <span className="ml-1 hidden sm:inline">{formatToTitleCase(sprint?.status)}</span>
                          </Badge>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs sm:text-sm">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="font-medium">{sprint?.progress?.completionPercentage || 0}%</span>
                          </div>
                          <Progress value={sprint?.progress?.completionPercentage || 0} className="h-1.5 sm:h-2" />
                          <div className="text-xs text-muted-foreground">
                            {sprint?.progress?.tasksCompleted || 0} of {sprint?.progress?.totalTasks || 0} tasks completed
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs sm:text-sm">
                            <span className="text-muted-foreground">Story Points</span>
                            <span className="font-medium">
                              {sprint?.progress?.storyPointsCompleted || 0} / {sprint?.progress?.totalStoryPoints || 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs sm:text-sm">
                            <span className="text-muted-foreground">Velocity</span>
                            <span className="font-medium">{sprint?.velocity || 0}</span>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs sm:text-sm text-muted-foreground">
                          <div className="flex items-center space-x-1">
                            <Users className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                            <span className="truncate">{sprint?.teamMembers?.length} members</span>
                          </div>
                          <div className="flex items-center space-x-1 flex-shrink-0">
                            <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                            <span className="whitespace-nowrap">{new Date(sprint?.startDate).toLocaleDateString()}</span>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-xs sm:text-sm">
                          <div className="text-muted-foreground truncate">
                            {new Date(sprint?.startDate).toLocaleDateString()} - {new Date(sprint?.endDate).toLocaleDateString()}
                          </div>
                          <div className="text-muted-foreground whitespace-nowrap flex-shrink-0">
                            {Math.ceil((new Date(sprint?.endDate).getTime() - new Date(sprint?.startDate).getTime()) / (1000 * 60 * 60 * 24))} days
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="list" className="space-y-4">
                <div className="space-y-4">
                  {filteredSprints.map((sprint) => (
                    <Card 
                      key={sprint?._id} 
                      className="hover:shadow-md transition-shadow cursor-pointer overflow-x-hidden"
                      onClick={() => router.push(`/sprints/${sprint?._id}`)}
                    >
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 min-w-0">
                          <div className="flex-1 min-w-0 w-full">
                            <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2 mb-2">
                              <Badge className={`${getStatusColor(sprint?.status)} text-xs`}>
                                {getStatusIcon(sprint?.status)}
                                <span className="ml-1 hidden sm:inline">{formatToTitleCase(sprint?.status)}</span>
                              </Badge>
                            </div>
                            <div className="flex items-start gap-2 mb-2">
                              <h3 className="font-medium text-sm sm:text-base text-foreground truncate flex-1 min-w-0" title={sprint?.name}>
                                {sprint?.name}
                              </h3>
                            </div>
                            <p className="text-xs sm:text-sm text-muted-foreground mb-2 line-clamp-2" title={sprint?.description || 'No description'}>
                              {sprint?.description || 'No description'}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                              <div className="flex items-center space-x-1 min-w-0">
                                <Target className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                                <span 
                                  className="truncate"
                                  title={sprint?.project?.name && sprint?.project?.name.length > 10 ? sprint?.project?.name : undefined}
                                >
                                  {sprint?.project?.name && sprint?.project?.name.length > 10 ? `${sprint?.project?.name.slice(0, 10)}…` : sprint?.project?.name}
                                </span>
                              </div>
                              <div className="flex items-center space-x-1 flex-shrink-0">
                                <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                                <span className="whitespace-nowrap">{sprint?.teamMembers?.length} members</span>
                              </div>
                              <div className="flex items-center space-x-1 min-w-0">
                                <Calendar className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                                <span className="truncate">
                                  {new Date(sprint?.startDate).toLocaleDateString()} - {new Date(sprint?.endDate).toLocaleDateString()}
                                </span>
                              </div>
                              <div className="flex items-center space-x-1 flex-shrink-0 whitespace-nowrap">
                                <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
                                <span>Velocity: {sprint?.velocity || 0}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                            <div className="text-right sm:text-left">
                              <div className="text-xs sm:text-sm font-medium text-foreground">{sprint?.progress?.completionPercentage || 0}%</div>
                              <div className="w-16 sm:w-20 bg-gray-200 rounded-full h-1.5 sm:h-2">
                                <div 
                                  className="bg-blue-600 h-1.5 sm:h-2 rounded-full"
                                  style={{ width: `${sprint?.progress?.completionPercentage || 0}%` }}
                                />
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/sprints/${sprint._id}`)
                                }}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Sprint
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/sprints/${sprint._id}?tab=settings`)
                                }}>
                                  <Settings className="h-4 w-4 mr-2" />
                                  Settings
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/sprints/${sprint._id}/edit`)
                                }}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Sprint
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (confirm('Are you sure you want to delete this sprint? This action cannot be undone.')) {
                                      handleDeleteSprint(sprint._id)
                                    }
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Sprint
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
