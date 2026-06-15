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
import { useAuthContext } from '@/contexts/AuthContext'
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
import { cn } from '@/lib/utils'
import {
  StatusBadge, PriorityBadge, TypeBadge,
  PageHeader, TasksEmptyState, TasksLoadingSkeleton,
  PaginationBar, MetaChip, InlineLoader, FullPageLoader,
  cardShell, cardHover
} from '@/components/tasks/TasksShared'

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
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()

  const router = useRouter();
  const searchParams = useSearchParams();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const isFirstFetch = useRef(true);

  // Helper function to focus filter search inputs
  const focusSearchInput = (el: HTMLInputElement | null) => {
    if (!el || el.disabled) return

    const doFocus = () => {
      el.focus({ preventScroll: true })
      try {
        el.select?.()
      } catch {
        // ignore
      }
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(doFocus)
    } else {
      setTimeout(doFocus, 0)
    }
  }

  // Filter search input refs
  const statusSearchInputRef = useRef<HTMLInputElement | null>(null)
  const prioritySearchInputRef = useRef<HTMLInputElement | null>(null)
  const projectSearchInputRef = useRef<HTMLInputElement | null>(null)
  const epicSearchInputRef = useRef<HTMLInputElement | null>(null)
  const sprintSearchInputRef = useRef<HTMLInputElement | null>(null)

  ;
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
  const [showFilters, setShowFilters] = useState(false)
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


  // Auth initialization - trigger data loading
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      setLoading(false)
      fetchStories()
      fetchEpicOptions()
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated])

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
    if (!loading) {
      fetchStories(currentPage)
    }
  }, [currentPage, pageSize]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch from page 1 whenever filters/search change
  useEffect(() => {
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
    fetchEpicOptions()
  }, [fetchEpicOptions])

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
      case 'backlog': return <List className="h-4 w-4" strokeWidth={1.5} />
      case 'todo': return <Target className="h-4 w-4" strokeWidth={1.5} />
      case 'inprogress': return <Play className="h-4 w-4" strokeWidth={1.5} />
      case 'done': return <CheckCircle className="h-4 w-4" strokeWidth={1.5} />
      case 'cancelled': return <XCircle className="h-4 w-4" strokeWidth={1.5} />
      default: return <Target className="h-4 w-4" strokeWidth={1.5} />
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
    const currentUserId = user ? ((user as any)._id || (user as any).id) : null
    return creatorId && currentUserId && creatorId.toString() === currentUserId.toString()
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
        <FullPageLoader label="Loading stories..." />
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6 overflow-x-hidden animate-in fade-in-0 duration-300">

        {/* Page Header */}
        <PageHeader
          title="User Stories"
          subtitle="Manage your user stories and requirements"
          icon={BookOpen}
          actions={
            <PermissionGate permission={Permission.STORY_CREATE}>
              <Button
                onClick={() => router.push('/stories/create-story')}
                className="rounded-full bg-[var(--apple-system-blue)] text-white text-[15px] font-semibold px-4 h-9 hover:opacity-90 apple-transition"
              >
                <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
                New Story
              </Button>
            </PermissionGate>
          }
        />

        {/* Filter Toolbar */}
        <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]/40 p-3 space-y-3">
          {/* Row 1: Search + Status + Priority */}
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Search bar — takes ~65% */}
            <div className="relative flex-[2]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--apple-tertiary-label)]" strokeWidth={1.5} />
              <Input
                placeholder="Search stories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10 rounded-full border-[var(--apple-separator)] bg-background text-[15px] placeholder:text-[var(--apple-tertiary-label)] focus:border-[var(--apple-system-blue)] focus:ring-2 focus:ring-[var(--apple-system-blue)]/20 apple-transition"
              />
            </div>
            {/* Status */}
            <div className="flex-1">
              <Select value={statusFilter} onValueChange={setStatusFilter} onOpenChange={(open) => {
                if (open) focusSearchInput(statusSearchInputRef.current)
              }}>
                <SelectTrigger className="h-9 rounded-full border-[var(--apple-separator)] bg-background text-[13px] font-medium w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <Input
                    ref={statusSearchInputRef}
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
            </div>
            {/* Priority */}
            <div className="flex-1">
              <Select value={priorityFilter} onValueChange={setPriorityFilter} onOpenChange={(open) => {
                if (open) focusSearchInput(prioritySearchInputRef.current)
              }}>
                <SelectTrigger className="h-9 rounded-full border-[var(--apple-separator)] bg-background text-[13px] font-medium w-full">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <Input
                    ref={prioritySearchInputRef}
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
          </div>

          {/* Row 2: Project + Epic + Sprint */}
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Project */}
            <div className="flex-1">
              <Select value={projectFilter} onValueChange={setProjectFilter} onOpenChange={(open) => {
                if (open) focusSearchInput(projectSearchInputRef.current)
              }}>
                <SelectTrigger className="h-9 rounded-full border-[var(--apple-separator)] bg-background text-[13px] font-medium w-full">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <Input
                    ref={projectSearchInputRef}
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
            </div>
            {/* Epic */}
            <div className="flex-1">
              <Select value={epicFilter} onValueChange={setEpicFilter} onOpenChange={(open) => {
                if (open) focusSearchInput(epicSearchInputRef.current)
              }}>
                <SelectTrigger className="h-9 rounded-full border-[var(--apple-separator)] bg-background text-[13px] font-medium w-full">
                  <SelectValue placeholder="Epic" />
                </SelectTrigger>
                <SelectContent>
                  <Input
                    ref={epicSearchInputRef}
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
            </div>
            {/* Sprint */}
            <div className="flex-1">
              <Select value={sprintFilter} onValueChange={setSprintFilter} onOpenChange={(open) => {
                if (open) focusSearchInput(sprintSearchInputRef.current)
              }}>
                <SelectTrigger className="h-9 rounded-full border-[var(--apple-separator)] bg-background text-[13px] font-medium w-full">
                  <SelectValue placeholder="Sprint" />
                </SelectTrigger>
                <SelectContent>
                  <Input
                    ref={sprintSearchInputRef}
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
          </div>

          {/* Count + isFetching spinner */}
          <div className="flex items-center gap-2 px-0.5">
            {isFetching && (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--apple-system-blue)] border-t-transparent" />
            )}
            <p className="text-[13px] text-[var(--apple-secondary-label)] font-apple-mono">
              {totalCount} stor{totalCount !== 1 ? 'ies' : 'y'} found
            </p>
          </div>
        </div>

        {/* Stories View */}
        <div>
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'list' | 'kanban')}>
            <div className="flex items-center justify-between mb-4">
              <TabsList className="h-9 p-0.5 rounded-[var(--apple-radius-md)] bg-[var(--apple-tertiary-fill)]">
                <TabsTrigger
                  value="list"
                  className="rounded-[10px] text-[13px] data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-[var(--apple-label)] px-4"
                >
                  List
                </TabsTrigger>
                <TabsTrigger
                  value="kanban"
                  className="rounded-[10px] text-[13px] data-[state=active]:bg-background data-[state=active]:shadow-sm px-4"
                >
                  Board
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ── List View ── */}
            <TabsContent value="list" className="mt-0">
              {filteredStories.length === 0 ? (
                <TasksEmptyState
                  icon={<BookOpen className="h-10 w-10" strokeWidth={1.5} />}
                  title="No stories found"
                  description="Create your first user story or adjust filters."
                />
              ) : (
                <div>
                  {filteredStories.map((story) => (
                    <div
                      key={story._id}
                      className="card-fade-in group flex items-start gap-4 p-4 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card mb-2.5 apple-transition hover:shadow-[0_6px_20px_rgba(0,0,0,0.09)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.35)] hover:-translate-y-px cursor-pointer"
                      onClick={() => story.project && router.push(`/stories/${story._id}`)}
                    >
                      {/* Left icon area */}
                      <BookOpen className="h-5 w-5 flex-shrink-0 mt-0.5 text-[var(--apple-chart-to)]" strokeWidth={1.5} />

                      {/* Main content */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Row 1: Title + Badges */}
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="text-[15px] font-semibold text-[var(--apple-label)] truncate flex-1 min-w-0">
                            {story.title}
                          </h3>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <StatusBadge status={story.status} />
                            <PriorityBadge priority={story.priority} />
                          </div>
                        </div>

                        {/* Row 2: Description */}
                        {story.description && (
                          <p className="text-[13px] text-[var(--apple-secondary-label)] line-clamp-1">
                            {story.description}
                          </p>
                        )}

                        {/* Row 3: Meta chips */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          {story.project?.name ? (
                            <MetaChip
                              icon={<Target className="h-3 w-3" strokeWidth={1.5} />}
                              label={story.project.name}
                              title={story.project.name}
                            />
                          ) : (
                            <MetaChip
                              icon={<Target className="h-3 w-3" strokeWidth={1.5} />}
                              label="No project"
                            />
                          )}
                          {story.epic && (() => {
                            const epicName = (story.epic as any).name || (story.epic as any).title || ''
                            return epicName ? (
                              <MetaChip
                                icon={<Layers className="h-3 w-3" strokeWidth={1.5} />}
                                label={epicName}
                                title={epicName}
                              />
                            ) : null
                          })()}
                          {story.sprint && (
                            <MetaChip
                              icon={<Zap className="h-3 w-3" strokeWidth={1.5} />}
                              label={story.sprint.name}
                              title={story.sprint.name}
                            />
                          )}
                          {story.dueDate && (
                            <MetaChip
                              icon={<Calendar className="h-3 w-3" strokeWidth={1.5} />}
                              label={`Due ${formatDate(story.dueDate)}`}
                            />
                          )}
                          {story.storyPoints ? (
                            <MetaChip
                              icon={<BarChart3 className="h-3 w-3" strokeWidth={1.5} />}
                              label={`${story.storyPoints} pts`}
                            />
                          ) : null}
                          {story.estimatedHours ? (
                            <MetaChip
                              icon={<Clock className="h-3 w-3" strokeWidth={1.5} />}
                              label={`${story.estimatedHours}h est.`}
                            />
                          ) : null}
                        </div>

                        {/* Row 4: Acceptance criteria badge */}
                        {story.acceptanceCriteria?.length > 0 && (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium">
                              ✓ {story.acceptanceCriteria.length} criteria
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right: assignee + dropdown */}
                      <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {story.assignedTo && (
                          <div
                            className="text-[12px] text-[var(--apple-secondary-label)] truncate max-w-[100px] hidden sm:block"
                            title={`${story.assignedTo.firstName ?? ''} ${story.assignedTo.lastName ?? ''}`.trim()}
                          >
                            {`${story.assignedTo.firstName ?? ''} ${story.assignedTo.lastName ?? ''}`.trim()}
                          </div>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-[var(--apple-radius-sm)] opacity-0 group-hover:opacity-100 apple-transition">
                              <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[172px] py-2 rounded-md shadow-lg border border-border bg-background z-[10000]">
                            <DropdownMenuItem
                              onClick={e => { e.stopPropagation(); router.push(`/stories/${story._id}`); }}
                              className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
                            >
                              <Eye className="h-4 w-4 mr-2" strokeWidth={1.5} />
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
                                <Edit className="h-4 w-4 mr-2" strokeWidth={1.5} />
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
                                  <Trash2 className="h-4 w-4 mr-2" strokeWidth={1.5} />
                                  <span>Delete Story</span>
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Kanban / Board View ── */}
            <TabsContent value="kanban" className="mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {kanbanStatuses.map((statusKey) => {
                  const columnStories = filteredStories.filter((story) => story.status === statusKey)

                  return (
                    <div
                      key={statusKey}
                      className="flex flex-col rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]/50 min-h-[400px]"
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
                      {/* Column header */}
                      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--apple-separator)]">
                        <StatusBadge status={statusKey} animated={false} />
                        <span className="text-[11px] font-apple-mono text-[var(--apple-tertiary-label)]">
                          {columnStories.length}
                        </span>
                      </div>

                      {/* Cards */}
                      <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                        {columnStories.length === 0 ? (
                          <p className="text-[11px] text-[var(--apple-tertiary-label)] text-center py-6">
                            No stories
                          </p>
                        ) : (
                          columnStories.map((story) => {
                            const isOwner = isCreator(story)
                            const canDragStory = canManageAllStories || isOwner
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
                              <div
                                key={story._id}
                                className={cn(
                                  cardShell, "p-3 space-y-2",
                                  isDraggable ? "cursor-grab hover:shadow-md apple-transition" : "opacity-60 cursor-not-allowed"
                                )}
                                draggable={isDraggable}
                                onDragStart={() => {
                                  if (!isDraggable) return
                                  setDraggedStoryId(story._id)
                                }}
                                onClick={() => router.push(`/stories/${story._id}`)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <h3 className="text-[13px] font-semibold text-[var(--apple-label)] line-clamp-2 flex-1 min-w-0">
                                    {story.title}
                                  </h3>
                                  <GripVertical className="h-4 w-4 text-[var(--apple-tertiary-label)] flex-shrink-0" strokeWidth={1.5} />
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  <PriorityBadge priority={story.priority} />
                                  {story.project?.name && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--apple-separator)] text-[var(--apple-secondary-label)]">
                                      {story.project.name.slice(0, 12)}
                                    </span>
                                  )}
                                </div>
                                {/* Assignee + creator info */}
                                <div className="flex flex-col gap-1">
                                  {assigneeName && (
                                    <span className="text-[11px] text-[var(--apple-secondary-label)] truncate">
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
                                      <div className="w-5 h-5 rounded-full bg-[var(--apple-system-blue)]/80 text-white text-[10px] font-medium flex items-center justify-center flex-shrink-0">
                                        {creatorInitials}
                                      </div>
                                    )}
                                    <span className="text-[11px] text-[var(--apple-tertiary-label)] truncate">
                                      {creatorName}
                                    </span>
                                  </div>
                                </div>
                              </div>
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

          {/* Pagination */}
          {totalCount > 0 && (
            <PaginationBar
              currentPage={currentPage}
              totalPages={Math.ceil(totalCount / pageSize) || 1}
              totalCount={totalCount}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setCurrentPage(1)
              }}
              loading={isFetching}
              className="mt-6"
            />
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
