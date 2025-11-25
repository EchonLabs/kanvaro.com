'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  BookOpen,
  Trash2,
  Eye,
  Edit
} from 'lucide-react'
import { Permission, PermissionGate } from '@/lib/permissions'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'

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

export default function StoriesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [authError, setAuthError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [deleting, setDeleting] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await fetchStories()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          await fetchStories()
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
    if (successParam === 'story-created') {
      setSuccess('User story created successfully.')
      const timeout = setTimeout(() => setSuccess(''), 3000)
      return () => clearTimeout(timeout)
    }
  }, [searchParams])

  const fetchStories = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/stories')
      const data = await response.json()

      if (data.success) {
        setStories(data.data)
      } else {
        setError(data.error || 'Failed to fetch stories')
      }
    } catch (err) {
      setError('Failed to fetch stories')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = (story: Story) => {
    setSelectedStory(story)
    setShowDeleteConfirmModal(true)
  }
  const handleDeleteStory = async () => {
    if (!selectedStory) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/stories/${selectedStory._id}`, {
        method: 'DELETE'
      })
      const data = await response.json()
      if (data.success) {
        setStories(stories.filter(p => p._id !== selectedStory._id))
        setShowDeleteConfirmModal(false)
        setSelectedStory(null)
        setSuccess('Story deleted successfully.')
        setTimeout(() => setSuccess(''), 4000)
      } else {
        setError(data.error || 'Failed to delete story')
      }
    } catch (err) {
      setError('Failed to delete story')
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

  const filteredStories = stories.filter(story => {
    const matchesSearch = !searchQuery || 
      story.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (story.project?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    
    const matchesStatus = statusFilter === 'all' || story.status === statusFilter
    const matchesPriority = priorityFilter === 'all' || story.priority === priorityFilter

    return matchesSearch && matchesStatus && matchesPriority
  })

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading stories...</p>
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
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">User Stories</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Manage your user stories and requirements</p>
          </div>
          <Button onClick={() => router.push('/stories/create')} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            New Story
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>All Stories</CardTitle>
                  <CardDescription>
                    {filteredStories.length} story{filteredStories.length !== 1 ? 'ies' : ''} found
                  </CardDescription>
                </div>
              </div>
              {success && (
                <Alert variant="success">
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}
              <div className="flex flex-col gap-2 sm:gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search stories..."
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
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="review">Review</SelectItem>
                      <SelectItem value="testing">Testing</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Filter by priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priority</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'list' | 'kanban')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="list">List View</TabsTrigger>
                <TabsTrigger value="kanban">Kanban View</TabsTrigger>
              </TabsList>

              <TabsContent value="list" className="space-y-4">
                <div className="space-y-4">
                  {filteredStories.map((story) => (
                    <Card 
                      key={story._id} 
                      className={`hover:shadow-md transition-shadow ${story.project ? 'cursor-pointer' : 'cursor-pointer'}`}
                      onClick={() => { if (story.project) router.push(`/stories/${story._id}`); }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4 min-w-0">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center mb-2 min-w-0">
                                <BookOpen className="h-5 w-5 text-blue-600 flex-shrink-0" />
                                <div className="flex-1 min-w-0 ml-2">
                                  <h3 className="font-medium text-foreground text-sm sm:text-base truncate min-w-0">{story.title}</h3>
                                </div>
                                <div className="flex flex-shrink-0 items-center space-x-2 ml-2">
                                  <Badge className={getStatusColor(story.status) }>
                                    {getStatusIcon(story.status)}
                                    <span className="ml-1">{formatToTitleCase(story.status)}</span>
                                  </Badge>
                                  <Badge className={getPriorityColor(story.priority)}>
                                    {formatToTitleCase(story.priority)}
                                  </Badge>
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2 line-clamp-2" title={story.description}>
                                {story.description || 'No description'}
                              </p>
                              <div className="flex items-center space-x-4 text-sm text-muted-foreground min-w-0 flex-wrap">
                                <div className="flex items-center space-x-1">
                                  <Target className="h-4 w-4" />
                                  {story.project?.name ? (
                                    <span
                                      className="truncate"
                                      title={story.project.name && story.project.name.length > 10 ? story.project.name : undefined}
                                    >
                                      {story.project.name && story.project.name.length > 10 ? `${story.project.name.slice(0, 10)}…` : story.project.name}
                                    </span>
                                  ) : (
                                    <span className="truncate italic text-muted-foreground">Project deleted or unavailable</span>
                                  )}
                                </div>
                                {story.epic && (
                                  <div className="flex items-center space-x-1 min-w-0">
                                    <Zap className="h-4 w-4 flex-shrink-0" />
                                    <span
                                      className="truncate"
                                      title={story.epic.name && story.epic.name.length > 10 ? story.epic.name : undefined}
                                    >
                                      {story.epic.name && story.epic.name.length > 10 ? `${story.epic.name.slice(0, 10)}…` : story.epic.name}
                                    </span>
                                  </div>
                                )}
                                {story.sprint && (
                                  <div className="flex items-center space-x-1 min-w-0">
                                    <Calendar className="h-4 w-4 flex-shrink-0" />
                                    <span
                                      className="truncate"
                                      title={story.sprint.name && story.sprint.name.length > 10 ? story.sprint.name : undefined}
                                    >
                                      {story.sprint.name && story.sprint.name.length > 10 ? `${story.sprint.name.slice(0, 10)}…` : story.sprint.name}
                                    </span>
                                  </div>
                                )}
                                {story.dueDate && (
                                  <div className="flex items-center space-x-1">
                                    <Calendar className="h-4 w-4" />
                                    <span>Due {new Date(story.dueDate).toLocaleDateString()}</span>
                                  </div>
                                )}
                                {story.storyPoints && (
                                  <div className="flex items-center space-x-1">
                                    <BarChart3 className="h-4 w-4" />
                                    <span>{story.storyPoints} points</span>
                                  </div>
                                )}
                                {story.estimatedHours && (
                                  <div className="flex items-center space-x-1">
                                    <Clock className="h-4 w-4" />
                                    <span>{story.estimatedHours}h estimated</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="text-right">
                              {story.assignedTo && (
                                <div className="text-sm text-muted-foreground">
                                  {story.assignedTo.firstName} {story.assignedTo.lastName}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={e => e.stopPropagation()}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[172px] py-2 rounded-md shadow-lg border border-border bg-background z-[10000]">
                               
                                  <DropdownMenuItem onClick={e => { e.stopPropagation(); router.push(`/stories/${story._id}`); }} className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer">
                                    <Eye className="h-4 w-4 mr-2" />
                                    <span>View Story</span>
                                  </DropdownMenuItem>
                              
                                <PermissionGate permission={Permission.STORY_UPDATE} projectId={story.project?._id}>
                                  <DropdownMenuItem onClick={e => { e.stopPropagation(); router.push(`/stories/${story._id}/edit`); }} className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer">
                                    <Edit className="h-4 w-4 mr-2" />
                                    <span>Edit Story</span>
                                  </DropdownMenuItem>
                                </PermissionGate>
                                <PermissionGate permission={Permission.STORY_DELETE} projectId={story.project?._id}>
                                  <DropdownMenuSeparator className="my-1" />
                                  <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDeleteClick(story); }} className="flex items-center space-x-2 px-4 py-2 text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    <span>Delete Story</span>
                                  </DropdownMenuItem>
                                </PermissionGate>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="kanban" className="space-y-4">
                <div className="text-center py-8">
                  <Kanban className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Kanban board view will be implemented here</p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <ConfirmationModal
        isOpen={showDeleteConfirmModal}
        onClose={() => { setShowDeleteConfirmModal(false); setSelectedStory(null); }}
        onConfirm={handleDeleteStory}
        title="Delete Story"
        description={`Are you sure you want to delete "${selectedStory?.title}"? This action cannot be undone.`}
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        variant="destructive"
      />
    </MainLayout>
  )
}
