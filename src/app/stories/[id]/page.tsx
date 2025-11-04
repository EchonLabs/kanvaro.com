'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
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
    name: string
  }
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => router.push('/stories')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center space-x-2">
                <BookOpen className="h-8 w-8 text-blue-600" />
                <span>{story.title}</span>
              </h1>
              <p className="text-muted-foreground">User Story Details</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => router.push(`/stories/${storyId}/edit`)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button variant="destructive" onClick={() => setShowDeleteConfirmModal(true)}>
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
                  {story.description || 'No description provided'}
                </p>
              </CardContent>
            </Card>

            {story.acceptanceCriteria && story.acceptanceCriteria.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Acceptance Criteria</CardTitle>
                  <CardDescription>Criteria that must be met for this story to be considered complete</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {story.acceptanceCriteria.map((criteria, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{criteria}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {story.epic && (
              <Card>
                <CardHeader>
                  <CardTitle>Epic</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    <Layers className="h-4 w-4 text-purple-600" />
                    <span className="text-sm">{story.epic.name}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {story.sprint && (
              <Card>
                <CardHeader>
                  <CardTitle>Sprint</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    <Target className="h-4 w-4 text-blue-600" />
                    <span className="text-sm">{story.sprint.name}</span>
                  </div>
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
                  <Badge className={getStatusColor(story.status)}>
                    {getStatusIcon(story.status)}
                    <span className="ml-1">{story.status.replace('_', ' ')}</span>
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Priority</span>
                  <Badge className={getPriorityColor(story.priority)}>
                    {story.priority}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Project</span>
                  <span className="font-medium">
                    {story.project?.name || <span className="italic text-muted-foreground">Project deleted or unavailable</span>}
                  </span>
                </div>
                
                {story.assignedTo && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Assigned To</span>
                    <span className="font-medium">
                      {story.assignedTo.firstName} {story.assignedTo.lastName}
                    </span>
                  </div>
                )}
                
                {story.dueDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Due Date</span>
                    <span className="font-medium">
                      {new Date(story.dueDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
                
                {story.storyPoints && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Story Points</span>
                    <span className="font-medium">{story.storyPoints}</span>
                  </div>
                )}
                
                {story.estimatedHours && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Estimated Hours</span>
                    <span className="font-medium">{story.estimatedHours}h</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {story.tags.length > 0 && (
              <Card>
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

            <Card>
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
                <p className="text-xs text-muted-foreground mt-1">
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
      />
    </MainLayout>
  )
}
