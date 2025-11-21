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
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { Label } from '@/components/ui/label'
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
    _id?: string
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
  const [updatingSprintId, setUpdatingSprintId] = useState<string | null>(null)
  const [completeModalOpen, setCompleteModalOpen] = useState(false)
  const [completingSprintId, setCompletingSprintId] = useState<string | null>(null)
  const [completionMode, setCompletionMode] = useState<'existing' | 'new'>('existing')
  const [availableSprints, setAvailableSprints] = useState<Sprint[]>([])
  const [availableSprintsLoading, setAvailableSprintsLoading] = useState(false)
  const [selectedTargetSprintId, setSelectedTargetSprintId] = useState('')
  const [completeError, setCompleteError] = useState('')
  const [incompleteTasks, setIncompleteTasks] = useState<Array<{ _id: string; title: string; status: string }>>([])
  const [newSprintForm, setNewSprintForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    capacity: ''
  })

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

  const formatDateInputValue = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const formatTaskStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      backlog: 'Backlog',
      todo: 'To Do',
      in_progress: 'In Progress',
      review: 'In Review',
      testing: 'Testing',
      done: 'Done',
      completed: 'Completed',
      cancelled: 'Cancelled'
    }
    return statusMap[status] || formatToTitleCase(status)
  }

  const loadAvailableSprints = useCallback(async (excludeSprintId: string) => {
    try {
      setAvailableSprintsLoading(true)
      const response = await fetch('/api/sprints?limit=200')
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load sprints')
      }

      const sprintList: Sprint[] = Array.isArray(data.data) ? data.data : []
      const filtered = sprintList.filter(
        sprintOption =>
          sprintOption._id !== excludeSprintId && ['planning', 'active'].includes(sprintOption.status)
      )

      setAvailableSprints(filtered)
    } catch (err) {
      console.error('Failed to load sprints list:', err)
      setAvailableSprints([])
      setCompleteError(err instanceof Error ? err.message : 'Failed to load sprints')
    } finally {
      setAvailableSprintsLoading(false)
    }
  }, [])

  const checkSprintForIncompleteTasks = async (sprintId: string): Promise<Array<{ _id: string; title: string; status: string }>> => {
    try {
      const response = await fetch(`/api/sprints/${sprintId}`)
      const data = await response.json()

      if (!response.ok || !data.success) {
        return []
      }

      const tasks = data.data?.tasks || []
      return tasks
        .filter((task: any) => !['done', 'completed'].includes(task.status))
        .map((task: any) => ({
          _id: task._id,
          title: task.title,
          status: task.status
        }))
    } catch (err) {
      console.error('Failed to check sprint tasks:', err)
      return []
    }
  }

  const handleSprintLifecycleAction = async (sprintId: string, action: 'start' | 'complete') => {
    if (action === 'complete') {
      const incomplete = await checkSprintForIncompleteTasks(sprintId)
      
      if (incomplete.length > 0) {
        setIncompleteTasks(incomplete)
        setCompletingSprintId(sprintId)
        setCompleteModalOpen(true)
        await loadAvailableSprints(sprintId)
        
        const sprint = sprints.find(s => s._id === sprintId)
        if (sprint) {
          const baseStart = sprint.endDate ? new Date(sprint.endDate) : new Date()
          const startDate = formatDateInputValue(baseStart)
          const endDateObj = new Date(baseStart)
          endDateObj.setDate(endDateObj.getDate() + 14)
          const endDate = formatDateInputValue(endDateObj)

          setNewSprintForm({
            name: `${sprint.name} - Next Sprint`,
            startDate,
            endDate,
            capacity: sprint.capacity ? String(sprint.capacity) : ''
          })
        }
        return
      }
    }

    try {
      setUpdatingSprintId(sprintId)
      setError('')

      const response = await fetch(`/api/sprints/${sprintId}/${action}`, {
        method: 'POST'
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        setError(data.error || `Failed to ${action} sprint`)
        return
      }

      setSprints(prev => prev.map(s => (s._id === sprintId ? data.data : s)))
      showSuccess(action === 'start' ? 'Sprint started successfully.' : 'Sprint completed successfully.')
    } catch (err) {
      console.error(`${action} sprint error:`, err)
      setError(`Failed to ${action} sprint`)
    } finally {
      setUpdatingSprintId(null)
    }
  }

  const finalizeCompleteSprint = async (targetSprintId?: string, newSprintData?: Sprint) => {
    if (!completingSprintId) return

    const options: RequestInit = { method: 'POST' }
    if (targetSprintId) {
      options.headers = { 'Content-Type': 'application/json' }
      options.body = JSON.stringify({ targetSprintId })
    }

    const res = await fetch(`/api/sprints/${completingSprintId}/complete`, options)
    const data = await res.json().catch(() => ({}))

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to complete sprint')
    }

    setSprints(prev => {
      let updated = prev.map(s => (s._id === completingSprintId ? data.data : s))
      
      // If a new sprint was created, add it to the list
      if (newSprintData) {
        // Check if it's not already in the list
        const exists = updated.some(s => s._id === newSprintData._id)
        if (!exists) {
          updated = [newSprintData, ...updated]
        }
      }
      
      return updated
    })
    showSuccess('Sprint completed successfully.')
    setCompleteModalOpen(false)
    setCompletingSprintId(null)
    setIncompleteTasks([])
    setSelectedTargetSprintId('')
    setCompleteError('')
  }

  const handleCompleteModalConfirm = async () => {
    if (!completingSprintId) return

    if (!incompleteTasks.length) {
      try {
        setUpdatingSprintId(completingSprintId)
        await finalizeCompleteSprint()
      } catch (err) {
        setCompleteError(err instanceof Error ? err.message : 'Failed to complete sprint')
      } finally {
        setUpdatingSprintId(null)
      }
      return
    }

    if (completionMode === 'existing') {
      if (!selectedTargetSprintId) {
        setCompleteError('Select a sprint to move the remaining tasks into.')
        return
      }
      try {
        setUpdatingSprintId(completingSprintId)
        await finalizeCompleteSprint(selectedTargetSprintId)
      } catch (err) {
        setCompleteError(err instanceof Error ? err.message : 'Failed to move tasks to the selected sprint')
      } finally {
        setUpdatingSprintId(null)
      }
      return
    }

    if (!newSprintForm.name || !newSprintForm.startDate || !newSprintForm.endDate) {
      setCompleteError('Provide a name and date range for the new sprint.')
      return
    }

      const sprint = sprints.find(s => s._id === completingSprintId)
      if (!sprint?.project?._id) {
        setCompleteError('Sprint project information is missing.')
        return
      }

      try {
        setUpdatingSprintId(completingSprintId)
        
        let teamMemberIds: string[] = []
        if (sprint.teamMembers && sprint.teamMembers.length > 0) {
          const fullSprintResponse = await fetch(`/api/sprints/${completingSprintId}`)
          const fullSprintData = await fullSprintResponse.json()
          if (fullSprintResponse.ok && fullSprintData.success) {
            teamMemberIds = (fullSprintData.data?.teamMembers || [])
              .map((m: any) => m._id || m)
              .filter(Boolean)
          } else {
            teamMemberIds = sprint.teamMembers
              .map((m: any) => m._id || m)
              .filter(Boolean)
          }
        }

        const createResponse = await fetch('/api/sprints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newSprintForm.name,
            description: `Auto-created from completion of ${sprint.name}`,
            project: sprint.project._id,
            startDate: newSprintForm.startDate,
            endDate: newSprintForm.endDate,
            goal: sprint.goal,
            capacity: Number(newSprintForm.capacity) || sprint.capacity,
            teamMembers: teamMemberIds
          })
        })

      const createdSprint = await createResponse.json()
      if (!createResponse.ok || !createdSprint.success) {
        throw new Error(createdSprint.error || 'Failed to create sprint')
      }

      const newSprintId = createdSprint.data?._id
      if (!newSprintId) {
        throw new Error('New sprint ID missing in response')
      }

      // Fetch full sprint details to get all populated fields
      const fullSprintResponse = await fetch(`/api/sprints/${newSprintId}`)
      const fullSprintData = await fullSprintResponse.json()
      
      let newSprint: Sprint | undefined
      if (fullSprintResponse.ok && fullSprintData.success) {
        newSprint = fullSprintData.data
      } else {
        // Fallback to the created sprint data if fetch fails
        newSprint = createdSprint.data
      }

      await finalizeCompleteSprint(newSprintId, newSprint)
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : 'Failed to create sprint')
    } finally {
      setUpdatingSprintId(null)
    }
  }

  const isCompleteConfirmDisabled = () => {
    if (updatingSprintId === completingSprintId) return true
    if (!incompleteTasks.length) return false
    if (completionMode === 'existing') {
      return !selectedTargetSprintId
    }
    return !newSprintForm.name || !newSprintForm.startDate || !newSprintForm.endDate
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
                              {/* <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/sprints/${sprint._id}?tab=settings`)
                              }}>
                                <Settings className="h-4 w-4 mr-2" />
                                Settings
                              </DropdownMenuItem> */}
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

                        <div className="flex flex-wrap gap-2">
                          {sprint.status === 'planning' && (
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSprintLifecycleAction(sprint._id, 'start')
                              }}
                              disabled={updatingSprintId === sprint._id}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              {updatingSprintId === sprint._id ? 'Starting...' : 'Start Sprint'}
                            </Button>
                          )}
                          {sprint.status === 'active' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSprintLifecycleAction(sprint._id, 'complete')
                              }}
                              disabled={updatingSprintId === sprint._id}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              {updatingSprintId === sprint._id ? 'Completing...' : 'Complete Sprint'}
                            </Button>
                          )}
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
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
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
                      <div className="flex flex-wrap gap-2 mt-3">
                        {sprint.status === 'planning' && (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSprintLifecycleAction(sprint._id, 'start')
                            }}
                            disabled={updatingSprintId === sprint._id}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            {updatingSprintId === sprint._id ? 'Starting...' : 'Start Sprint'}
                          </Button>
                        )}
                        {sprint.status === 'active' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSprintLifecycleAction(sprint._id, 'complete')
                            }}
                            disabled={updatingSprintId === sprint._id}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            {updatingSprintId === sprint._id ? 'Completing...' : 'Complete Sprint'}
                          </Button>
                        )}
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

        <ResponsiveDialog
          open={completeModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              setCompleteModalOpen(false)
              setCompleteError('')
              setSelectedTargetSprintId('')
              setCompletionMode('existing')
              setCompletingSprintId(null)
              setIncompleteTasks([])
              return
            }
            setCompleteModalOpen(true)
          }}
          title="Complete Sprint"
          description={
            incompleteTasks.length
              ? `There are ${incompleteTasks.length} incomplete task${
                  incompleteTasks.length === 1 ? '' : 's'
                }. Move them before completing the sprint.`
              : 'All tasks are completed. You can finish the sprint now.'
          }
          footer={
            <div className="flex flex-col sm:flex-row sm:justify-end gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => {
                  setCompleteModalOpen(false)
                  setCompleteError('')
                  setSelectedTargetSprintId('')
                  setCompletionMode('existing')
                  setCompletingSprintId(null)
                  setIncompleteTasks([])
                }}
                disabled={updatingSprintId === completingSprintId}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCompleteModalConfirm}
                disabled={isCompleteConfirmDisabled()}
              >
                {updatingSprintId === completingSprintId ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Complete Sprint
                  </>
                )}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {completeError && (
              <Alert variant="destructive">
                <AlertDescription>{completeError}</AlertDescription>
              </Alert>
            )}

            {incompleteTasks.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium text-foreground">
                    Incomplete Tasks
                  </Label>
                  <div className="mt-2 space-y-2 max-h-48 overflow-y-auto pr-1">
                    {incompleteTasks.map(task => (
                      <div key={task._id} className="rounded-md border bg-muted/40 px-3 py-2">
                        <p className="text-sm font-medium truncate" title={task.title}>
                          {task.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Current status: {formatTaskStatusLabel(task.status)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={completionMode === 'existing' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setCompletionMode('existing')
                      setSelectedTargetSprintId('')
                      setCompleteError('')
                    }}
                  >
                    Move to Existing Sprint
                  </Button>
                  <Button
                    type="button"
                    variant={completionMode === 'new' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setCompletionMode('new')
                      setCompleteError('')
                    }}
                  >
                    Create New Sprint
                  </Button>
                </div>

                {completionMode === 'existing' ? (
                  <div className="space-y-2">
                    <Label className="text-sm text-foreground">Select Sprint</Label>
                    <Select
                      value={selectedTargetSprintId}
                      onValueChange={(value) => setSelectedTargetSprintId(value)}
                      disabled={availableSprintsLoading || availableSprints.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={availableSprintsLoading ? 'Loading...' : 'Choose sprint'} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSprintsLoading ? (
                          <div className="px-2 py-1 text-sm text-muted-foreground">
                            Loading sprints...
                          </div>
                        ) : availableSprints.length === 0 ? (
                          <div className="px-2 py-1 text-sm text-muted-foreground">
                            No planning or active sprints available. Create a new sprint instead.
                          </div>
                        ) : (
                          availableSprints.map(option => (
                            <SelectItem key={option._id} value={option._id}>
                              <div className="flex flex-col">
                                <span className="font-medium">{option.name}</span>
                                {option.project?.name && (
                                  <span className="text-xs text-muted-foreground">
                                    Project: {option.project.name}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-sm text-foreground">Sprint Name</Label>
                      <Input
                        value={newSprintForm.name}
                        onChange={(event) =>
                          setNewSprintForm(prev => ({ ...prev, name: event.target.value }))
                        }
                        placeholder="Sprint name"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-sm text-foreground">Start Date</Label>
                        <Input
                          type="date"
                          value={newSprintForm.startDate}
                          onChange={(event) =>
                            setNewSprintForm(prev => ({ ...prev, startDate: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-sm text-foreground">End Date</Label>
                        <Input
                          type="date"
                          value={newSprintForm.endDate}
                          onChange={(event) =>
                            setNewSprintForm(prev => ({ ...prev, endDate: event.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm text-foreground">Capacity (hours)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={newSprintForm.capacity}
                        onChange={(event) =>
                          setNewSprintForm(prev => ({ ...prev, capacity: event.target.value }))
                        }
                        placeholder="Team capacity"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                All tasks in this sprint are completed. You can finish the sprint immediately.
              </p>
            )}
          </div>
        </ResponsiveDialog>
      </div>
    </MainLayout>
  )
}
