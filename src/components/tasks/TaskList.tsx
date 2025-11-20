'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  Plus
} from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import EditTaskModal from './EditTaskModal'
import ViewTaskModal from './ViewTaskModal'
import CreateTaskModal from './CreateTaskModal'

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
}

interface TaskListProps {
  projectId: string
  onCreateTask: () => void
}

export default function TaskList({ projectId, onCreateTask }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    fetchTasks()
  }, [projectId])

  const fetchTasks = async () => {
    try {
      setLoading(true)
      // Handle "all" case by not passing project parameter
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

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 3000)
      return () => clearTimeout(t)
    }
  }, [success])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'todo': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'review': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'backlog': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      case 'testing': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'todo': return <Target className="h-4 w-4" />
      case 'in_progress': return <Play className="h-4 w-4" />
      case 'review': return <AlertTriangle className="h-4 w-4" />
      case 'backlog': return <Target className="h-4 w-4" />
      case 'testing': return <CheckCircle className="h-4 w-4" />
      case 'done': return <CheckCircle className="h-4 w-4" />
      case 'cancelled': return <XCircle className="h-4 w-4" />
      default: return <Target className="h-4 w-4" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      case 'medium': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'bug': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'feature': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'improvement': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'task': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      case 'subtask': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = !searchQuery || 
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter
    const matchesType = typeFilter === 'all' || task.type === typeFilter

    return matchesSearch && matchesStatus && matchesPriority && matchesType
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
        setSuccess('Task updated successfully.')
        setError('')
      } else if (data.success) {
        // If success but no data, just update status
        setTasks(prevTasks => 
          prevTasks.map(task => 
            task._id === taskId ? { ...task, status: newStatus as any } : task
          )
        )
        setSuccess('Task updated successfully.')
        setError('')
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

  const handleEditTask = (task: Task) => {
    setSelectedTask(task)
    setShowEditModal(true)
  }

  const handleViewTask = (task: Task) => {
    setSelectedTask(task)
    setShowViewModal(true)
  }

  const handleDeleteTask = (task: Task) => {
    setSelectedTask(task)
    setShowDeleteModal(true)
  }

  const confirmDeleteTask = async () => {
    if (!selectedTask) return

    setDeleteLoading(true)
    try {
      const response = await fetch(`/api/tasks/${selectedTask._id}`, {
        method: 'DELETE'
      })

      const data = await response.json()
      
      if (data.success) {
        setTasks(tasks.filter(task => task._id !== selectedTask._id))
        setShowDeleteModal(false)
        setSelectedTask(null)
        setSuccess('Task deleted successfully.')
      }
    } catch (error) {
      console.error('Failed to delete task:', error)
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleTaskUpdated = () => {
    fetchTasks()
    setShowEditModal(false)
    setSelectedTask(null)
    setSuccess('Task updated successfully.')
  }

  const handleTaskCreated = () => {
    fetchTasks() // Refresh the task list
    setShowCreateModal(false)
    setSuccess('Task created successfully.')
  }

  const handleCreateTaskClick = () => {
    setShowCreateModal(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading tasks...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-xl sm:text-2xl font-semibold text-foreground">Project Tasks</h3>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <Button onClick={handleCreateTaskClick} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Add Task
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 w-full"
          />
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="todo">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="review">Review</SelectItem>
              <SelectItem value="backlog">Backlog</SelectItem>
              <SelectItem value="testing">Testing</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="feature">Feature</SelectItem>
              <SelectItem value="improvement">Improvement</SelectItem>
              <SelectItem value="task">Task</SelectItem>
              <SelectItem value="subtask">Subtask</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {success && (
          <Alert variant="success">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="space-y-4">
        {filteredTasks.map((task) => (
          <Card key={task._id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h4 className="font-medium text-foreground text-sm sm:text-base truncate flex-1 min-w-0">{task.title}</h4>
                    <Badge className={getStatusColor(task.status) + ' flex-shrink-0'}>
                      {getStatusIcon(task.status)}
                      <span className="ml-1">{formatToTitleCase(task.status)}</span>
                    </Badge>
                    <Badge className={getPriorityColor(task.priority) + ' flex-shrink-0'}>
                      {formatToTitleCase(task.priority)}
                    </Badge>
                    <Badge className={getTypeColor(task.type) + ' flex-shrink-0'}>
                      {formatToTitleCase(task.type)}
                    </Badge>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-2 break-words">
                    {task.description || 'No description'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                    {task.assignedTo && (
                      <div className="flex items-center space-x-1">
                        <User className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span className="truncate">{task.assignedTo.firstName} {task.assignedTo.lastName}</span>
                      </div>
                    )}
                    {task.dueDate && (
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>
                      </div>
                    )}
                    {task.storyPoints && (
                      <div className="flex items-center space-x-1">
                        <Target className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span>{task.storyPoints} points</span>
                      </div>
                    )}
                    {task.estimatedHours && (
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span>{task.estimatedHours}h estimated</span>
                      </div>
                    )}
                  </div>
                  {task.labels.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-2">
                      {task.labels.map((label, index) => (
                        <Badge key={index} variant="outline" className="text-xs flex-shrink-0">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0 w-full sm:w-auto">
                  <Select 
                    value={task.status} 
                    onValueChange={(value) => handleStatusChange(task._id, value)}
                  >
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="review">Review</SelectItem>
                      <SelectItem value="backlog">Backlog</SelectItem>
                      <SelectItem value="testing">Testing</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="flex-shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditTask(task)}>
                        Edit Task
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleViewTask(task)}>
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => handleDeleteTask(task)}
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

      {filteredTasks.length === 0 && !loading && (
        <div className="text-center py-8">
          <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No tasks found</p>
          <Button onClick={handleCreateTaskClick} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Create First Task
          </Button>
        </div>
      )}

      {/* Modals */}
      <CreateTaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        projectId={projectId}
        onTaskCreated={handleTaskCreated}
      />

      {selectedTask && (
        <>
          <EditTaskModal
            isOpen={showEditModal}
            onClose={() => {
              setShowEditModal(false)
              setSelectedTask(null)
            }}
            task={selectedTask}
            onTaskUpdated={handleTaskUpdated}
          />

          <ViewTaskModal
            isOpen={showViewModal}
            onClose={() => {
              setShowViewModal(false)
              setSelectedTask(null)
            }}
            task={selectedTask}
            onEdit={() => {
              setShowViewModal(false)
              setShowEditModal(true)
            }}
            onDelete={() => {
              setShowViewModal(false)
              setShowDeleteModal(true)
            }}
          />

          <ConfirmationModal
            isOpen={showDeleteModal}
            onClose={() => {
              setShowDeleteModal(false)
              setSelectedTask(null)
            }}
            onConfirm={confirmDeleteTask}
            title="Delete Task"
            description={`Are you sure you want to delete "${selectedTask.title}"? This action cannot be undone.`}
            confirmText="Delete"
            cancelText="Cancel"
            variant="destructive"
            isLoading={deleteLoading}
          />
        </>
      )}
    </div>
  )
}
