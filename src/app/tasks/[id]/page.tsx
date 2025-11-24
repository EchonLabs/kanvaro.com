'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { formatToTitleCase } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  Bug,
  Wrench,
  Layers,
  Circle,
  Paperclip
} from 'lucide-react'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { AttachmentList } from '@/components/ui/AttachmentList'

interface Task {
  _id: string
  title: string
  displayId: string
  description: string
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  type: 'bug' | 'feature' | 'improvement' | 'task' | 'subtask'
  project: {
    _id: string
    name: string
  }
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
  story?: {
    _id: string
    title: string
    epic?: {
      _id: string
      title: string
    }
  }
  sprint?: {
    _id: string
    name: string
  }
  parentTask?: {
    _id: string
    title: string
  }
  storyPoints?: number
  dueDate?: string
  estimatedHours?: number
  actualHours?: number
  labels: string[]
  createdAt: string
  updatedAt: string
  subtasks?: {
    _id: string
    title: string
    description?: string
    status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
    isCompleted: boolean
    createdAt: string
    updatedAt: string
  }[]
  attachments?: Array<{
    name: string
    url: string
    size: number
    type: string
    uploadedAt?: string
    uploadedBy?: {
      firstName?: string
      lastName?: string
      email?: string
    }
  }>
}

