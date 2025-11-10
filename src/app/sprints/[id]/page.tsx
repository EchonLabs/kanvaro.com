'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { 
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  Play,
  XCircle,
  Target,
  Zap,
  BarChart3,
  User,
  Loader2,
  Edit,
  Trash2,
  Plus,
  Star,
  Users,
  TrendingUp,
  List,
  PauseCircle,
  Gauge
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
    _id: string
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
    estimatedHours: number
    actualHours: number
  }
  taskSummary?: {
    total: number
    completed: number
    inProgress: number
    todo: number
    blocked: number
    cancelled: number
  }
  tasks?: Array<{
    _id: string
    title: string
    status: string
    storyPoints: number
    estimatedHours: number
    actualHours: number
    priority: string
    type: string
    assignedTo: {
      _id: string
      firstName: string
      lastName: string
      email: string
    } | null
  }>
  createdAt: string
  updatedAt: string
}

export default function SprintDetailPage() {
  const router = useRouter()
  const params = useParams()
  const sprintId = params.id as string
  
  const [sprint, setSprint] = useState<Sprint | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await fetchSprint()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          await fetchSprint()
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
  }, [router, sprintId])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const fetchSprint = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/sprints/${sprintId}`)
      const data = await response.json()
      console.log('data', data);
      if (data.success) {
        setSprint(data.data)
      } else {
        setError(data.error || 'Failed to fetch sprint')
      }
    } catch (err) {
      setError('Failed to fetch sprint')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    try {
      setDeleting(true)
      const res = await fetch(`/api/sprints/${sprintId}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.success) {
        router.push('/sprints')
      } else {
        setError(data?.error || 'Failed to delete sprint')
      }
    } catch (e) {
      setError('Failed to delete sprint')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
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

  const getDaysRemaining = () => {
    if (!sprint) return 0
    const now = new Date()
    const endDate = new Date(sprint?.endDate)
    const diffTime = endDate.getTime() - now.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading sprint...</p>
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

  if (error || !sprint) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive mb-4">{error || 'Sprint not found'}</p>
            <Button onClick={() => router.push('/sprints')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Sprints
            </Button>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
            <Button variant="ghost" onClick={() => router.push('/sprints')} className="w-full sm:w-auto">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground flex items-center space-x-2 min-w-0">
                <Target className="h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 text-blue-600 flex-shrink-0" />
                <span className="truncate" title={sprint?.name}>{sprint?.name}</span>
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Sprint Details</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => router.push(`/sprints/${sprintId}/edit`)} className="w-full sm:w-auto">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)} disabled={deleting} className="w-full sm:w-auto">
              <Trash2 className="h-4 w-4 mr-2" />
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4 sm:space-y-6">
            <Card className="overflow-x-hidden">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Description</CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <p className="text-sm sm:text-base text-muted-foreground break-words">
                  {sprint?.description || 'No description provided'}
                </p>
              </CardContent>
            </Card>

            {sprint?.goal && (
              <Card className="overflow-x-hidden">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base sm:text-lg">Sprint Goal</CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0">
                  <p className="text-sm sm:text-base text-muted-foreground break-words">{sprint?.goal}</p>
                </CardContent>
              </Card>
            )}

            <Card className="overflow-x-hidden">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Progress</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {sprint?.progress?.totalTasks
                    ? `${sprint.progress.tasksCompleted} of ${sprint.progress.totalTasks} tasks completed`
                    : 'No tasks have been assigned to this sprint yet.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-muted-foreground">Overall Progress</span>
                    <span className="font-medium">{sprint?.progress?.completionPercentage || 0}%</span>
                  </div>
                  <Progress value={sprint?.progress?.completionPercentage || 0} className="h-1.5 sm:h-2" />
                </div>

                {!sprint?.progress?.totalTasks && (
                  <Alert variant="default" className="border-dashed border-muted-foreground/40 bg-muted/40">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs sm:text-sm">
                      Assign tasks to this sprint to start tracking progress, story points, and burn-down metrics.
                    </AlertDescription>
                  </Alert>
                )}

                {sprint?.progress?.totalTasks ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border bg-background p-3">
                        <div className="flex items-center justify-between text-xs uppercase text-muted-foreground tracking-wide">
                          <span>Tasks Completed</span>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        </div>
                        <p className="mt-2 text-lg font-semibold">
                          {sprint.progress.tasksCompleted} / {sprint.progress.totalTasks}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background p-3">
                        <div className="flex items-center justify-between text-xs uppercase text-muted-foreground tracking-wide">
                          <span>Story Points Burned</span>
                          <BarChart3 className="h-4 w-4 text-blue-500" />
                        </div>
                        <p className="mt-2 text-lg font-semibold">
                          {sprint.progress.storyPointsCompleted || 0} / {sprint.progress.totalStoryPoints || 0}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border bg-background p-3">
                        <div className="flex items-center justify-between text-xs uppercase text-muted-foreground tracking-wide">
                          <span>Estimated Hours</span>
                          <Clock className="h-4 w-4 text-primary" />
                        </div>
                        <p className="mt-2 text-lg font-semibold">
                          {sprint.progress.estimatedHours || 0}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {Math.max((sprint.progress.estimatedHours || 0) - (sprint.progress.actualHours || 0), 0)}h remaining
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background p-3">
                        <div className="flex items-center justify-between text-xs uppercase text-muted-foreground tracking-wide">
                          <span>Actual Hours</span>
                          <Gauge className="h-4 w-4 text-orange-500" />
                        </div>
                        <p className="mt-2 text-lg font-semibold">
                          {sprint.progress.actualHours || 0}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(sprint.progress.actualHours || 0) > (sprint.progress.estimatedHours || 0)
                            ? 'Over capacity'
                            : 'On track'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Task Breakdown</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <div className="rounded-md border bg-background px-3 py-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Total</span>
                            <List className="h-3.5 w-3.5" />
                          </div>
                          <p className="mt-1 text-base font-semibold">{sprint.taskSummary?.total ?? 0}</p>
                        </div>
                        <div className="rounded-md border bg-background px-3 py-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>In Progress</span>
                            <PauseCircle className="h-3.5 w-3.5 text-blue-500" />
                          </div>
                          <p className="mt-1 text-base font-semibold">{sprint.taskSummary?.inProgress ?? 0}</p>
                        </div>
                        <div className="rounded-md border bg-background px-3 py-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Backlog</span>
                            <Target className="h-3.5 w-3.5 text-slate-500" />
                          </div>
                          <p className="mt-1 text-base font-semibold">{sprint.taskSummary?.todo ?? 0}</p>
                        </div>
                        <div className="rounded-md border bg-background px-3 py-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Completed</span>
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                          </div>
                          <p className="mt-1 text-base font-semibold">{sprint.taskSummary?.completed ?? 0}</p>
                        </div>
                        <div className="rounded-md border bg-background px-3 py-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Blocked</span>
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          </div>
                          <p className="mt-1 text-base font-semibold">{sprint.taskSummary?.blocked ?? 0}</p>
                        </div>
                        <div className="rounded-md border bg-background px-3 py-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Cancelled</span>
                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                          </div>
                          <p className="mt-1 text-base font-semibold">{sprint.taskSummary?.cancelled ?? 0}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 sm:space-y-6">
            <Card className="overflow-x-hidden">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Details</CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Status</span>
                  <Badge className={`${getStatusColor(sprint?.status)} text-xs`}>
                    {getStatusIcon(sprint?.status)}
                    <span className="ml-1">{sprint?.status}</span>
                  </Badge>
                </div>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Project</span>
                  <span 
                    className="text-xs sm:text-sm font-medium truncate max-w-[200px] sm:max-w-none text-right sm:text-left"
                    title={sprint?.project?.name && sprint?.project?.name.length > 10 ? sprint?.project?.name : undefined}
                  >
                    {sprint?.project?.name && sprint?.project?.name.length > 10 ? `${sprint?.project?.name.slice(0, 10)}…` : sprint?.project?.name}
                  </span>
                </div>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Duration</span>
                  <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
                    {Math.ceil((new Date(sprint?.endDate).getTime() - new Date(sprint?.startDate).getTime()) / (1000 * 60 * 60 * 24))} days
                  </span>
                </div>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Start Date</span>
                  <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
                    {new Date(sprint?.startDate).toLocaleDateString()}
                  </span>
                </div>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">End Date</span>
                  <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
                    {new Date(sprint?.endDate).toLocaleDateString()}
                  </span>
                </div>
                
                {getDaysRemaining() > 0 && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground">Days Remaining</span>
                    <span className="text-xs sm:text-sm font-medium text-orange-600 whitespace-nowrap">{getDaysRemaining()}</span>
                  </div>
                )}
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Capacity</span>
                  <span className="text-xs sm:text-sm font-medium whitespace-nowrap">{sprint?.capacity}h</span>
                </div>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Velocity</span>
                  <span className="text-xs sm:text-sm font-medium whitespace-nowrap">{sprint?.velocity}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-x-hidden">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Team Members</CardTitle>
                <CardDescription className="text-xs sm:text-sm">{sprint?.teamMembers?.length} members</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <div className="space-y-2">
                  {sprint?.teamMembers?.map((member, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <User className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs sm:text-sm truncate">
                        {member.firstName} {member.lastName}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-x-hidden">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Created By</CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <div className="flex items-center space-x-2">
                  <User className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs sm:text-sm truncate">
                    {sprint?.createdBy?.firstName} {sprint?.createdBy?.lastName}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(sprint?.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        <ConfirmationModal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          title="Delete Sprint"
          description="Are you sure you want to delete this sprint? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          variant="destructive"
          isLoading={deleting}
        />
      </div>
    </MainLayout>
  )
}
