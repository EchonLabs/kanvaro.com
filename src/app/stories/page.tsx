'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Calendar,
  Clock,
  CheckCircle,
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
import { Permission } from '@/lib/permissions'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePermissions } from '@/lib/permissions/permission-context'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { extractUserId } from '@/lib/auth/user-utils'
import { useNotify } from '@/lib/notify'

interface UserSummary {
  _id?: string
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
}

interface Story {
  _id: string
  title: string
  description: string
  status: 'backlog' | 'todo' | 'inprogress' | 'done' | 'cancelled' | string
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
  assignedTo?: UserSummary | null
  createdBy?: UserSummary | string | null
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const isFirstFetch = useRef(true);

  const [authError, setAuthError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [epicFilter, setEpicFilter] = useState('all');
  const [sprintFilter, setSprintFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const { formatDate } = useDateTime();
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draggedStoryId, setDraggedStoryId] = useState<string | null>(null);

  const [projectOptions, setProjectOptions] = useState<ProjectSummary[]>([]);
  const [epicOptions, setEpicOptions] = useState<EpicSummary[]>([]);
  const [sprintOptions, setSprintOptions] = useState<SprintSummary[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [creatorDetailsMap, setCreatorDetailsMap] = useState<Record<string, UserSummary>>({});

  // Filter search states
  const [statusSearch, setStatusSearch] = useState<string>('');
  const [prioritySearch, setPrioritySearch] = useState<string>('');
  const [projectSearch, setProjectSearch] = useState<string>('');
  const [epicSearch, setEpicSearch] = useState<string>('');
  const [sprintSearch, setSprintSearch] = useState<string>('');

  // Filter options
  const statusOptions: { value: string; label: string }[] = [
    { value: 'all', label: 'All Status' },
    { value: 'backlog', label: 'Backlog' },
    { value: 'todo', label: 'Todo' },
    { value: 'inprogress', label: 'In Progress' },
    { value: 'done', label: 'Done' },
    { value: 'cancelled', label: 'Cancelled' },
  ];
  const priorityOptions: { value: string; label: string }[] = [
    { value: 'all', label: 'All Priority' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' },
  ];

  const { hasPermission } = usePermissions();
  const { success: notifySuccess, error: notifyError } = useNotify();
  const canManageAllStories = hasPermission(Permission.STORY_MANAGE_ALL);

  const fetchAndSetCurrentUser = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      if (response.ok) {
        const data = await response.json().catch(() => ({}))
        const userId = extractUserId(data)
        if (userId) setCurrentUserId(userId)
      }
      return response
    } catch (error) {
      console.error('Auth check failed:', error)
      throw error
    }
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetchAndSetCurrentUser()

      if (response.ok) {
        setAuthError('')
        await fetchStories()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })

        if (refreshResponse.ok) {
          const meResponse = await fetchAndSetCurrentUser()
          if (meResponse.ok) {
            setAuthError('')
            await fetchStories()
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
  }, [router, fetchAndSetCurrentUser])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    const successParam = searchParams?.get('success')
    if (successParam === 'story-created') {
      notifySuccess({ title: 'User story created successfully' })
    }
    // notifySuccess is stable enough; omit from deps to avoid re-run loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Fetch when pagination changes (after initial load)
  useEffect(() => {
    if (!loading && !authError) {
      fetchStories(currentPage)
    }
  }, [currentPage, pageSize]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch from page 1 whenever filters/search change
  useEffect(() => {
    if (authError) return
    setCurrentPage(1)
    fetchStories(1)
  }, [searchQuery, statusFilter, priorityFilter, projectFilter, epicFilter, sprintFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Check for success message from query params (after story edit)
  useEffect(() => {
    const updated = searchParams.get('updated')
    if (updated === 'true') {
      notifySuccess({ title: 'Story updated successfully' })
      router.replace('/stories', { scroll: false })
    }
    // notifySuccess is stable enough; omit from deps to avoid re-run loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router])

  const fetchStories = async (page = currentPage) => {
    try {
      if (isFirstFetch.current) {
        setLoading(true)
      } else {
        setIsFetching(true)
      }
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('limit', pageSize.toString())
      if (searchQuery.trim()) params.set('search', searchQuery.trim())
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (priorityFilter !== 'all') params.set('priority', priorityFilter)
      if (projectFilter !== 'all') params.set('projectId', projectFilter)
      if (epicFilter !== 'all') params.set('epicId', epicFilter)
      if (sprintFilter !== 'all') params.set('sprintId', sprintFilter)

      const response = await fetch(`/api/stories?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setStories(data.data)
        setTotalCount(data.pagination?.total || data.data.length)
      } else {
        notifyError({ title: 'Failed to Load Stories', message: data.error || 'Failed to fetch stories' })
      }
    } catch (err) {
      notifyError({ title: 'Failed to Load Stories', message: 'Failed to fetch stories' })
    } finally {
      if (isFirstFetch.current) {
        setLoading(false)
        isFirstFetch.current = false
      } else {
        setIsFetching(false)
      }
    }
  }

  const fetchEpicOptions = useCallback(async () => {
    try {
      const response = await fetch(`/api/epics`, {
        cache: 'no-store'
      })

      const data = await response.json().catch(() => ({}))
      if (data.success && Array.isArray(data.data)) {
        const normalizedEpics: EpicSummary[] = data.data
          .map((epic: any) => ({
            _id: (epic?._id ?? '').toString(),
            name: epic?.title || epic?.name || 'Untitled Epic'
          }))
          .filter((epic: EpicSummary) => Boolean(epic._id))
          .sort((a: EpicSummary, b: EpicSummary) => (a.name || '').localeCompare(b.name || ''))

        setEpicOptions(normalizedEpics)
      } else {
        setEpicOptions([])
      }
    } catch (error) {
      console.error('Failed to fetch epic filters:', error)
      setEpicOptions([])
    }
  }, [])

  useEffect(() => {
    if (!currentUserId) return
    fetchEpicOptions()
  }, [currentUserId, fetchEpicOptions])

  useEffect(() => {
    if (!stories.length) {
      setCreatorDetailsMap((prev) => (Object.keys(prev).length ? {} : prev))
      return
    }

    setCreatorDetailsMap((prev) => {
      const next = { ...prev }
      let changed = false

      stories.forEach((story) => {
        const creator = story.createdBy
        if (!creator || typeof creator === 'string') return

        const id = creator._id || (creator as any).id
        if (!id) return

        const sanitized: UserSummary = {
          _id: id,
          firstName: creator.firstName,
          lastName: creator.lastName,
          email: creator.email,
          avatar: creator.avatar
        }

        if (!next[id]) {
          next[id] = sanitized
          changed = true
          return
        }

        const existing = next[id]
        if (
          (sanitized.firstName && sanitized.firstName !== existing.firstName) ||
          (sanitized.lastName && sanitized.lastName !== existing.lastName) ||
          (sanitized.email && sanitized.email !== existing.email) ||
          (sanitized.avatar && sanitized.avatar !== existing.avatar)
        ) {
          next[id] = { ...existing, ...sanitized }
          changed = true
        }
      })

      return changed ? next : prev
    })
  }, [stories])

  useEffect(() => {
    if (!stories.length) return

    const idsToFetch = new Set<string>()

    stories.forEach((story) => {
      const creator = story.createdBy
      if (!creator) return

      if (typeof creator === 'string') {
        if (!creatorDetailsMap[creator]) {
          idsToFetch.add(creator)
        }
        return
      }

      const id = creator._id || (creator as any).id
      const hasProfile = Boolean(
        creator.firstName ||
        creator.lastName ||
        creator.email
      )

      if (id && !hasProfile && !creatorDetailsMap[id]) {
        idsToFetch.add(id)
      }
    })

    if (!idsToFetch.size) return

    const controller = new AbortController()

    const fetchCreators = async () => {
      try {
        const response = await fetch(`/api/users?ids=${Array.from(idsToFetch).join(',')}`, {
          signal: controller.signal,
          cache: 'no-store'
        })

        if (!response.ok) {
          console.warn('Failed to fetch creator info:', response.status)
          return
        }

        const data = await response.json()
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          setCreatorDetailsMap((prev) => ({ ...prev, ...data }))
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        console.error('Failed to fetch creator details:', error)
      }
    }

    fetchCreators()

    return () => controller.abort()
  }, [stories, creatorDetailsMap])

  // Build filter option lists from loaded stories
  useEffect(() => {
    if (!stories.length) {
      setProjectOptions([])
      setSprintOptions([])
      return
    }

    const projectMap = new Map<string, ProjectSummary>()
    const sprintMap = new Map<string, SprintSummary>()

    stories.forEach((story) => {
      if (story.project?._id) {
        projectMap.set(story.project._id, {
          _id: story.project._id,
          name: story.project.name
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
        notifySuccess({ title: 'Story deleted successfully' })
      } else {
        notifyError({ title: 'Failed to Delete Story', message: data.error || 'Failed to delete story' })
      }
    } catch (err) {
      notifyError({ title: 'Failed to Delete Story', message: 'Failed to delete story' })
    } finally {
      setDeleting(false)
    }
  }
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'backlog': return 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900'
      case 'todo': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900'
      case 'inprogress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const resolveStoryCreator = (story: Story): UserSummary | null => {
    const creator = story.createdBy
    if (!creator) return null

    if (typeof creator === 'string') {
      return creatorDetailsMap[creator] || null
    }

    if (creator.firstName || creator.lastName || creator.email) {
      return creator
    }

    const id = creator._id || (creator as any).id
    if (id && creatorDetailsMap[id]) {
      return creatorDetailsMap[id]
    }

    return null
  }

  const getUserDisplayName = (user?: UserSummary | null) => {
    if (!user) return 'Unknown Creator'
    const firstName = user.firstName?.trim() || ''
    const lastName = user.lastName?.trim() || ''
    const fullName = `${firstName} ${lastName}`.trim()
    if (fullName) return fullName
    return user.email || 'Unknown Creator'
  }

  const getUserInitials = (user?: UserSummary | null) => {
    if (!user) return '?'
    const firstInitial = user.firstName?.[0]
    const lastInitial = user.lastName?.[0]
    if (firstInitial || lastInitial) {
      return `${firstInitial ?? ''}${lastInitial ?? ''}`.toUpperCase()
    }
    if (user.email) {
      return user.email.charAt(0).toUpperCase()
    }
    return '?'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'backlog': return <List className="h-4 w-4" />
      case 'todo': return <Target className="h-4 w-4" />
      case 'inprogress': return <Play className="h-4 w-4" />
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
    const creatorData = story.createdBy as any
    const creatorId =
      typeof creatorData === 'string'
        ? creatorData
        : creatorData?._id || creatorData?.id

    return (
      Boolean(creatorId) &&
      Boolean(currentUserId) &&
      creatorId.toString() === currentUserId.toString()
    )
  }

  const canEditStory = (story: Story) =>
    hasPermission(Permission.STORY_UPDATE, story.project?._id) || isCreator(story)

  const canDeleteStory = (story: Story) =>
    hasPermission(Permission.STORY_DELETE, story.project?._id) || isCreator(story)

  // Server handles all filtering — stories returned are already filtered
  const filteredStories = stories

  const kanbanStatuses: Array<Story['status']> = ['backlog', 'todo', 'inprogress', 'done', 'cancelled']

  const handleKanbanStatusChange = async (story: Story, nextStatus: Story['status']) => {
    if (nextStatus === story.status) return
    if (!story.sprint?._id) {
      notifyError({
        title: 'Assign to a sprint first',
        message: 'Add this story to a sprint before moving it on the Kanban board.'
      })
      return
    }

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
      notifySuccess({ title: 'Story status updated successfully' })
    } catch (err) {
      console.error('Failed to update story status:', err)
      const message = err instanceof Error ? err.message : 'Failed to update story status'
      notifyError({ title: 'Failed to Update Story', message })
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
      <div className="space-y-6 overflow-x-hidden ">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">User Stories</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Manage your user stories and requirements</p>
          </div>
          <PermissionGate permission={Permission.STORY_CREATE}>
            <Button onClick={() => router.push('/stories/create-story')} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              New Story
            </Button>
          </PermissionGate>
        </div>


        {/* Search and Filters */}
        <div className="space-y-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search stories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          {/* Filter options - compact grid layout */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <Input
                  placeholder="Search status..."
                  className="m-2"
                  value={statusSearch}
                  onChange={e => {
                    setStatusSearch(e.target.value.toLowerCase());
                  }}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                />
                {statusOptions.filter(opt => opt.label.toLowerCase().includes(statusSearch)).map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <Input
                  placeholder="Search priority..."
                  className="m-2"
                  value={prioritySearch}
                  onChange={e => {
                    setPrioritySearch(e.target.value.toLowerCase());
                  }}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                />
                {priorityOptions.filter(opt => opt.label.toLowerCase().includes(prioritySearch)).map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <Input
                  placeholder="Search project..."
                  className="m-2"
                  value={projectSearch}
                  onChange={e => setProjectSearch(e.target.value.toLowerCase())}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                />
                <SelectItem value="all">All Projects</SelectItem>
                {projectOptions.filter(project => project.name.toLowerCase().includes(projectSearch)).map((project) => (
                  <SelectItem key={project._id} value={project._id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={epicFilter} onValueChange={setEpicFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Epic" />
              </SelectTrigger>
              <SelectContent>
                <Input
                  placeholder="Search epic..."
                  className="m-2"
                  value={epicSearch}
                  onChange={e => setEpicSearch(e.target.value.toLowerCase())}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                />
                <SelectItem value="all">All Epics</SelectItem>
                {epicOptions.filter(epic => epic.name.toLowerCase().includes(epicSearch)).map((epic) => (
                  <SelectItem key={epic._id} value={epic._id}>
                    {epic.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sprintFilter} onValueChange={setSprintFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sprint" />
              </SelectTrigger>
              <SelectContent>
                <Input
                  placeholder="Search sprint..."
                  className="m-2"
                  value={sprintSearch}
                  onChange={e => setSprintSearch(e.target.value.toLowerCase())}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                />
                <SelectItem value="all">All Sprints</SelectItem>
                {sprintOptions.filter(sprint => sprint.name.toLowerCase().includes(sprintSearch)).map((sprint) => (
                  <SelectItem key={sprint._id} value={sprint._id}>
                    {sprint.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Story count */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              {isFetching && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              {totalCount} stor{totalCount !== 1 ? 'ies' : 'y'} found
            </p>
          </div>
        </div>

        {/* Stories View */}
        <div>
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
                                <Badge className={getStatusColor(story.status)}>
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
                                  <span>Due {formatDate(story.dueDate)}</span>
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
                                <DropdownMenuItem
                                  onClick={e => { e.stopPropagation(); router.push(`/stories/${story._id}`); }}
                                  className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  <span>View Story</span>
                                </DropdownMenuItem>

                                {canEditStory(story) && (
                                  <DropdownMenuItem
                                    onClick={e => {
                                      e.stopPropagation()
                                      router.push(`/stories/${story._id}/edit`)
                                    }}
                                    className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
                                  >
                                    <Edit className="h-4 w-4 mr-2" />
                                    <span>Edit Story</span>
                                  </DropdownMenuItem>
                                )}

                                {canDeleteStory(story) && (
                                  <>
                                    <DropdownMenuSeparator className="my-1" />
                                    <DropdownMenuItem
                                      onClick={e => {
                                        e.stopPropagation()
                                        handleDeleteClick(story)
                                      }}
                                      className="flex items-center space-x-2 px-4 py-2 text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      <span>Delete Story</span>
                                    </DropdownMenuItem>
                                  </>
                                )}
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
                    statusKey === 'inprogress'
                      ? 'In Progress'
                      : statusKey === 'done'
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
                        if (!story.sprint?._id) {
                          setDraggedStoryId(null)
                          return
                        }
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
                          columnStories.map((story) => {
                            const isCreator = story.createdBy?.toString() === currentUserId || story.createdBy === currentUserId
                            const canDragStory = canManageAllStories || isCreator
                            const isDraggable = Boolean(story.sprint?._id) && canDragStory
                            const creatorDetails = resolveStoryCreator(story)
                            const creatorName = getUserDisplayName(creatorDetails)
                            const creatorInitials = getUserInitials(creatorDetails)
                            const creatorTitle = creatorDetails?.email
                              ? `${creatorName} (${creatorDetails.email})`
                              : creatorName
                            const assigneeName = story.assignedTo
                              ? `${story.assignedTo.firstName ?? ''} ${story.assignedTo.lastName ?? ''}`.trim() || story.assignedTo.email || ''
                              : ''
                            return (
                              <Card
                                key={story._id}
                                className={`hover:shadow-sm transition-shadow ${isDraggable ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                                draggable={isDraggable}
                                onDragStart={() => {
                                  if (!isDraggable) return
                                  setDraggedStoryId(story._id)
                                }}
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
                                  <div className="flex flex-col gap-1 mt-2">
                                    {assigneeName && (
                                      <span className="text-[11px] text-muted-foreground truncate">
                                        {assigneeName}
                                      </span>
                                    )}
                                    <div
                                      className="flex items-center gap-1 min-w-0"
                                      title={creatorTitle}
                                    >
                                      {creatorDetails?.avatar ? (
                                        <img
                                          src={creatorDetails.avatar}
                                          alt={creatorName}
                                          className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                                        />
                                      ) : (
                                        <div className="w-5 h-5 rounded-full bg-primary/80 text-primary-foreground text-[10px] font-medium flex items-center justify-center flex-shrink-0">
                                          {creatorInitials}
                                        </div>
                                      )}
                                      <span className="text-[11px] text-muted-foreground truncate">
                                        {creatorName}
                                      </span>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </TabsContent>
          </Tabs>

          {/* Pagination Controls */}
          {totalCount > 0 && (
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
                  disabled={currentPage === 1 || isFetching}
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
                  disabled={currentPage >= Math.ceil(totalCount / pageSize) || isFetching}
                  variant="outline"
                  size="sm"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
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