export default function TaskDetailPage() {
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string
  
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await fetchTask()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          await fetchTask()
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
  }, [router, taskId])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const fetchTask = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/tasks/${taskId}`)
      const data = await response.json()

      if (data.success) {
        setTask(data.data)
      } else {
        setError(data.error || 'Failed to fetch task')
      }
    } catch (err) {
      setError('Failed to fetch task')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteTask = async () => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE'
      })
      const data = await response.json()
      
      if (data.success) {
        setShowDeleteConfirmModal(false)
        router.push('/tasks')
      } else {
        setError(data.error || 'Failed to delete task')
      }
    } catch (error) {
      setError('Failed to delete task')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'backlog': return 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200'
      case 'todo': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'review': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'testing': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'backlog': return <Layers className="h-4 w-4" />
      case 'todo': return <Target className="h-4 w-4" />
      case 'in_progress': return <Play className="h-4 w-4" />
      case 'review': return <AlertTriangle className="h-4 w-4" />
      case 'testing': return <Zap className="h-4 w-4" />
      case 'done': return <CheckCircle className="h-4 w-4" />
      case 'cancelled': return <XCircle className="h-4 w-4" />
      default: return <Target className="h-4 w-4" />
    }
  }

  const formatDateTime = (value?: string) => {
    if (!value) return 'Not set'
    const date = new Date(value)
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bug': return <Bug className="h-4 w-4" />
      case 'feature': return <Layers className="h-4 w-4" />
      case 'improvement': return <Wrench className="h-4 w-4" />
      case 'task': return <Target className="h-4 w-4" />
      case 'subtask': return <Layers className="h-4 w-4" />
      default: return <Target className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading task...</p>
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

  if (error || !task) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive mb-4">{error || 'Task not found'}</p>
            <Button onClick={() => router.push('/tasks')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Tasks
            </Button>
          </div>
        </div>
      </MainLayout>
    )
  }

  const attachmentListItems = (task.attachments || []).map(attachment => ({
    name: attachment.name,
    url: attachment.url,
    size: attachment.size,
    type: attachment.type,
    uploadedAt: attachment.uploadedAt || new Date().toISOString(),
    uploadedBy:
      attachment.uploadedBy
        ? `${attachment.uploadedBy.firstName || ''} ${attachment.uploadedBy.lastName || ''}`.trim() ||
          attachment.uploadedBy.email ||
          'Unknown'
        : 'Unknown'
  }))

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center space-x-2">
                {getTypeIcon(task.type)}
                <span>{task.title} {task.displayId}</span>
              </h1>
              <p className="text-muted-foreground">Task Details</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => router.push(`/tasks/${taskId}/edit`)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => setShowDeleteConfirmModal(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {task.description || 'No description provided'}
                </p>
              </CardContent>
            </Card>

            {task.parentTask && (
              <Card>
                <CardHeader>
                  <CardTitle>Parent Task</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{task.parentTask.title}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {task.story && (
              <Card>
                <CardHeader>
                  <CardTitle>User Story</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{task.story.title}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {task.subtasks && task.subtasks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Subtasks</CardTitle>
                  <CardDescription>{task.subtasks.length} {task.subtasks.length === 1 ? 'subtask' : 'subtasks'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {task.subtasks.map((subtask, index) => (
                    <div key={subtask._id || index} className="p-3 border rounded-lg">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="mt-1">
                              {subtask.isCompleted ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`font-medium ${subtask.isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                                  {subtask.title}
                                </span>
                                <Badge className={`${getStatusColor(subtask.status)} text-xs flex items-center gap-1`}>
                                  {getStatusIcon(subtask.status)}
                                  <span>{formatToTitleCase(subtask.status)}</span>
                                </Badge>
                              </div>
                              {subtask.description && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {subtask.description}
                                </p>
                              )}
                            </div>
                          </div>
                          {subtask.isCompleted && (
                            <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50">
                              Completed
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <span>Created {formatDateTime(subtask.createdAt)}</span>
                          <span>Updated {formatDateTime(subtask.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className={getStatusColor(task.status)}>
                    {getStatusIcon(task.status)}
                    <span className="ml-1">{formatToTitleCase(task.status)}</span>
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Priority</span>
                  <Badge className={getPriorityColor(task.priority)}>
                    {formatToTitleCase(task.priority)}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <Badge className={getTypeColor(task.type)}>
                    {getTypeIcon(task.type)}
                    <span className="ml-1">{formatToTitleCase(task.type)}</span>
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Project</span>
                  {task.project?.name ? (
                    <span
                      className="font-medium truncate max-w-[200px]"
                      title={task.project.name && task.project.name.length > 10 ? task.project.name : undefined}
                    >
                      {task.project.name && task.project.name.length > 10 ? `${task.project.name.slice(0, 10)}…` : task.project.name}
                    </span>
                  ) : (
                    <span className="font-medium">—</span>
                  )}
                </div>
                
                {task.sprint?.name && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sprint</span>
                    <span
                      className="font-medium truncate max-w-[200px]"
                      title={task.sprint.name.length > 20 ? task.sprint.name : undefined}
                    >
                      {task.sprint.name.length > 20 ? `${task.sprint.name.slice(0, 20)}…` : task.sprint.name}
                    </span>
                  </div>
                )}
                
                {task.story?.title && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Story</span>
                    <span
                      className="font-medium truncate max-w-[200px]"
                      title={task.story.title.length > 20 ? task.story.title : undefined}
                    >
                      {task.story.title.length > 20 ? `${task.story.title.slice(0, 20)}…` : task.story.title}
                    </span>
                  </div>
                )}
                
                {task.story?.epic?.title && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Epic</span>
                    <span
                      className="font-medium truncate max-w-[200px]"
                      title={task.story.epic.title.length > 20 ? task.story.epic.title : undefined}
                    >
                      {task.story.epic.title.length > 20 ? `${task.story.epic.title.slice(0, 20)}…` : task.story.epic.title}
                    </span>
                  </div>
                )}
                
                {task.assignedTo && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Assigned To</span>
                    <span className="font-medium">
                      {task.assignedTo.firstName} {task.assignedTo.lastName}
                    </span>
                  </div>
                )}
                
                {task.dueDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Due Date</span>
                    <span className="font-medium">
                      {new Date(task.dueDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
                
                {task.storyPoints && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Story Points</span>
                    <span className="font-medium">{task.storyPoints}</span>
                  </div>
                )}
                
                {task.estimatedHours && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Estimated Hours</span>
                    <span className="font-medium">{task.estimatedHours}h</span>
                  </div>
                )}
                
                {task.actualHours != null && task.actualHours > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Actual Hours</span>
                    <span className="font-medium">{task.actualHours}h</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {task.labels.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Labels</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {task.labels.map((label, index) => (
                      <Badge key={index} variant="outline">
                        <Star className="h-3 w-3 mr-1" />
                        {label}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  <span>Attachments</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {attachmentListItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No attachments uploaded.</p>
                ) : (
                  <AttachmentList attachments={attachmentListItems} canDelete={false} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Created By</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {task.createdBy.firstName} {task.createdBy.lastName}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(task.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirmModal}
        onClose={() => setShowDeleteConfirmModal(false)}
        onConfirm={handleDeleteTask}
        title="Delete Task"
        description={`Are you sure you want to delete "${task?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </MainLayout>
  )
}
