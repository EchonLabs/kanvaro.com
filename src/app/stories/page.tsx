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
  Edit,
  GripVertical,
  X,
  Layers
} from 'lucide-react'
import { Permission, PermissionGate } from '@/lib/permissions'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface Story {
  _id: string
  title: string
  description: string
  status: 'backlog' | 'in_progress' | 'completed' | 'cancelled' | string
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

interface ProjectSummary {
  _id: string
  name: string
}

interface EpicSummary {
  _id: string
  name: string
}

interface SprintSummary {
  _id: string
  name: string
}

export default function StoriesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [showSuccessAlert, setShowSuccessAlert] = useState(false)
  const [success, setSuccess] = useState('')

  const [authError, setAuthError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [epicFilter, setEpicFilter] = useState('all')
  const [sprintFilter, setSprintFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [deleting, setDeleting] = useState(false);
  const [draggedStoryId, setDraggedStoryId] = useState<string | null>(null)

  const [projectOptions, setProjectOptions] = useState<ProjectSummary[]>([])
  const [epicOptions, setEpicOptions] = useState<EpicSummary[]>([])
  const [sprintOptions, setSprintOptions] = useState<SprintSummary[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalCount, setTotalCount] = useState(0)

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

  // Fetch when pagination changes (after initial load)
  useEffect(() => {
    if (!loading && !authError) {
      fetchStories()
    }
  }, [currentPage, pageSize])

  // Check for success message from query params (after story edit)
  useEffect(() => {
    const updated = searchParams.get('updated')
    if (updated === 'true') {
      setSuccessMessage('Story updated successfully')
      setShowSuccessAlert(true)
      // Clear the query parameter from URL
      router.replace('/stories', { scroll: false })
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setShowSuccessAlert(false)
        setSuccessMessage('')
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [searchParams, router])

  const fetchStories = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set('page', currentPage.toString())
      params.set('limit', pageSize.toString())
      
      const response = await fetch(`/api/stories?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setStories(data.data)
        setTotalCount(data.pagination?.total || data.data.length)
      } else {
        setError(data.error || 'Failed to fetch stories')
      }
    } catch (err) {
      setError('Failed to fetch stories')
    } finally {
      setLoading(false)
    }
  }

  // Build filter option lists from loaded stories
  useEffect(() => {
    if (!stories.length) {
      setProjectOptions([])
      setEpicOptions([])
      setSprintOptions([])
      return
    }

    const projectMap = new Map<string, ProjectSummary>()
    const epicMap = new Map<string, EpicSummary>()
    const sprintMap = new Map<string, SprintSummary>()

    stories.forEach((story) => {
      if (story.project?._id) {
        projectMap.set(story.project._id, {
          _id: story.project._id,
          name: story.project.name
        })
      }
      if (story.epic?._id) {
        epicMap.set(story.epic._id, {
          _id: story.epic._id,
          name: story.epic.name
        })
      }
      if (story.sprint?._id) {
        sprintMap.set(story.sprint._id, {
          _id: story.sprint._id,
          name: story.sprint.name
        })
      }
    })

    const safeCompare = (a?: { name?: string }, b?: { name?: string }) => {
      const an = a?.name || ''
      const bn = b?.name || ''
      return an.localeCompare(bn)
    }

    setProjectOptions(Array.from(projectMap.values()).sort(safeCompare))
    setEpicOptions(Array.from(epicMap.values()).sort(safeCompare))
    setSprintOptions(Array.from(sprintMap.values()).sort(safeCompare))
  }, [stories])

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
        setSuccessMessage('Story deleted successfully')
        setShowSuccessAlert(true)
        // Auto-hide after 5 seconds
        setTimeout(() => {
          setShowSuccessAlert(false)
          setSuccessMessage('')
        }, 5000)
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
      case 'backlog': return 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900'
      case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'backlog': return <List className="h-4 w-4" />
      case 'in_progress': return <Play className="h-4 w-4" />
      case 'completed': return <CheckCircle className="h-4 w-4" />
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

  const filteredStories = stories.filter(story => {
    const matchesSearch = !searchQuery || 
      story.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (story.project?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    
    const matchesStatus = statusFilter === 'all' || story.status === statusFilter
    const matchesPriority = priorityFilter === 'all' || story.priority === priorityFilter
    const matchesProject =
      projectFilter === 'all' || (story.project?._id ? story.project._id === projectFilter : false)
    const matchesEpic =
      epicFilter === 'all' || (story.epic?._id ? story.epic._id === epicFilter : false)
    const matchesSprint =
      sprintFilter === 'all' || (story.sprint?._id ? story.sprint._id === sprintFilter : false)

    return (
      matchesSearch &&
      matchesStatus &&
      matchesPriority &&
      matchesProject &&
      matchesEpic &&
      matchesSprint
    )
  })

  const kanbanStatuses: Array<Story['status']> = ['backlog', 'in_progress', 'completed', 'cancelled']

  const handleKanbanStatusChange = async (story: Story, nextStatus: Story['status']) => {
    if (nextStatus === story.status) return

    try {
      const response = await fetch(`/api/stories/${story._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: nextStatus })
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update story status')
      }

      setStories(prev =>
        prev.map((item) =>
          item._id === story._id ? { ...item, status: nextStatus } : item
        )
      )
      setSuccess('Story status updated successfully.')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      console.error('Failed to update story status:', err)
      setError(err instanceof Error ? err.message : 'Failed to update story status')
      setTimeout(() => setError(''), 4000)
    }
  }

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
                      <SelectItem value="backlog">Backlog</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
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

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
                  <Select value={projectFilter} onValueChange={setProjectFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Filter by project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      {projectOptions.map((project) => (
                        <SelectItem key={project._id} value={project._id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={epicFilter} onValueChange={setEpicFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Filter by epic" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Epics</SelectItem>
                      {epicOptions.map((epic) => (
                        <SelectItem key={epic._id} value={epic._id}>
                          {epic.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sprintFilter} onValueChange={setSprintFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Filter by sprint" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sprints</SelectItem>
                      {sprintOptions.map((sprint) => (
                        <SelectItem key={sprint._id} value={sprint._id}>
                          {sprint.name}
                        </SelectItem>
                      ))}
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
              
              {showSuccessAlert && successMessage && (
                <Alert className="mt-4 border-green-500 bg-green-50 dark:bg-green-900/20">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                      <AlertDescription className="text-green-800 dark:text-green-200 flex-1">
                        {successMessage}
                      </AlertDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-green-100 dark:hover:bg-green-900/40 ml-auto flex-shrink-0"
                      onClick={() => {
                        setShowSuccessAlert(false)
                        setSuccessMessage('')
                      }}
                    >
                      <X className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </Button>
                  </div>
                </Alert>
              )}

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
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2 cursor-default">
                                      {story.description || 'No description'}
                                    </p>
                                  </TooltipTrigger>
                                  {(story.description && story.description.length > 0) && (
                                    <TooltipContent>
                                      <p className="max-w-xs break-words">{story.description}</p>
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </TooltipProvider>
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
                                    <Layers className="h-4 w-4 flex-shrink-0" />
                                    {(() => {
                                      const epicName = (story.epic as any).name || (story.epic as any).title || ''
                                      if (!epicName) return null
                                      const isLong = epicName.length > 10
                                      const display = isLong ? `${epicName.slice(0, 10)}…` : epicName
                                      return (
                                        <span
                                          className="truncate"
                                          title={isLong ? epicName : undefined}
                                        >
                                          {display}
                                        </span>
                                      )
                                    })()}
                                  </div>
                                )}
                                {story.sprint && (
                                  <div className="flex items-center space-x-1 min-w-0">
                                    <Zap className="h-4 w-4 flex-shrink-0" />
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
                                <div className="text-sm text-muted-foreground truncate max-w-[120px]" title={`${story.assignedTo.firstName} ${story.assignedTo.lastName}`}>
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {kanbanStatuses.map((statusKey) => {
                    const columnStories = filteredStories.filter((story) => story.status === statusKey)
                    const label =
                      statusKey === 'completed'
                        ? 'Done'
                        : formatToTitleCase(statusKey)

                    return (
                      <div
                        key={statusKey}
                        className="bg-muted/40 rounded-lg border border-border flex flex-col max-h-[70vh]"
                        onDragOver={(e) => {
                          e.preventDefault()
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (!draggedStoryId) return
                          const story = stories.find((s) => s._id === draggedStoryId)
                          if (!story) return
                          handleKanbanStatusChange(story, statusKey)
                          setDraggedStoryId(null)
                        }}
                      >
                        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className={getStatusColor(statusKey)}>
                              {getStatusIcon(statusKey)}
                              <span className="ml-1 text-xs">{label}</span>
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {columnStories.length}
                          </span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                          {columnStories.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">
                              No stories
                            </p>
                          ) : (
                            columnStories.map((story) => (
                              <Card
                                key={story._id}
                                className="hover:shadow-sm transition-shadow cursor-pointer"
                                draggable
                                onDragStart={() => setDraggedStoryId(story._id)}
                                onClick={() => router.push(`/stories/${story._id}`)}
                              >
                                <CardContent className="p-3 space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <h3 className="font-medium text-xs sm:text-sm text-foreground truncate">
                                        {story.title}
                                      </h3>
                                      <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-2 mt-1">
                                        {story.description || 'No description'}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      className="text-muted-foreground hover:text-foreground cursor-grab flex-shrink-0"
                                      onMouseDown={(e) => {
                                        // Prevent opening the story when starting a drag
                                        e.stopPropagation()
                                      }}
                                    >
                                      <GripVertical className="h-4 w-4" />
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1 mt-1">
                                    <Badge className={getPriorityColor(story.priority)}>
                                      {formatToTitleCase(story.priority)}
                                    </Badge>
                                    {story.project?.name && (
                                      <Badge variant="outline" className="text-[10px] max-w-[80px] truncate hover:bg-transparent dark:hover:bg-transparent" title={story.project.name}>
                                        {story.project.name}
                                      </Badge>
                                    )}
                                    {story.epic?.name && (
                                      <Badge variant="outline" className="text-[10px] max-w-[80px] truncate hover:bg-transparent dark:hover:bg-transparent" title={story.epic.name}>
                                        {story.epic.name}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between mt-2">
                                    {story.assignedTo && (
                                      <span className="text-[11px] text-muted-foreground truncate">
                                        {story.assignedTo.firstName} {story.assignedTo.lastName}
                                      </span>
                                    )}
                                    <Select
                                      value={story.status}
                                      onValueChange={(value) =>
                                        handleKanbanStatusChange(
                                          story,
                                          value as Story['status']
                                        )
                                      }
                                    >
                                      <SelectTrigger className="h-7 w-[120px] text-[11px]">
                                        <SelectValue placeholder="Status" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {kanbanStatuses.map((status) => (
                                          <SelectItem key={status} value={status} className="text-xs">
                                            <div className="flex items-center gap-2">
                                              {getStatusIcon(status)}
                                              <span>
                                                {status === 'completed'
                                                  ? 'Done'
                                                  : formatToTitleCase(status)}
                                              </span>
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </CardContent>
                              </Card>
                            ))
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </TabsContent>
            </Tabs>

            {/* Pagination Controls */}
            {filteredStories.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Items per page:</span>
                  <Select value={pageSize.toString()} onValueChange={(value) => {
                    setPageSize(parseInt(value))
                    setCurrentPage(1)
                  }}>
                    <SelectTrigger className="w-20 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span>
                    Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1 || loading}
                    variant="outline"
                    size="sm"
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground px-2">
                    Page {currentPage} of {Math.ceil(totalCount / pageSize) || 1}
                  </span>
                  <Button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage >= Math.ceil(totalCount / pageSize) || loading}
                    variant="outline"
                    size="sm"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
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
