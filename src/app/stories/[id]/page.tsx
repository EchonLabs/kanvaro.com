'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
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
  BookOpen,
  Layers
} from 'lucide-react'

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
  
  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await fetchStory()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          await fetchStory()
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
  }, [router, storyId])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const fetchStory = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/stories/${storyId}`)
      const data = await response.json()

      if (data.success) {
        setStory(data.data)
      } else {
        setError(data.error || 'Failed to fetch story')
      }
    } catch (err) {
      setError('Failed to fetch story')
    } finally {
      setLoading(false)
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
        router.push('/stories');
      } else {
        const data = await response.json();
        setDeleteError(data.error || 'Failed to delete story');
        setShowDeleteConfirmModal(false);
      }
    } catch (e) {
      setDeleteError('Failed to delete story');
      setShowDeleteConfirmModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
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
      case 'todo': return <Target className="h-4 w-4" />
      case 'in_progress': return <Play className="h-4 w-4" />
      case 'review': return <AlertTriangle className="h-4 w-4" />
      case 'testing': return <Zap className="h-4 w-4" />
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
            <Button onClick={() => router.push('/stories')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Stories
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
            <Button variant="ghost" onClick={() => router.push('/stories')} className="w-full sm:w-auto">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="min-w-0">
              <h1
                className="text-2xl sm:text-3xl font-bold text-foreground truncate max-w-full flex items-center space-x-2 min-w-0"
                title={story.title}
              >
                <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 flex-shrink-0" />
                <span>{story.title}</span>
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">User Story Details</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => router.push(`/stories/${storyId}/edit`)} className="w-full sm:w-auto">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button variant="destructive" onClick={() => setShowDeleteConfirmModal(true)} className="w-full sm:w-auto">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
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
                          {new Date(story.epic.dueDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {story.epic.tags && story.epic.tags.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs sm:text-sm text-muted-foreground">Tags</span>
                      <div className="flex flex-wrap gap-1">
                        {story.epic.tags.map((tag, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
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
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2 min-w-0">
                    <Target className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <span className="text-sm truncate" title={story.sprint.name}>{story.sprint.name}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
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
                      {new Date(story.dueDate).toLocaleDateString()}
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
                      <Badge key={index} variant="outline">
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
                  {new Date(story.createdAt).toLocaleDateString()}
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
