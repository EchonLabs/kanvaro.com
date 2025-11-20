'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
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
  Layers
} from 'lucide-react'

interface Epic {
  _id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
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
  storyPoints?: number
  dueDate?: string
  estimatedHours?: number
  tags: string[]
  progress: {
    completionPercentage: number
    storiesCompleted: number
    totalStories: number
    storyPointsCompleted: number
    totalStoryPoints: number
  }
  createdAt: string
  updatedAt: string
}

export default function EpicDetailPage() {
  const router = useRouter()
  const params = useParams()
  const epicId = params.id as string
  
  const [epic, setEpic] = useState<Epic | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [authError, setAuthError] = useState('')
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await fetchEpic()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          await fetchEpic()
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
  }, [router, epicId])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const fetchEpic = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/epics/${epicId}`)
      const data = await response.json()

      if (data.success) {
        setEpic(data.data)
      } else {
        setError(data.error || 'Failed to fetch epic')
      }
    } catch (err) {
      setError('Failed to fetch epic')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = () => {
    setShowDeleteConfirmModal(true)
  }

  const handleDeleteConfirm = async () => {
    try {
      setDeleting(true)
      const res = await fetch(`/api/epics/${epicId}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.success) {
        setShowDeleteConfirmModal(false)
        router.push('/epics')
      } else {
        setError(data?.error || 'Failed to delete epic')
        setShowDeleteConfirmModal(false)
      }
    } catch (e) {
      setError('Failed to delete epic')
      setShowDeleteConfirmModal(false)
    } finally {
      setDeleting(false)
    }
  }

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
            <p className="text-muted-foreground">Loading epic...</p>
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

  if (error || !epic) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive mb-4">{error || 'Epic not found'}</p>
            <Button onClick={() => router.push('/epics')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Epics
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
            <Button variant="ghost" onClick={() => router.push('/epics')} className="w-full sm:w-auto">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex-1 min-w-0">
              <h1
                className="text-2xl sm:text-3xl font-bold text-foreground truncate max-w-full flex items-center space-x-2 min-w-0"
                title={epic?.title}
              >
                <Layers className="h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 text-purple-600 flex-shrink-0" />
                <span>{epic?.title}</span>
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Epic Details</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
           <Button variant="outline" onClick={() => router.push(`/epics/${epicId}/edit`)} className="w-full sm:w-auto">
             <Edit className="h-4 w-4 mr-2" />
             Edit
           </Button>
            <Button variant="destructive" onClick={handleDeleteClick} disabled={deleting} className="w-full sm:w-auto">
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
                  {epic?.description || 'No description provided'}
                </p>
              </CardContent>
            </Card>

            <Card className="overflow-x-hidden">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Progress</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Epic completion status</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-muted-foreground">Overall Progress</span>
                    <span className="font-medium">{epic?.progress?.completionPercentage || 0}%</span>
                  </div>
                  <Progress value={epic?.progress?.completionPercentage || 0} className="h-1.5 sm:h-2" />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-muted-foreground">Stories</span>
                      <span className="font-medium">
                        {epic?.progress?.storiesCompleted || 0} / {epic?.progress?.totalStories || 0}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                      <div 
                        className="bg-blue-600 h-1.5 sm:h-2 rounded-full"
                        style={{ 
                          width: `${epic?.progress?.totalStories ? 
                            ((epic?.progress?.storiesCompleted / epic?.progress?.totalStories) * 100) : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-muted-foreground">Story Points</span>
                      <span className="font-medium">
                        {epic?.progress?.storyPointsCompleted || 0} / {epic?.progress?.totalStoryPoints || 0}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                      <div 
                        className="bg-green-600 h-1.5 sm:h-2 rounded-full"
                        style={{ 
                          width: `${epic?.progress?.totalStoryPoints ? 
                            ((epic?.progress?.storyPointsCompleted / epic?.progress?.totalStoryPoints) * 100) : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>
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
                  <Badge className={`${getStatusColor(epic?.status)} text-xs`}>
                    {getStatusIcon(epic?.status)}
                    <span className="ml-1">{formatToTitleCase(epic?.status)}</span>
                  </Badge>
                </div>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Priority</span>
                  <Badge className={`${getPriorityColor(epic?.priority)} text-xs`}>
                    {formatToTitleCase(epic?.priority)}
                  </Badge>
                </div>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Project</span>
                  <span 
                    className="text-xs sm:text-sm font-medium truncate max-w-[200px] sm:max-w-none text-right sm:text-left"
                    title={epic?.project?.name && epic?.project?.name.length > 10 ? epic?.project?.name : undefined}
                  >
                    {epic?.project?.name && epic?.project?.name.length > 10 ? `${epic?.project?.name.slice(0, 10)}…` : epic?.project?.name}
                  </span>
                </div>
                
                {epic?.assignedTo && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground">Assigned To</span>
                    <span className="text-xs sm:text-sm font-medium truncate max-w-[200px] sm:max-w-none text-right sm:text-left">
                      {epic?.assignedTo?.firstName} {epic?.assignedTo?.lastName}
                    </span>
                  </div>
                )}
                
                {epic?.dueDate && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground">Due Date</span>
                    <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
                      {new Date(epic?.dueDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
                
                {epic?.storyPoints && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground">Story Points</span>
                    <span className="text-xs sm:text-sm font-medium">{epic?.storyPoints}</span>
                  </div>
                )}
                
                {epic?.estimatedHours && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground">Estimated Hours</span>
                    <span className="text-xs sm:text-sm font-medium whitespace-nowrap">{epic?.estimatedHours}h</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {epic?.tags?.length > 0 && (
              <Card className="overflow-x-hidden">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base sm:text-lg">Tags</CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0">
                  <div className="flex flex-wrap gap-2">
                    {epic?.tags?.map((label, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        <Star className="h-3 w-3 mr-1" />
                        {label}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="overflow-x-hidden">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Created By</CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <div className="flex items-center space-x-2">
                  <User className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs sm:text-sm truncate">
                    {epic?.createdBy?.firstName} {epic?.createdBy?.lastName}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(epic?.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <ConfirmationModal
        isOpen={showDeleteConfirmModal}
        onClose={() => setShowDeleteConfirmModal(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Epic"
        description={`Are you sure you want to delete "${epic?.title}"? This action cannot be undone.`}
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        variant="destructive"
      />
    </MainLayout>
  )
}
