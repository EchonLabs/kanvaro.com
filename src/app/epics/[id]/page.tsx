'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { formatToTitleCase } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { useNotify } from '@/lib/notify'
import { useDateTime } from '@/components/providers/DateTimeProvider'
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
  Layers,
  BookOpen
} from 'lucide-react'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { extractUserId } from '@/lib/auth/user-utils'

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
  const { setItems } = useBreadcrumb()
  const { success: notifySuccess, error: notifyError } = useNotify()
  const { formatDate } = useDateTime()
  
  const [epic, setEpic] = useState<Epic | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [authError, setAuthError] = useState('')
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [stories, setStories] = useState<any[]>([])
  const [storiesLoading, setStoriesLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)

  // Pagination logic for stories (must be called before any conditional returns)
  const paginatedStories = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    return stories.slice(startIndex, endIndex)
  }, [stories, currentPage, pageSize])

  const totalPages = Math.ceil(stories.length / pageSize)

  const { hasPermission } = usePermissions()

  const fetchAndSetCurrentUser = useCallback(async () => {
    const response = await fetch('/api/auth/me')
    if (response.ok) {
      const data = await response.json().catch(() => ({}))
      const userId = extractUserId(data)
      if (userId) setCurrentUserId(userId.toString())
    }
    return response
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetchAndSetCurrentUser()
      
      if (response.ok) {
        setAuthError('')
        await fetchEpic()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          const meAfterRefresh = await fetchAndSetCurrentUser()
          if (meAfterRefresh.ok) {
            await fetchEpic()
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
  }, [router, epicId, fetchAndSetCurrentUser])

  useEffect(() => {
    // Set breadcrumb immediately on mount
    setItems([
      { label: 'Epics', href: '/epics' },
      { label: 'View Epic' }
    ])
  }, [setItems])

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
        // Ensure breadcrumb is set
        setItems([
          { label: 'Epics', href: '/epics' },
          { label: 'View Epic' }
        ])
        // Fetch stories for this epic
        fetchStories()
      } else {
        setError(data.error || 'Failed to fetch epic')
      }
    } catch (err) {
      setError('Failed to fetch epic')
    } finally {
      setLoading(false)
    }
  }

  const fetchStories = async () => {
    try {
      setStoriesLoading(true)
      const response = await fetch(`/api/stories?epicId=${epicId}`)
      const data = await response.json()

      if (data.success) {
        setStories(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch stories:', err)
    } finally {
      setStoriesLoading(false)
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
        notifySuccess({ title: 'Epic deleted successfully' })
        router.push('/epics')
      } else {
        const message = data?.error || 'Failed to delete epic'
        setError(message)
        setShowDeleteConfirmModal(false)
        notifyError({ title: message })
      }
    } catch (e) {
      setError('Failed to delete epic')
      setShowDeleteConfirmModal(false)
      notifyError({ title: 'Failed to delete epic' })
    } finally {
      setDeleting(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'todo': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'review': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900'
      case 'testing': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900'
      case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
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
      case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'medium': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900'
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const isCreator = (epic: Epic) => {
    const creatorId = (epic as any)?.createdBy?._id || (epic as any)?.createdBy?.id
    return creatorId && currentUserId && creatorId.toString() === currentUserId.toString()
  }

  const canEditEpic = (epic: Epic) =>
    hasPermission(Permission.EPIC_EDIT) || isCreator(epic)

  const canDeleteEpic = (epic: Epic) =>
    hasPermission(Permission.EPIC_DELETE) || isCreator(epic)

  const editAllowed = epic ? canEditEpic(epic) : false
  const deleteAllowed = epic ? canDeleteEpic(epic) : false

  // Loading states
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
            <Button onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>
        </div>
      </MainLayout>
    )
  }

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
                title={epic?.title}
              >
                <Layers className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 text-purple-600 flex-shrink-0" />
                  <span className="break-words overflow-wrap-anywhere">{epic?.title}</span>
              </h1>
                <div className="flex flex-row items-stretch sm:items-center gap-2 flex-shrink-0 flex-wrap sm:flex-nowrap ml-auto">
            <Button
              variant="outline"
              disabled={!editAllowed}
              onClick={() => {
                if (!editAllowed) return
                router.push(`/epics/${epicId}/edit`)
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
            <p className="text-sm text-muted-foreground">Epic Details</p>
          </div>
        </div>

        <div className="grid gap-8 grid-cols-1 md:grid-cols-3">
          <div className="md:col-span-2 space-y-8">
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

            <Card className="overflow-x-hidden">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
                  Stories ({stories.length})
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Stories under this epic</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                {storiesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : stories.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No stories found for this epic.</p>
                ) : (
                  <div className="space-y-3">
                    {paginatedStories.map((story: any) => (
                      <Card
                        key={story._id}
                        className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-blue-500"
                        onClick={() => router.push(`/stories/${story._id}`)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm sm:text-base text-foreground mb-1 truncate" title={story.title}>
                                {story.title}
                              </h4>
                              {story.description && (
                                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mb-2">
                                  {story.description}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge className={`${getStatusColor(story.status)} text-xs`}>
                                  {getStatusIcon(story.status)}
                                  <span className="ml-1">{formatToTitleCase(story.status)}</span>
                                </Badge>
                                <Badge className={`${getPriorityColor(story.priority)} text-xs`}>
                                  {formatToTitleCase(story.priority)}
                                </Badge>
                                {story.storyPoints && (
                                  <Badge variant="outline" className="text-xs">
                                    {story.storyPoints} pts
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
              {stories.length > pageSize && (
                <Card className="mt-4">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Items per page:</span>
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(parseInt(e.target.value))
                            setCurrentPage(1)
                          }}
                          className="px-2 py-1 border rounded text-sm bg-background"
                        >
                          <option value="5">5</option>
                          <option value="10">10</option>
                          <option value="50">50</option>
                          <option value="100">100</option>
                        </select>
                        <span>
                          Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, stories.length)} of {stories.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => setCurrentPage(currentPage - 1)}
                          disabled={currentPage === 1 || storiesLoading}
                          variant="outline"
                          size="sm"
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-muted-foreground px-2">
                          Page {currentPage} of {totalPages || 1}
                        </span>
                        <Button
                          onClick={() => setCurrentPage(currentPage + 1)}
                          disabled={currentPage >= totalPages || storiesLoading}
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
                      {formatDate(epic?.dueDate)}
                    </span>
                  </div>
                )}
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Story Points</span>
                  <span className="text-xs sm:text-sm font-medium">
                    {epic?.progress?.totalStoryPoints ?? 0}
                  </span>
                </div>
                
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
                      <Badge key={index} variant="outline" className="text-xs hover:bg-transparent dark:hover:bg-transparent">
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
                  {formatDate(epic?.createdAt)}
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
