'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { Input } from '@/components/ui/Input'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import {
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
  Target,
  User,
  Loader2,
  Plus,
  BarChart3,
  RefreshCw,
  History
} from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface Task {
  _id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled' | 'backlog'
  priority: 'low' | 'medium' | 'high' | 'critical'
  type: 'bug' | 'feature' | 'improvement' | 'task' | 'subtask'
  assignedTo?: {
    firstName: string
    lastName: string
    email: string
  }
  createdBy: {
    firstName: string
    lastName: string
    email: string
  }
  storyPoints?: number
  dueDate?: string
  estimatedHours?: number
  actualHours?: number
  labels: string[]
  createdAt: string
  updatedAt: string
  movedFromSprint?: {
    _id: string
    name: string
  }
}

interface BacklogViewProps {
  projectId: string
  onCreateTask: () => void
}

interface Story {
  _id: string
  title: string
  status: 'backlog' | 'in_progress' | 'completed' | 'cancelled' | 'done'
  storyPoints?: number
  project?: {
    _id: string
    name: string
  }
}

export default function BacklogView({ projectId, onCreateTask }: BacklogViewProps) {
  const router = useRouter()
  const { formatDate } = useDateTime()
  const { hasPermission } = usePermissions()
  const [tasks, setTasks] = useState<Task[]>([])
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortBy, setSortBy] = useState('priority')

  useEffect(() => {
    fetchTasks()
    fetchStories()
  }, [projectId])

  const fetchTasks = async () => {
    try {
      setLoading(true)
      setError('')
      const url = projectId === 'all' ? '/api/tasks' : `/api/tasks?project=${projectId}`
      const response = await fetch(url)
      const data = await response.json()

      if (data.success) {
        setTasks(data.data)
      } else {
        setError(data.error || 'Failed to fetch tasks')
      }
    } catch (err) {
      setError('Failed to fetch tasks')
    } finally {
      setLoading(false)
    }
  }

  const fetchStories = async () => {
    try {
      const url = projectId === 'all' ? '/api/stories' : `/api/stories?projectId=${projectId}`
      const response = await fetch(url)
      const data = await response.json()

      if (data.success) {
        setStories(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch stories:', err)
    }
  }

  const refreshTasks = () => {
    fetchTasks()
    fetchStories()
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'medium': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900'
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'bug': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      case 'feature': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      case 'improvement': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'task': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'subtask': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const getPriorityValue = (priority: string) => {
    switch (priority) {
      case 'critical': return 4
      case 'high': return 3
      case 'medium': return 2
      case 'low': return 1
      default: return 0
    }
  }

  const filteredAndSortedTasks = tasks
    .filter(task => {
      const matchesSearch = !searchQuery ||
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter
      const matchesType = typeFilter === 'all' || task.type === typeFilter

      return matchesSearch && matchesPriority && matchesType
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          return getPriorityValue(b.priority) - getPriorityValue(a.priority)
        case 'storyPoints':
          return (b.storyPoints || 0) - (a.storyPoints || 0)
        case 'dueDate':
          if (!a.dueDate && !b.dueDate) return 0
          if (!a.dueDate) return 1
          if (!b.dueDate) return -1
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        default:
          return 0
      }
    })

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    // Store previous state for potential revert
    const previousTask = tasks.find(t => t._id === taskId)
    const previousStatus = previousTask?.status

    // Optimistic update - update UI immediately
    setTasks(prevTasks =>
      prevTasks.map(task =>
        task._id === taskId ? { ...task, status: newStatus as any } : task
      )
    )

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus })
      })

      const contentType = response.headers.get('content-type') || ''

      if (!response.ok) {
        // Check if response is JSON or HTML
        if (contentType.includes('application/json')) {
          try {
            const errorData = await response.json()
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
          } catch (parseError) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
        } else {
          // For non-JSON responses (like HTML 404 pages), don't try to parse
          throw new Error(`HTTP error! status: ${response.status}. The API endpoint may not be available in this environment.`)
        }
      }

      if (!contentType.includes('application/json')) {
        throw new Error('Invalid response format. Expected JSON but received HTML. The API endpoint may not be properly deployed.')
      }

      const data = await response.json()

      if (data.success && data.data) {
        // Update with server response to ensure consistency
        setTasks(prevTasks =>
          prevTasks.map(task =>
            task._id === taskId ? { ...task, ...data.data, status: newStatus as any } : task
          )
        )
      } else if (data.success) {
        // If success but no data, just update status
        setTasks(prevTasks =>
          prevTasks.map(task =>
            task._id === taskId ? { ...task, status: newStatus as any } : task
          )
        )
      } else {
        // Revert on error
        if (previousStatus) {
          setTasks(prevTasks =>
            prevTasks.map(task =>
              task._id === taskId ? { ...task, status: previousStatus } : task
            )
          )
        }
        setError(data.error || 'Failed to update task status')
      }
    } catch (error) {
      console.error('Failed to update task status:', error)
      // Revert on error
      if (previousStatus) {
        setTasks(prevTasks =>
          prevTasks.map(task =>
            task._id === taskId ? { ...task, status: previousStatus } : task
          )
        )
      }
      const errorMessage = error instanceof Error
        ? error.message
        : 'Failed to update task status. The API endpoint may not be available in this environment.'
      setError(errorMessage)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        setTasks(tasks.filter(task => task._id !== taskId))
      }
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }

  const stats = useMemo(() => {
    const totalTasks = tasks.length
    const todoTasks = tasks.filter(task => task.status === 'todo').length
    const inProgressTasks = tasks.filter(task => task.status === 'in_progress').length
    const completedTasks = tasks.filter(task => task.status === 'done').length

    // Calculate story points from user stories (not tasks)
    // Consider stories with status 'done' or 'completed' as completed
    const totalStoryPoints = stories.reduce((sum, story) => sum + (story.storyPoints || 0), 0)
    const completedStoryPoints = stories
      .filter(story => story.status === 'done' || story.status === 'completed')
      .reduce((sum, story) => sum + (story.storyPoints || 0), 0)

    return {
      totalTasks,
      todoTasks,
      inProgressTasks,
      completedTasks,
      totalStoryPoints,
      completedStoryPoints,
      completionPercentage: totalStoryPoints > 0 ? Math.round((completedStoryPoints / totalStoryPoints) * 100) : 0
    }
  }, [tasks, stories])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading backlog...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-xl sm:text-2xl font-semibold text-foreground">Product Backlog</h3>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Prioritized list of features, bugs, and improvements
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={refreshTasks} className="w-full sm:w-auto">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {/* <Button onClick={onCreateTask} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Task
          </Button> */}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* backlog Stats */}
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Tasks</p>
                <p className="text-2xl font-bold text-foreground">{stats.totalTasks}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                <Pause className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">To Do</p>
                <p className="text-2xl font-bold text-foreground">{stats.todoTasks}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Play className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-foreground">{stats.inProgressTasks}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-foreground">{stats.completedTasks}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Story Points Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Story Points Progress</CardTitle>
          <CardDescription>
            {stats.completedStoryPoints} of {stats.totalStoryPoints} story points completed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Progress</span>
              <span className="font-medium">{stats.completionPercentage}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${Math.min(100, Math.max(0, stats.completionPercentage || 0))}%`,
                  minWidth: stats.completionPercentage > 0 ? '2px' : '0px'
                }}
              />
            </div>
            {stats.totalStoryPoints === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                No story points assigned yet
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters and Search */}
      <div className="flex flex-col gap-2 sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search backlog items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 w-full"
          />
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="feature">Feature</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="improvement">Improvement</SelectItem>
              <SelectItem value="task">Task</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="storyPoints">Story Points</SelectItem>
              <SelectItem value="dueDate">Due Date</SelectItem>
              <SelectItem value="created">Created</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* backlog Items */}
      <div className="space-y-8">
        {filteredAndSortedTasks.map((task, index) => (
          <Card
            key={task._id}
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => router.push(`/tasks/${task._id}`)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1">
                  <div className="text-sm font-medium text-muted-foreground w-8">
                    #{index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <h4 className="font-medium text-foreground truncate max-w-[220px] sm:max-w-none">
                              {task.title}
                            </h4>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="start" className="max-w-xs break-words">
                            {task.title}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Badge className={getPriorityColor(task.priority)}>
                        {formatToTitleCase(task.priority)}
                      </Badge>
                      <Badge className={getTypeColor(task.type)}>
                        {formatToTitleCase(task.type)}
                      </Badge>
                      {task.storyPoints && (
                        <Badge variant="outline" className="hover:bg-transparent dark:hover:bg-transparent">
                          <BarChart3 className="h-3 w-3 mr-1" />
                          {task.storyPoints} pts
                        </Badge>
                      )}
                      {task.movedFromSprint && (
                        <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900">
                          <History className="h-3 w-3 mr-1" />
                          Moved from {task.movedFromSprint.name}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {task.description || 'No description'}
                    </p>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      {task.assignedTo && Array.isArray(task.assignedTo) && task.assignedTo.length > 0 && (
                        <div className="flex items-center space-x-1">
                          <User className="h-4 w-4" />
                          <span>
                            {(() => {
                              const firstAssignee = task.assignedTo[0];
                              const userData = firstAssignee.user || firstAssignee;
                              return `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Unknown User';
                            })()}
                          </span>
                        </div>
                      )}
                      {task.dueDate && (
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-4 w-4" />
                          <span>Due {formatDate(task.dueDate)}</span>
                        </div>
                      )}
                      {task.estimatedHours && (
                        <div className="flex items-center space-x-1">
                          <Clock className="h-4 w-4" />
                          <span>{task.estimatedHours}h estimated</span>
                        </div>
                      )}
                    </div>
                    {task.labels.length > 0 && (
                      <div className="flex items-center space-x-1 mt-2">
                        {task.labels.map((label, labelIndex) => (
                          <Badge key={labelIndex} variant="outline" className="text-xs hover:bg-transparent dark:hover:bg-transparent">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={task.status}
                    onValueChange={(value) => handleStatusChange(task._id, value)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="backlog">Backlog</SelectItem>
                      <SelectItem value="review">Review</SelectItem>
                      <SelectItem value="testing">Testing</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        Edit Task
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDeleteTask(task._id)}
                        className="text-destructive focus:text-destructive"
                      >
                        Delete Task
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredAndSortedTasks.length === 0 && !loading && (
        <div className="text-center py-8">
          <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No backlog items found</p>
          {hasPermission(Permission.TASK_CREATE) && (
            <Button onClick={onCreateTask} className="mt-4">
              <Plus className="h-4 w-4 mr-2" />
              Create First Task
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
