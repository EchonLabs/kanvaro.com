'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useDateTime } from '@/components/providers/DateTimeProvider'
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
  BookOpen,
  Layers,
  Rocket,
  ListTodo
} from 'lucide-react'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions'
import { extractUserId } from '@/lib/auth/user-utils'
import { useNotify } from '@/lib/notify'

interface Story {
  _id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  project?: {
    _id: string
    name: string
  } | null
  epic?: {
    _id: string
    title: string
    description?: string
    status?: 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
    priority?: 'low' | 'medium' | 'high' | 'critical'
    dueDate?: string
    tags?: string[]
    project?: {
      _id: string
      name: string
    }
    createdBy?: {
      firstName: string
      lastName: string
      email: string
    }
  } | null
  sprint?: {
    _id: string
    name: string
    description?: string
    status?: 'planning' | 'active' | 'completed' | 'cancelled'
    startDate?: string
    endDate?: string
    goal?: string
    project?: {
      _id: string
      name: string
    }
  } | null
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
  acceptanceCriteria: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
}

export default function StoryDetailPage() {
  const router = useRouter()
  const params = useParams()
  const storyId = params.id as string
  const { setItems } = useBreadcrumb()
  const { formatDate } = useDateTime()

  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [tasks, setTasks] = useState<any[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [storyTasksCurrentPage, setStoryTasksCurrentPage] = useState(1)
  const [storyTasksPageSize, setStoryTasksPageSize] = useState(5)

  // Pagination logic for story tasks
  const paginatedStoryTasks = useMemo(() => {
    const startIndex = (storyTasksCurrentPage - 1) * storyTasksPageSize
    const endIndex = startIndex + storyTasksPageSize
    return tasks.slice(startIndex, endIndex)
  }, [tasks, storyTasksCurrentPage, storyTasksPageSize])

  const storyTasksTotalPages = Math.ceil(tasks.length / storyTasksPageSize)

  const { hasPermission } = usePermissions()
  const { success: notifySuccess, error: notifyError } = useNotify()

  const fetchAndSetCurrentUser = useCallback(async () => {
    const response = await fetch('/api/auth/me')
    if (response.ok) {
      const data = await response.json().catch(() => ({}))
      const userId = extractUserId(data)
      if (userId) setCurrentUserId(userId)
    }
    return response
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetchAndSetCurrentUser()

      if (response.ok) {
        setAuthError('')
        // Fetch story first, then fetch tasks
        await fetchStory()
        // Fetch tasks after story is loaded (non-blocking)
        fetchTasks()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })

        if (refreshResponse.ok) {
          const meResponse = await fetchAndSetCurrentUser()
          if (meResponse.ok) {
            setAuthError('')
            // Fetch story first, then fetch tasks
            await fetchStory()
            // Fetch tasks after story is loaded (non-blocking)
            fetchTasks()
          } else {
            setAuthError('Session expired')
            setTimeout(() => {
              router.push('/login')
            }, 2000)
          }
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
  }, [router, storyId, fetchAndSetCurrentUser])

  useEffect(() => {
    // Set breadcrumb immediately on mount
    setItems([
      { label: 'Stories', href: '/stories' },
      { label: 'View Story' }
    ])
  }, [setItems])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (error) {
      notifyError({ title: error })
    }
    if (deleteError) {
      notifyError({ title: deleteError })
    }
    // notifyError is stable enough; omit from deps to avoid re-run loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, deleteError])

  const fetchStory = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/stories/${storyId}`)
      const data = await response.json()

      if (data.success) {
        setStory(data.data)
        // Ensure breadcrumb is set
        setItems([
          { label: 'Stories', href: '/stories' },
          { label: data.data.title || 'View Story' }
        ])
      } else {
        setError(data.error || 'Failed to fetch story')
      }
    } catch (err) {
      setError('Failed to fetch story')
    } finally {
      setLoading(false)
    }
  }

  const fetchTasks = async () => {
    if (!storyId) return

    try {
      setTasksLoading(true)
      // Add minimal=true parameter to get lightweight task data for story view
      const response = await fetch(`/api/tasks?story=${storyId}&minimal=true`)
      const data = await response.json()

      if (data.success) {
        setTasks(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err)
    } finally {
      setTasksLoading(false)
    }
  }

  const handleDeleteStory = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const response = await fetch(`/api/stories/${storyId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        notifySuccess({ title: 'Story deleted successfully' })
        router.push('/stories');
      } else {
        const data = await response.json();
        setDeleteError(data.error || 'Failed to delete story');
        setShowDeleteConfirmModal(false);
        notifyError({ title: data.error || 'Failed to delete story' })
      }
    } catch (e) {
      setDeleteError('Failed to delete story');
      setShowDeleteConfirmModal(false);
      notifyError({ title: 'Failed to delete story' })
    } finally {
      setDeleting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'todo': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'review': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900'
      case 'testing': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900'
      case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      // Sprint statuses
      case 'planning': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'active': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'todo': return <Target className="h-4 w-4" />
      case 'in_progress': return <Play className="h-4 w-4" />
      case 'review': return <AlertTriangle className="h-4 w-4" />
      // Sprint statuses
      case 'planning': return <Calendar className="h-4 w-4" />
      case 'active': return <Play className="h-4 w-4" />
      case 'completed': return <CheckCircle className="h-4 w-4" />
      case 'testing': return <Zap className="h-4 w-4" />
      case 'done': return <CheckCircle className="h-4 w-4" />
      case 'cancelled': return <XCircle className="h-4 w-4" />
      default: return <Target className="h-4 w-4" />
    }
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

  const isCreator = (story: Story) => {
    const creatorId = (story as any)?.createdBy?._id || (story as any)?.createdBy?.id
    return creatorId && currentUserId && creatorId.toString() === currentUserId.toString()
  }

  const canEditStory = (story: Story) =>
    hasPermission(Permission.STORY_UPDATE, story.project?._id) || isCreator(story)

  const canDeleteStory = (story: Story) =>
    hasPermission(Permission.STORY_DELETE, story.project?._id) || isCreator(story)

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading story...</p>
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

  if (error || !story) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive mb-4">{error || 'Story not found'}</p>
            <Button onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>
        </div>
      </MainLayout>
    )
  }

  const editAllowed = story ? canEditStory(story) : false
  const deleteAllowed = story ? canDeleteStory(story) : false

  return (
    <MainLayout>
      <div className="space-y-8 sm:space-y-10 lg:space-y-12 overflow-x-hidden">
        <div className="border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <Button
                variant="ghost"
                onClick={() => router.back()}
                className="self-start text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-9 px-3"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 flex-1 min-w-0">
                <h1
                  className="text-2xl font-semibold leading-snug text-foreground flex items-start gap-2 min-w-0 flex-wrap max-w-[70ch] [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden break-words overflow-wrap-anywhere"
                  title={story.title}
                >
                  <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 text-blue-600 flex-shrink-0" />
                  <span className="break-words overflow-wrap-anywhere">{story.title}</span>
                </h1>
                <div className="flex flex-row items-stretch sm:items-center gap-2 flex-shrink-0 flex-wrap sm:flex-nowrap">
                  <Button
                    variant="outline"
                    disabled={!editAllowed}
                    onClick={() => {
                      if (!editAllowed) return
                      router.push(`/stories/${storyId}/edit`)
                    }}
                    className="min-h-[36px] w-full sm:w-auto"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={!deleteAllowed}
                    onClick={() => {
                      if (!deleteAllowed) return
                      setShowDeleteConfirmModal(true)
                    }}
                    className="min-h-[36px] w-full sm:w-auto"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">User Story Details</p>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="md:col-span-2 space-y-8">
            <Card className="overflow-x-hidden">
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground break-words">
                  {story.description || 'No description provided'}
                </p>
              </CardContent>
            </Card>

            {story.acceptanceCriteria && story.acceptanceCriteria.length > 0 && (
              <Card className="overflow-x-hidden">
                <CardHeader>
                  <CardTitle>Acceptance Criteria</CardTitle>
                  <CardDescription>Criteria that must be met for this story to be considered complete</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {story.acceptanceCriteria.map((criteria, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm break-words">{criteria}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {story.epic && (
              <Card className="overflow-x-hidden">
                <CardHeader>
                  <CardTitle>Epic</CardTitle>
                  <CardDescription>Linked epic details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start space-x-2 min-w-0">
                    <Layers className="h-4 w-4 text-purple-600 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" title={story.epic.title}>
                        {story.epic.title}
                      </p>
                      {story.epic.description && (
                        <p className="text-xs text-muted-foreground mt-1 break-words">
                          {story.epic.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {story.epic.status && (
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">Status</span>
                        <Badge className={`${getStatusColor(story.epic.status)} text-xs`}>
                          {getStatusIcon(story.epic.status)}
                          <span className="ml-1 hidden sm:inline">{formatToTitleCase(story.epic.status)}</span>
                        </Badge>
                      </div>
                    )}

                    {story.epic.priority && (
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">Priority</span>
                        <Badge className={`${getPriorityColor(story.epic.priority)} text-xs`}>
                          {formatToTitleCase(story.epic.priority)}
                        </Badge>
                      </div>
                    )}

                    {story.epic.project?.name && (
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">Project</span>
                        <span
                          className="font-medium truncate max-w-[160px] text-right sm:text-left"
                          title={story.epic.project.name}
                        >
                          {story.epic.project.name.length > 15
                            ? `${story.epic.project.name.slice(0, 15)}…`
                            : story.epic.project.name}
                        </span>
                      </div>
                    )}

                    {story.epic.dueDate && (
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">Due Date</span>
                        <span className="font-medium whitespace-nowrap">
                          {formatDate(story.epic.dueDate)}
                        </span>
                      </div>
                    )}
                  </div>

                  {story.epic.tags && story.epic.tags.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs sm:text-sm text-muted-foreground">Tags</span>
                      <div className="flex flex-wrap gap-1">
                        {story.epic.tags.map((tag, index) => (
                          <Badge key={index} variant="outline" className="text-xs hover:bg-transparent dark:hover:bg-transparent">
                            <Star className="h-3 w-3 mr-1" />
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {story.epic.createdBy && (
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-muted-foreground">Created By</span>
                      <span className="font-medium truncate max-w-[200px] text-right sm:text-left">
                        {story.epic.createdBy.firstName} {story.epic.createdBy.lastName}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {story.sprint && (
              <Card className="overflow-x-hidden">
                <CardHeader>
                  <CardTitle>Sprint</CardTitle>
                  <CardDescription>Linked sprint details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start space-x-2 min-w-0">
                    <Rocket className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" title={story.sprint.name}>
                        {story.sprint.name}
                      </p>
                      {story.sprint.description && (
                        <p className="text-xs text-muted-foreground mt-1 break-words">
                          {story.sprint.description}
                        </p>
                      )}
                      {story.sprint.goal && (
                        <p className="text-xs text-muted-foreground mt-1 break-words">
                          <span className="font-medium">Goal:</span> {story.sprint.goal}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {story.sprint.status && (
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">Status</span>
                        <Badge className={`${getStatusColor(story.sprint.status)} text-xs`}>
                          {getStatusIcon(story.sprint.status)}
                          <span className="ml-1 hidden sm:inline">{formatToTitleCase(story.sprint.status)}</span>
                        </Badge>
                      </div>
                    )}

                    {story.sprint.project?.name && (
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">Project</span>
                        <span
                          className="font-medium truncate max-w-[160px] text-right sm:text-left"
                          title={story.sprint.project.name}
                        >
                          {story.sprint.project.name.length > 15
                            ? `${story.sprint.project.name.slice(0, 15)}…`
                            : story.sprint.project.name}
                        </span>
                      </div>
                    )}

                    {story.sprint.startDate && (
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">Start Date</span>
                        <span className="font-medium whitespace-nowrap">
                          {formatDate(story.sprint.startDate)}
                        </span>
                      </div>
                    )}

                    {story.sprint.endDate && (
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">End Date</span>
                        <span className="font-medium whitespace-nowrap">
                          {formatDate(story.sprint.endDate)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="overflow-x-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListTodo className="h-4 w-4 sm:h-5 sm:w-5" />
                  Tasks ({tasks.length})
                </CardTitle>
                <CardDescription>Tasks under this story</CardDescription>
              </CardHeader>
              <CardContent>
                {tasksLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No tasks found for this story.</p>
                ) : (
                  <div className="space-y-3">
                    {paginatedStoryTasks.map((task) => (
                      <Card
                        key={task._id}
                        className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-green-500"
                        onClick={() => router.push(`/tasks/${task._id}`)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {task.displayId && (
                                  <Badge variant="outline" className="text-xs">{task.displayId}</Badge>
                                )}
                                <h4 className="font-medium text-sm sm:text-base text-foreground truncate" title={task.title}>
                                  {task.title}
                                </h4>
                              </div>
                              {task.description && (
                                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mb-2">
                                  {task.description}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge className={`${getStatusColor(task.status)} text-xs`}>
                                  {getStatusIcon(task.status)}
                                  <span className="ml-1">{formatToTitleCase(task.status)}</span>
                                </Badge>
                                <Badge className={`${getPriorityColor(task.priority)} text-xs`}>
                                  {formatToTitleCase(task.priority)}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {formatToTitleCase(task.type)}
                                </Badge>
                                {task.storyPoints && (
                                  <Badge variant="outline" className="text-xs">
                                    {task.storyPoints} pts
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>

              {/* Pagination Controls */}
              {tasks.length > storyTasksPageSize && (
                <Card className="mt-4">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Items per page:</span>
                        <select
                          value={storyTasksPageSize}
                          onChange={(e) => {
                            setStoryTasksPageSize(parseInt(e.target.value))
                            setStoryTasksCurrentPage(1)
                          }}
                          className="px-2 py-1 border rounded text-sm bg-background"
                        >
                          <option value="5">5</option>
                          <option value="10">10</option>
                          <option value="50">50</option>
                          <option value="100">100</option>
                        </select>
                        <span>
                          Showing {((storyTasksCurrentPage - 1) * storyTasksPageSize) + 1} to {Math.min(storyTasksCurrentPage * storyTasksPageSize, tasks.length)} of {tasks.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => setStoryTasksCurrentPage(storyTasksCurrentPage - 1)}
                          disabled={storyTasksCurrentPage === 1}
                          variant="outline"
                          size="sm"
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-muted-foreground px-2">
                          Page {storyTasksCurrentPage} of {storyTasksTotalPages || 1}
                        </span>
                        <Button
                          onClick={() => setStoryTasksCurrentPage(storyTasksCurrentPage + 1)}
                          disabled={storyTasksCurrentPage >= storyTasksTotalPages}
                          variant="outline"
                          size="sm"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </Card>
          </div>

          <div className="space-y-8">
            <Card className="overflow-x-hidden">
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className={`${getStatusColor(story.status)} text-xs`}>
                    {getStatusIcon(story.status)}
                    <span className="ml-1 hidden sm:inline">{formatToTitleCase(story.status)}</span>
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-muted-foreground">Priority</span>
                  <Badge className={`${getPriorityColor(story.priority)} text-xs`}>
                    {formatToTitleCase(story.priority)}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                  <span className="text-muted-foreground">Project</span>
                  <span className="font-medium truncate max-w-[200px] sm:max-w-none text-right sm:text-left" title={story.project?.name && story.project?.name.length > 10 ? story.project?.name : undefined}>
                    {story.project?.name ? (story.project?.name.length > 10 ? `${story.project?.name.slice(0,10)}…` : story.project?.name) : <span className="italic text-muted-foreground">Project deleted or unavailable</span>}
                  </span>
                </div>
                
                {story.assignedTo && (
                  <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                    <span className="text-muted-foreground">Assigned To</span>
                    <span className="font-medium truncate max-w-[200px] sm:max-w-none text-right sm:text-left">
                      {story.assignedTo.firstName} {story.assignedTo.lastName}
                    </span>
                  </div>
                )}
                
                {story.dueDate && (
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-muted-foreground">Due Date</span>
                    <span className="font-medium whitespace-nowrap">
                      {formatDate(story.dueDate)}
                    </span>
                  </div>
                )}
                
                {story.storyPoints && (
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-muted-foreground">Story Points</span>
                    <span className="font-medium whitespace-nowrap">{story.storyPoints}</span>
                  </div>
                )}
                
                {story.estimatedHours && (
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-muted-foreground">Estimated Hours</span>
                    <span className="font-medium whitespace-nowrap">{story.estimatedHours}h</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {story.tags.length > 0 && (
              <Card className="overflow-x-hidden">
                <CardHeader>
                  <CardTitle>Tags</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {story.tags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="hover:bg-transparent dark:hover:bg-transparent">
                        <Star className="h-3 w-3 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="overflow-x-hidden">
              <CardHeader>
                <CardTitle>Created By</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {story.createdBy.firstName} {story.createdBy.lastName}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
                  {formatDate(story.createdAt)}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      {deleteError && (
        <Alert variant="destructive" className="my-4">
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      )}
      <ConfirmationModal
        isOpen={showDeleteConfirmModal}
        onClose={() => setShowDeleteConfirmModal(false)}
        onConfirm={handleDeleteStory}
        title="Delete Story"
        description={`Are you sure you want to delete "${story?.title}"? This action cannot be undone.`}
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        variant="destructive"
      />
    </MainLayout>
  )
}
