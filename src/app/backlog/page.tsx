'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { Checkbox } from '@/components/ui/Checkbox'
import { Label } from '@/components/ui/label'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Calendar as DateRangeCalendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import {
  Eye,
  Edit,
  Trash2,
  Plus,
  Search,
  MoreHorizontal,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Target,
  BarChart3,
  List,
  Kanban,
  ArrowUp,
  ArrowDown,
  Star,
  RotateCcw
} from 'lucide-react'
import { format } from 'date-fns'
import { DateRange } from 'react-day-picker'
import { useNotify } from '@/lib/notify'
import { usePermissions } from '@/lib/permissions/permission-hooks'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { extractUserId } from '@/lib/auth/user-utils'

interface UserSummary {
  _id: string
  firstName: string
  lastName: string
  email: string
  hourlyRate?: number
}

interface ProjectSummary {
  _id: string
  name: string
}

interface EpicSummary {
  _id: string
  title: string
}

interface BacklogItem {
  _id: string
  title: string
  displayId: string
  description: string
  type: 'epic' | 'story' | 'task'
  priority: string
  status: string
  project?: ProjectSummary | null
  assignedTo?: UserSummary[]
  createdBy: UserSummary
  storyPoints?: number
  dueDate?: string
  estimatedHours?: number
  labels: string[]
  sprint?: {
    _id: string
    name: string
    status?: string
  }
  epic?: {
    _id: string
    name?: string
    title?: string
  } | string
  createdAt: string
  updatedAt: string
}

interface SprintOption {
  _id: string
  name: string
  status: 'planning' | 'active' | 'completed' | 'cancelled' | string
  startDate?: string
  endDate?: string
  project?: {
    _id: string
    name: string
  } | null
}

const ALLOWED_BACKLOG_STATUSES: string[] = ['backlog', 'todo', 'inprogress', 'review', 'testing', 'done', 'cancelled']

const TASK_STATUS_VALUES = ['backlog', 'todo', 'in_progress', 'review', 'testing', 'done', 'cancelled'] as const
const EPIC_STORY_STATUSES: string[] = ['backlog', 'todo', 'inprogress', 'review', 'testing', 'done', 'cancelled']

function truncateText(value: string, maxLength = 20): string {
  if (!value) {
    return ''
  }

  if (value.length <= maxLength || maxLength < 3) {
    return value
  }

  return `${value.slice(0, maxLength - 1)}…`
}

export default function BacklogPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const { success: notifySuccess, error: notifyError } = useNotify()
  const { formatDate } = useDateTime()
  const { hasPermission } = usePermissions()
  const canManageSprints = hasPermission(Permission.SPRINT_MANAGE)
  const canCreateTask = hasPermission(Permission.TASK_CREATE)
  const [user, setUser] = useState<any>(null)

  // Permission functions for backlog items
  const canEditTask = useCallback((task: BacklogItem) => {
    return hasPermission(Permission.TASK_EDIT_ALL) || task.createdBy._id === user?.id
  }, [hasPermission, user?.id])

  const canDeleteTask = useCallback((task: BacklogItem) => {
    return hasPermission(Permission.TASK_DELETE_ALL) || task.createdBy._id === user?.id
  }, [hasPermission, user?.id])

  const canEditStory = useCallback((story: BacklogItem) => {
    return hasPermission(Permission.STORY_UPDATE, story.project?._id) || story.createdBy._id === user?.id
  }, [hasPermission, user?.id])

  const canDeleteStory = useCallback((story: BacklogItem) => {
    return hasPermission(Permission.STORY_DELETE, story.project?._id) || story.createdBy._id === user?.id
  }, [hasPermission, user?.id])

  const canEditEpic = useCallback((epic: BacklogItem) => {
    return hasPermission(Permission.EPIC_EDIT) || epic.createdBy._id === user?.id
  }, [hasPermission, user?.id])

  const canDeleteEpic = useCallback((epic: BacklogItem) => {
    return hasPermission(Permission.EPIC_DELETE) || epic.createdBy._id === user?.id
  }, [hasPermission, user?.id])

  const [deleteError, setDeleteError] = useState('')
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedForDelete, setSelectedForDelete] = useState<{ id: string; type: BacklogItem['type']; title: string } | null>(null)
  const [authError, setAuthError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('created')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([])
  const [taskIdsForSprint, setTaskIdsForSprint] = useState<string[]>([])
  const [storyIdsForSprint, setStoryIdsForSprint] = useState<string[]>([])
  const [tasksFromStories, setTasksFromStories] = useState<BacklogItem[]>([])
  const [loadingTasksFromStories, setLoadingTasksFromStories] = useState(false)
  const [showSprintModal, setShowSprintModal] = useState(false)
  const [sprints, setSprints] = useState<SprintOption[]>([])
  const [selectedSprintId, setSelectedSprintId] = useState('')
  const [sprintQuery, setSprintQuery] = useState('')
  const [sprintsLoading, setSprintsLoading] = useState(false)
  const [sprintsError, setSprintsError] = useState('')
  const [assigningSprint, setAssigningSprint] = useState(false)
  const [removingSprint, setRemovingSprint] = useState(false)
  const [sprintModalMode, setSprintModalMode] = useState<'assign' | 'manage'>('assign')
  const [currentSprintInfo, setCurrentSprintInfo] = useState<{ _id: string; name: string } | null>(null)
  const [statusChangeModalOpen, setStatusChangeModalOpen] = useState(false)
  const [statusChangeTaskId, setStatusChangeTaskId] = useState<string | null>(null)
  const [statusChangeValue, setStatusChangeValue] = useState<BacklogItem['status']>('backlog')
  const [statusChanging, setStatusChanging] = useState(false)
  const [statusChangeError, setStatusChangeError] = useState('')
  const [projectOptions, setProjectOptions] = useState<ProjectSummary[]>([])
  const [assignedToOptions, setAssignedToOptions] = useState<UserSummary[]>([])
  const [assignedByOptions, setAssignedByOptions] = useState<UserSummary[]>([])
  const [createdByOptions, setCreatedByOptions] = useState<UserSummary[]>([])
  const [epicMap, setEpicMap] = useState<Map<string, { _id: string; title: string }>>(new Map())
  const [projectFilterValue, setProjectFilterValue] = useState('all')
  const [assignedToFilter, setAssignedToFilter] = useState('all')
  const [assignedByFilter, setAssignedByFilter] = useState('all')
  const [createdByFilter, setCreatedByFilter] = useState('all')
  const [createdByFilterQuery, setCreatedByFilterQuery] = useState('')
  const [createdDateRange, setCreatedDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined
  })
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRange | undefined>()
  const [projectFilterQuery, setProjectFilterQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalCount, setTotalCount] = useState(0)
  const [assignedToFilterQuery, setAssignedToFilterQuery] = useState('')
  const [assignedByFilterQuery, setAssignedByFilterQuery] = useState('')
  const [selectedProjectDetails, setSelectedProjectDetails] = useState<any>(null)

  // Dynamic status options based on selected project and type filter
  const availableStatusOptions = useMemo(() => {
    // Priority 1: If a project is selected and has custom kanban statuses, use them
    if (selectedProjectDetails?.settings?.kanbanStatuses && selectedProjectDetails.settings.kanbanStatuses.length > 0) {
      return selectedProjectDetails.settings.kanbanStatuses
        .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
        .map((status: any) => status.key)
    }

    // Priority 2: Use default statuses based on type filter
    if (typeFilter === 'task') {
      return TASK_STATUS_VALUES
    } else {
      return EPIC_STORY_STATUSES
    }
  }, [typeFilter, selectedProjectDetails])

  // Check if any filters are active
  const hasActiveFilters = searchQuery !== '' ||
    typeFilter !== 'all' ||
    priorityFilter !== 'all' ||
    statusFilter !== 'all' ||
    projectFilterValue !== 'all' ||
    assignedToFilter !== 'all' ||
    assignedByFilter !== 'all' ||
    createdByFilter !== 'all' ||
    dateRangeFilter !== undefined ||
    createdDateRange.from !== undefined ||
    createdDateRange.to !== undefined

  // Reset all filters
  const resetFilters = () => {
    setSearchQuery('')
    setDebouncedSearchQuery('')
    setTypeFilter('all')
    setPriorityFilter('all')
    setStatusFilter('all')
    setProjectFilterValue('all')
    setAssignedToFilter('all')
    setAssignedByFilter('all')
    setCreatedByFilter('all')
    setDateRangeFilter(undefined)
    setCreatedDateRange({ from: undefined, to: undefined })
    setProjectFilterQuery('')
    setAssignedToFilterQuery('')
    setAssignedByFilterQuery('')
    setCreatedByFilterQuery('')
  }

  // Reset status filter if current value is not valid for the new context
  useEffect(() => {
    if (statusFilter !== 'all' && !availableStatusOptions.includes(statusFilter as any)) {
      setStatusFilter('all')
    }
  }, [availableStatusOptions, statusFilter])

  // Fetch project details when project filter changes
  useEffect(() => {
    const fetchProjectDetails = async () => {
      if (projectFilterValue === 'all' || !projectFilterValue) {
        setSelectedProjectDetails(null)
        return
      }

      try {
        const response = await fetch(`/api/projects/${projectFilterValue}`)
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setSelectedProjectDetails(data.data)
          }
        }
      } catch (error) {
        console.error('Failed to fetch project details:', error)
        setSelectedProjectDetails(null)
      }
    }

    fetchProjectDetails()
  }, [projectFilterValue])

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')

      if (response.ok) {
        const data = await response.json()
        const userId = extractUserId(data)
        if (userId) setUser({ id: userId.toString() })
        setAuthError('')
        await fetchBacklogItems()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json()
          const userId = extractUserId(refreshData)
          if (userId) setUser({ id: userId.toString() })
          setAuthError('')
          await fetchBacklogItems()
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

  // Debounce search query to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300) // 300ms delay

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch when pagination or filters change (after initial load)
  useEffect(() => {
    if (!loading && !authError) {
      if (currentPage === 1) {
        fetchBacklogItems()
      } else {
        setCurrentPage(1)
      }
    }
  }, [debouncedSearchQuery, typeFilter, priorityFilter, statusFilter, projectFilterValue, assignedToFilter, assignedByFilter, createdByFilter, dateRangeFilter, createdDateRange, sortBy, sortOrder])

  // Fetch when pagination changes
  useEffect(() => {
    if (!loading && !authError) {
      fetchBacklogItems()
    }
  }, [currentPage, pageSize])

  useEffect(() => {
    const successParam = searchParams?.get('success')
    if (successParam === 'story-created') {
      notifySuccess({ title: 'Success', message: 'User story created successfully.' })
    }
  }, [searchParams, notifySuccess])

  const fetchBacklogItems = async () => {
    try {
      // Only show full loading state on initial load
      if (isInitialLoad) {
        setLoading(true)
      } else {
        setSearching(true)
      }
      const params = new URLSearchParams()
      params.set('page', currentPage.toString())
      params.set('limit', pageSize.toString())

      // Add filters to API call - use debounced search query
      if (debouncedSearchQuery) params.set('search', debouncedSearchQuery)
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (priorityFilter !== 'all') params.set('priority', priorityFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (projectFilterValue !== 'all') params.set('project', projectFilterValue)
      if (assignedToFilter !== 'all') params.set('assignedTo', assignedToFilter)
      if (assignedByFilter !== 'all') params.set('assignedBy', assignedByFilter)
      if (createdByFilter !== 'all') params.set('createdBy', createdByFilter)
      if (dateRangeFilter?.from) params.set('dueDateFrom', dateRangeFilter.from.toISOString())
      if (dateRangeFilter?.to) params.set('dueDateTo', dateRangeFilter.to.toISOString())
      if (createdDateRange.from) params.set('createdAtFrom', createdDateRange.from.toISOString())
      if (createdDateRange.to) params.set('createdAtTo', createdDateRange.to.toISOString())
      params.set('sortBy', sortBy)
      params.set('sortOrder', sortOrder)

      const response = await fetch(`/api/backlog?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        const rawItems = Array.isArray(data.data) ? data.data : []
        const normalized = rawItems.map((item: any) => ({
          ...item,
          labels: Array.isArray(item.labels) ? item.labels : []
        })) as BacklogItem[]
        setBacklogItems(normalized)
        setTotalCount(data.pagination?.total || normalized.length)

        const projectMap = new Map<string, ProjectSummary>()
        const assignedToMap = new Map<string, UserSummary>()
        const createdByMap = new Map<string, UserSummary>()
        const epicMap = new Map<string, EpicSummary>()

        // Collect unique epic IDs to fetch
        const epicIdsToFetch = new Set<string>()

        normalized.forEach((item) => {
          if (item.project?._id) {
            projectMap.set(item.project._id, {
              _id: item.project._id,
              name: item.project.name
            })
          }
          if (item.assignedTo && Array.isArray(item.assignedTo)) {
            item.assignedTo.forEach((user) => {
              if (user._id) {
                assignedToMap.set(user._id, {
                  _id: user._id,
                  firstName: user.firstName,
                  lastName: user.lastName,
                  email: user.email
                })
              }
            })
          }
          if (item.createdBy?._id) {
            createdByMap.set(item.createdBy._id, {
              _id: item.createdBy._id,
              firstName: item.createdBy.firstName,
              lastName: item.createdBy.lastName,
              email: item.createdBy.email
            })
          }
          // Collect epic IDs
          if (item.epic && typeof item.epic === 'string') {
            epicIdsToFetch.add(item.epic)
          }
        })

        // Fetch epic data if there are epics to fetch
        if (epicIdsToFetch.size > 0) {
          try {
            const epicIds = Array.from(epicIdsToFetch)
            const response = await fetch(`/api/epics?ids=${epicIds.join(',')}`)
            if (response.ok) {
              const epicData = await response.json()
              // Handle both array response (for general queries) and object response (for ID queries)
              if (Array.isArray(epicData)) {
                epicData.forEach((epic: any) => {
                  if (epic._id && epic.title) {
                    epicMap.set(epic._id, {
                      _id: epic._id,
                      title: epic.title
                    })
                  }
                })
              } else if (typeof epicData === 'object' && epicData !== null) {
                // Handle object response when fetching by IDs
                Object.values(epicData).forEach((epic: any) => {
                  if (epic._id && epic.title) {
                    epicMap.set(epic._id, {
                      _id: epic._id,
                      title: epic.title
                    })
                  }
                })
              }
            }
          } catch (error) {
            console.warn('Failed to fetch epic data:', error)
          }
        }

        setProjectOptions(Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name)))

        // Fetch unique project team members for assignedTo filter
        const teamMembersMap = new Map<string, UserSummary>()
        try {
          const projectsResponse = await fetch('/api/projects?limit=1000')
          if (projectsResponse.ok) {
            const projectsData = await projectsResponse.json()
            if (projectsData.success && Array.isArray(projectsData.data)) {
              projectsData.data.forEach((project: any) => {
                if (Array.isArray(project.teamMembers)) {
                  project.teamMembers.forEach((member: any) => {
                    const memberId = member.memberId?._id || member.memberId
                    const firstName = member.memberId?.firstName || member.firstName
                    const lastName = member.memberId?.lastName || member.lastName
                    const email = member.memberId?.email || member.email

                    if (memberId && firstName && lastName) {
                      teamMembersMap.set(memberId, {
                        _id: memberId,
                        firstName,
                        lastName,
                        email: email || ''
                      })
                    }
                  })
                }
              })
            }
          }
        } catch (error) {
          console.warn('Failed to fetch project team members:', error)
        }

        setAssignedToOptions(Array.from(teamMembersMap.values()).sort((a, b) =>
          `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
        ))
        setAssignedByOptions(Array.from(createdByMap.values()).sort((a, b) =>
          `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
        ))
        setCreatedByOptions(Array.from(createdByMap.values()).sort((a, b) =>
          `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
        ))
        setEpicMap(epicMap)
      } else {
        notifyError({ title: 'Error', message: data.error || 'Failed to fetch backlog items' })
      }
    } catch (err) {
      notifyError({ title: 'Error', message: 'Failed to fetch backlog items' })
    } finally {
      if (isInitialLoad) {
        setLoading(false)
        setIsInitialLoad(false)
      } else {
        setSearching(false)
      }
    }
  }

  const handleSelectModeToggle = () => {
    setSelectMode((prev) => {
      if (prev) {
        setSelectedTaskIds([])
      }
      return !prev
    })
  }

  const setTaskSelected = (taskId: string, shouldSelect: boolean) => {
    // Prevent selecting tasks that are already in a sprint
    if (shouldSelect) {
      const task = backlogItems.find(item => item.type === 'task' && item._id === taskId)
      if (task && task.sprint) {
        return // Don't allow selection if task is already in a sprint
      }
    }
    setSelectedTaskIds((prev) => {
      if (shouldSelect) {
        if (prev.includes(taskId)) {
          return prev
        }
        return [...prev, taskId]
      }
      return prev.filter((id) => id !== taskId)
    })
  }

  const setStorySelected = (storyId: string, shouldSelect: boolean) => {
    // Prevent selecting stories that are already in a sprint
    if (shouldSelect) {
      const story = backlogItems.find(item => item.type === 'story' && item._id === storyId)
      if (story && story.sprint) {
        return // Don't allow selection if story is already in a sprint
      }
    }
    setSelectedStoryIds((prev) => {
      if (shouldSelect) {
        if (prev.includes(storyId)) {
          return prev
        }
        return [...prev, storyId]
      }
      return prev.filter((id) => id !== storyId)
    })
  }

  const clearSelection = () => {
    setSelectedTaskIds([])
    setSelectedStoryIds([])
  }

  const clearSprintSelection = () => {
    setSelectedSprintId('')
    setSprintQuery('')
    setSprintsError('')
  }

  const clearDateFilters = () => {
    setDateRangeFilter(undefined)
  }

  const handleCreatedDateChange = (type: 'from' | 'to', date: Date | undefined) => {
    setCreatedDateRange((prev) => ({
      ...prev,
      [type]: date
    }))
  }

  const resetSprintModalState = () => {
    clearSprintSelection()
    setTaskIdsForSprint([])
    setStoryIdsForSprint([])
    setTasksFromStories([])
    setSprintModalMode('assign')
    setCurrentSprintInfo(null)
  }

  const handleCloseSprintModal = () => {
    if (assigningSprint || removingSprint) return
    setShowSprintModal(false)
    resetSprintModalState()
  }

  const fetchTasksForStories = async (storyIds: string[]) => {
    if (storyIds.length === 0) {
      setTasksFromStories([])
      return
    }

    setLoadingTasksFromStories(true)
    try {
      // Get story titles for display
      const storyMap = new Map<string, string>()

      for (const storyId of storyIds) {
        try {
          const storyResponse = await fetch(`/api/stories/${storyId}`)
          const storyData = await storyResponse.json()
          const storyTitle = storyData.success && storyData.data ? storyData.data.title : 'Unknown Story'
          storyMap.set(storyId, storyTitle)
        } catch (err) {
          console.error(`Failed to fetch story ${storyId}:`, err)
          storyMap.set(storyId, 'Unknown Story')
        }
      }

      // Filter tasks from backlogItems where task.story matches the selected story IDs
      // The story field in tasks can be either:
      // - A string (ID) - when not populated
      // - An object with _id property - when populated
      // - An object with _id as ObjectId - when populated from MongoDB
      const tasksFromStoriesList: BacklogItem[] = []

      backlogItems.forEach((item) => {
        if (item.type !== 'task') return

        // Check if this task belongs to any of the selected stories
        let taskStoryId: string | null = null

        // Access story field from the item (it may not be in the TypeScript interface but exists in runtime)
        const taskStory = (item as any).story

        // Handle different formats of story field
        if (taskStory) {
          if (typeof taskStory === 'string') {
            // Story is a string ID
            taskStoryId = taskStory
          } else if (typeof taskStory === 'object') {
            // Story is populated - could be { _id: string } or { _id: ObjectId }
            if (taskStory._id) {
              taskStoryId = typeof taskStory._id === 'string'
                ? taskStory._id
                : taskStory._id.toString()
            } else if (taskStory.toString) {
              // Might be a Mongoose ObjectId directly
              taskStoryId = taskStory.toString()
            }
          }
        }

        // Check if task's story ID matches any selected story ID
        // Normalize both IDs to strings for comparison
        if (taskStoryId) {
          const normalizedTaskStoryId = taskStoryId.toString()
          const matchesStory = storyIds.some(storyId => {
            const normalizedStoryId = storyId.toString()
            return normalizedTaskStoryId === normalizedStoryId
          })

          if (matchesStory) {
            // Find which story this task belongs to
            const matchedStoryId = storyIds.find(storyId =>
              storyId.toString() === normalizedTaskStoryId
            )
            const storyTitle = matchedStoryId ? storyMap.get(matchedStoryId) || 'Unknown Story' : 'Unknown Story'

            tasksFromStoriesList.push({
              ...item,
              // Store story info for display
              _sourceStoryId: normalizedTaskStoryId,
              _sourceStoryTitle: storyTitle
            } as any)
          }
        }
      })

      // Remove duplicates based on _id
      const uniqueTasks = Array.from(
        new Map(tasksFromStoriesList.map(task => [task._id, task])).values()
      )

      setTasksFromStories(uniqueTasks)
    } catch (error) {
      console.error('Failed to fetch tasks for stories:', error)
      setTasksFromStories([])
    } finally {
      setLoadingTasksFromStories(false)
    }
  }

  const handleOpenSprintModal = async (
    taskIds: string[],
    storyIds: string[] = [],
    options?: {
      mode?: 'assign' | 'manage'
      existingSprint?: { _id: string; name: string }
    }
  ) => {
    const mode = options?.mode ?? 'assign'
    const isManageMode = mode === 'manage'

    const sourceTaskIds = isManageMode
      ? taskIds
      : taskIds.filter((taskId) => {
        const task = backlogItems.find((item) => item.type === 'task' && item._id === taskId)
        return task && !task.sprint
      })

    const sourceStoryIds = isManageMode
      ? storyIds
      : storyIds.filter((storyId) => {
        const story = backlogItems.find((item) => item.type === 'story' && item._id === storyId)
        return story && !story.sprint
      })

    const uniqueTaskIds = Array.from(new Set(sourceTaskIds.filter(Boolean)))
    const uniqueStoryIds = Array.from(new Set(sourceStoryIds.filter(Boolean)))

    if (!isManageMode && uniqueTaskIds.length === 0 && uniqueStoryIds.length === 0) {
      if (taskIds.length > 0 || storyIds.length > 0) {
        setSprintsError('Selected items are already in a sprint and cannot be added to another sprint.')
      }
      return
    }

    if (isManageMode && uniqueTaskIds.length === 0 && uniqueStoryIds.length === 0) {
      setSprintsError('Unable to manage sprint because the selected items are not currently in a sprint.')
      return
    }

    setTaskIdsForSprint(uniqueTaskIds)
    setStoryIdsForSprint(uniqueStoryIds)
    clearSprintSelection()
    setSprintModalMode(mode)
    setCurrentSprintInfo(options?.existingSprint ?? null)
    if (isManageMode && options?.existingSprint?._id) {
      setSelectedSprintId(options.existingSprint._id)
    }

    // Fetch tasks for selected stories
    if (uniqueStoryIds.length > 0) {
      await fetchTasksForStories(uniqueStoryIds)
    } else {
      setTasksFromStories([])
    }

    setShowSprintModal(true)
  }

  const fetchAvailableSprints = useCallback(async () => {
    setSprintsLoading(true)
    setSprintsError('')
    try {
      const response = await fetch('/api/sprints?limit=200')
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load sprints')
      }

      const sprintList: SprintOption[] = Array.isArray(data.data)
        ? data.data
        : Array.isArray(data.sprints)
          ? data.sprints
          : []

      const filtered = sprintList.filter(
        (sprint) => sprint && ['planning', 'active'].includes(sprint.status)
      )

      setSprints(filtered)
    } catch (fetchError) {
      console.error('Failed to load sprints:', fetchError)
      setSprintsError('Failed to load sprints. Please try again.')
      setSprints([])
    } finally {
      setSprintsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (showSprintModal) {
      fetchAvailableSprints()
    }
  }, [showSprintModal, fetchAvailableSprints])

  useEffect(() => {
    // Remove tasks and stories that are already in a sprint from selection
    setSelectedTaskIds((prev) => {
      const validIds = prev.filter((id) => {
        const item = backlogItems.find((item) => item._id === id && item.type === 'task')
        return item && !item.sprint // Only keep tasks that are not in a sprint
      })
      return validIds.length === prev.length ? prev : validIds
    })
    setSelectedStoryIds((prev) => {
      const validIds = prev.filter((id) => {
        const item = backlogItems.find((item) => item._id === id && item.type === 'story')
        return item && !item.sprint // Only keep stories that are not in a sprint
      })
      return validIds.length === prev.length ? prev : validIds
    })
  }, [backlogItems])

  useEffect(() => {
    if (projectFilterValue !== 'all' && !projectOptions.some((project) => project._id === projectFilterValue)) {
      setProjectFilterValue('all')
    }
    if (assignedToFilter !== 'all' && !assignedToOptions.some((member) => member._id === assignedToFilter)) {
      setAssignedToFilter('all')
    }
    if (assignedByFilter !== 'all' && !assignedByOptions.some((member) => member._id === assignedByFilter)) {
      setAssignedByFilter('all')
    }
  }, [projectOptions, assignedToOptions, assignedByOptions, projectFilterValue, assignedToFilter, assignedByFilter])

  const selectedTaskCount = selectedTaskIds.length
  const selectedStoryCount = selectedStoryIds.length

  // Get all tasks that will be added to sprint:
  // 1. Directly selected tasks (from backlogItems)
  // 2. Tasks from selected stories
  const allTasksForSprint = useMemo(() => {
    // Get directly selected tasks from backlogItems
    const directTasks = backlogItems
      .filter((item) => item.type === 'task' && taskIdsForSprint.includes(item._id))
      .map(task => ({
        ...task,
        _isDirectlySelected: true,
        _sourceStoryId: undefined,
        _sourceStoryTitle: undefined
      }))

    // Mark tasks from stories
    const tasksFromStoriesMarked = tasksFromStories.map(task => ({
      ...task,
      _isDirectlySelected: false
    }))

    // Combine all tasks
    const allTasks = [...directTasks, ...tasksFromStoriesMarked]

    // Remove duplicates based on _id, prioritizing directly selected tasks
    const taskMap = new Map<string, typeof directTasks[0] | typeof tasksFromStoriesMarked[0]>()

    // First add tasks from stories
    tasksFromStoriesMarked.forEach(task => {
      if (!taskMap.has(task._id)) {
        taskMap.set(task._id, task)
      }
    })

    // Then add directly selected tasks (they will overwrite if duplicate, which is correct)
    directTasks.forEach(task => {
      taskMap.set(task._id, task)
    })

    return Array.from(taskMap.values())
  }, [backlogItems, taskIdsForSprint, tasksFromStories])

  // Get selected stories for display
  const storiesForSprint = useMemo(
    () =>
      backlogItems.filter(
        (item) => item.type === 'story' && storyIdsForSprint.includes(item._id)
      ),
    [backlogItems, storyIdsForSprint]
  )

  const filteredSprints = useMemo(() => {
    const query = sprintQuery.trim().toLowerCase()

    // Get projects from selected tasks and stories
    const selectedItems = backlogItems.filter(item =>
      (item.type === 'task' && selectedTaskIds.includes(item._id)) ||
      (item.type === 'story' && selectedStoryIds.includes(item._id))
    )
    const selectedProjectIds = selectedItems.map(item => item.project?._id).filter(Boolean)

    // Filter sprints by selected items' projects
    let filtered = selectedProjectIds.length > 0
      ? sprints.filter(sprint => selectedProjectIds.includes(sprint.project?._id ?? ''))
      : sprints

    // Apply search filter
    if (query) {
      filtered = filtered.filter((sprint) => {
        const nameMatch = sprint.name.toLowerCase().includes(query)
        const projectMatch = sprint.project?.name?.toLowerCase().includes(query)
        return nameMatch || projectMatch
      })
    }

    return filtered
  }, [sprints, sprintQuery, selectedTaskIds, selectedStoryIds, backlogItems])

  const filteredProjectOptions = useMemo(() => {
    const query = projectFilterQuery.trim().toLowerCase()
    if (!query) return projectOptions
    return projectOptions.filter((project) => project.name.toLowerCase().includes(query))
  }, [projectOptions, projectFilterQuery])

  const filteredAssignedToOptions = useMemo(() => {
    const query = assignedToFilterQuery.trim().toLowerCase()
    if (!query) return assignedToOptions
    return assignedToOptions.filter((member) =>
      `${member.firstName} ${member.lastName}`.toLowerCase().includes(query) ||
      member.email.toLowerCase().includes(query)
    )
  }, [assignedToOptions, assignedToFilterQuery])

  const filteredAssignedByOptions = useMemo(() => {
    const query = assignedByFilterQuery.trim().toLowerCase()
    if (!query) return assignedByOptions
    return assignedByOptions.filter((member) =>
      `${member.firstName} ${member.lastName}`.toLowerCase().includes(query) ||
      member.email.toLowerCase().includes(query)
    )
  }, [assignedByOptions, assignedByFilterQuery])

  const filteredCreatedByOptions = useMemo(() => {
    const query = createdByFilterQuery.trim().toLowerCase()
    if (!query) return createdByOptions
    return createdByOptions.filter((member) =>
      `${member.firstName} ${member.lastName}`.toLowerCase().includes(query) ||
      member.email.toLowerCase().includes(query)
    )
  }, [createdByOptions, createdByFilterQuery])

  const sprintModalTitle =
    sprintModalMode === 'manage'
      ? allTasksForSprint.length > 1
        ? `Manage Sprint for ${allTasksForSprint.length} Tasks`
        : 'Manage Sprint Assignment'
      : (() => {
        const hasStories = storiesForSprint.length > 0
        const hasTasks = taskIdsForSprint.length > 0
        const totalItems = storiesForSprint.length + taskIdsForSprint.length

        if (hasStories && hasTasks) {
          return `Add ${storiesForSprint.length} Story${storiesForSprint.length !== 1 ? 'ies' : ''} and ${taskIdsForSprint.length} Task${taskIdsForSprint.length !== 1 ? 's' : ''} to Sprint`
        } else if (hasStories) {
          return storiesForSprint.length > 1
            ? `Add ${storiesForSprint.length} Stories to Sprint`
            : 'Add Story to Sprint'
        } else {
          return taskIdsForSprint.length > 1
            ? `Add ${taskIdsForSprint.length} Tasks to Sprint`
            : 'Add Task to Sprint'
        }
      })()

  const sprintModalDescription =
    sprintModalMode === 'manage'
      ? 'Change the sprint or remove it from this task.'
      : storiesForSprint.length > 0
        ? `Select a sprint to add the selected ${storiesForSprint.length > 0 ? `${storiesForSprint.length} story${storiesForSprint.length !== 1 ? 'ies' : ''} and all their related tasks` : ''}${taskIdsForSprint.length > 0 ? `${storiesForSprint.length > 0 ? ', plus' : ''} ${taskIdsForSprint.length} task${taskIdsForSprint.length !== 1 ? 's' : ''}` : ''} to. Only planning and active sprints are available.`
        : 'Select a sprint to move the selected task(s) into. Only planning and active sprints are available.'

  const handleSprintAssignment = async () => {
    if (!selectedSprintId) {
      setSprintsError('Please select a sprint.')
      return
    }

    if (
      sprintModalMode === 'manage' &&
      currentSprintInfo &&
      selectedSprintId === currentSprintInfo._id
    ) {
      setSprintsError('Task is already assigned to this sprint. Choose a different sprint.')
      return
    }

    const sprint = sprints.find((item) => item._id === selectedSprintId)
    if (!sprint) {
      setSprintsError('Selected sprint is no longer available.')
      return
    }

    setAssigningSprint(true)
    setSprintsError('')

    try {
      // Get all task IDs to add (directly selected + from stories)
      const allTaskIdsToAdd = [
        ...taskIdsForSprint,
        ...tasksFromStories.map(task => task._id)
      ]
      const uniqueTaskIds = Array.from(new Set(allTaskIdsToAdd))

      // First, add stories to sprint
      const storyResults = await Promise.all(
        storyIdsForSprint.map(async (storyId) => {
          const response = await fetch(`/api/stories/${storyId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sprint: selectedSprintId,
              status: 'in_progress'  // Set story to in_progress when added to sprint
            })
          })

          let body: any = null
          try {
            body = await response.json()
          } catch {
            // Ignore JSON parse errors
          }

          return {
            storyId,
            ok: response.ok && body?.success,
            body
          }
        })
      )

      const failedStories = storyResults.filter((result) => !result.ok)
      if (failedStories.length > 0) {
        console.error('Failed to assign some stories to sprint:', failedStories)
        setSprintsError('Failed to add one or more stories to the sprint. Please try again.')
        return
      }

      // Then, add all tasks to sprint
      const taskResults = await Promise.all(
        uniqueTaskIds.map(async (taskId) => {
          const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sprint: selectedSprintId,
              status: 'todo'
            })
          })

          let body: any = null
          try {
            body = await response.json()
          } catch {
            // Ignore JSON parse errors (non-JSON response)
          }

          return {
            taskId,
            ok: response.ok && body?.success,
            body
          }
        })
      )

      const failedTasks = taskResults.filter((result) => !result.ok)
      if (failedTasks.length > 0) {
        console.error('Failed to assign some tasks to sprint:', failedTasks)
        setSprintsError('Failed to add one or more tasks to the sprint. Please try again.')
        return
      }

      // Update backlog items state
      setBacklogItems((prev) =>
        prev.map((item) => {
          // Update stories
          if (item.type === 'story' && storyIdsForSprint.includes(item._id)) {
            return {
              ...item,
              sprint: {
                _id: sprint._id,
                name: sprint.name,
                status: sprint.status
              },
              status: 'in_progress'  // Match API update
            }
          }
          // Update tasks
          if (item.type === 'task' && uniqueTaskIds.includes(item._id)) {
            return {
              ...item,
              sprint: {
                _id: sprint._id,
                name: sprint.name,
                status: sprint.status
              },
              status: 'todo'  // Match API update
            }
          }
          return item
        })
      )

      // Build success message
      const parts: string[] = []
      if (storiesForSprint.length > 0) {
        parts.push(`${storiesForSprint.length} story${storiesForSprint.length !== 1 ? 'ies' : ''}`)
      }
      if (uniqueTaskIds.length > 0) {
        parts.push(`${uniqueTaskIds.length} task${uniqueTaskIds.length !== 1 ? 's' : ''}`)
      }
      const message = `${parts.join(' and ')} assigned to ${sprint.name} successfully.`

      notifySuccess({ title: 'Success', message: message })

      setShowSprintModal(false)
      resetSprintModalState()
      setSelectedTaskIds([])
      setSelectedStoryIds([])
      setSelectMode(false)
    } catch (error) {
      console.error('Failed to assign items to sprint:', error)
      setSprintsError('Failed to add items to sprint. Please try again.')
    } finally {
      setAssigningSprint(false)
    }
  }

  const handleRemoveFromSprint = async () => {
    if (!currentSprintInfo) {
      return
    }

    setRemovingSprint(true)
    setSprintsError('')

    try {
      // Remove stories from sprint
      const storyResults = await Promise.all(
        storyIdsForSprint.map(async (storyId) => {
          const response = await fetch(`/api/stories/${storyId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sprint: null
            })
          })

          let body: any = null
          try {
            body = await response.json()
          } catch {
            // Ignore JSON parse errors
          }

          return {
            storyId,
            ok: response.ok && body?.success,
            body
          }
        })
      )

      const failedStories = storyResults.filter((result) => !result.ok)
      if (failedStories.length > 0) {
        console.error('Failed to remove sprint from some stories:', failedStories)
        setSprintsError('Failed to remove sprint from one or more stories. Please try again.')
        return
      }

      // Remove tasks from sprint
      const taskResults = await Promise.all(
        taskIdsForSprint.map(async (taskId) => {
          const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sprint: null,
              status: 'backlog'
            })
          })

          let body: any = null
          try {
            body = await response.json()
          } catch {
            // Ignore JSON parse errors
          }

          return {
            taskId,
            ok: response.ok && body?.success,
            body
          }
        })
      )

      const failedTasks = taskResults.filter((result) => !result.ok)
      if (failedTasks.length > 0) {
        console.error('Failed to remove sprint from some tasks:', failedTasks)
        setSprintsError('Failed to remove sprint from one or more tasks. Please try again.')
        return
      }

      // Update backlog items state
      setBacklogItems((prev) =>
        prev.map((item) => {
          // Remove sprint from stories
          if (item.type === 'story' && storyIdsForSprint.includes(item._id)) {
            return {
              ...item,
              sprint: undefined
            }
          }
          // Remove sprint from tasks
          if (item.type === 'task' && taskIdsForSprint.includes(item._id)) {
            return {
              ...item,
              sprint: undefined,
              status: 'backlog',
              backlogStatus: 'backlog'
            }
          }
          return item
        })
      )

      // Build success message
      const parts: string[] = []
      if (storyIdsForSprint.length > 0) {
        parts.push(`${storyIdsForSprint.length} story${storyIdsForSprint.length !== 1 ? 'ies' : ''}`)
      }
      if (taskIdsForSprint.length > 0) {
        parts.push(`${taskIdsForSprint.length} task${taskIdsForSprint.length !== 1 ? 's' : ''}`)
      }
      const message = `${parts.join(' and ')} removed from sprint successfully.`

      notifySuccess({ title: 'Success', message: message })

      setShowSprintModal(false)
      resetSprintModalState()
      setSelectedTaskIds([])
      setSelectedStoryIds([])
      setSelectMode(false)
    } catch (error) {
      console.error('Failed to remove items from sprint:', error)
      setSprintsError('Failed to remove sprint from the items. Please try again.')
    } finally {
      setRemovingSprint(false)
    }
  }

  const handleDeleteClick = (item: BacklogItem) => {
    setSelectedForDelete({ id: item._id, type: item.type, title: item.title })
    setShowDeleteConfirmModal(true)
  }

  const handleDeleteItem = async () => {
    if (!selectedForDelete) return
    setDeleting(true)
    setDeleteError('')
    try {
      let endpoint = ''
      if (selectedForDelete.type === 'task') endpoint = `/api/tasks/${selectedForDelete.id}`
      else if (selectedForDelete.type === 'story') endpoint = `/api/stories/${selectedForDelete.id}`
      else if (selectedForDelete.type === 'epic') endpoint = `/api/epics/${selectedForDelete.id}`

      const res = await fetch(endpoint, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.success) {
        setBacklogItems(prev => prev.filter(x => x._id !== selectedForDelete.id))
        notifySuccess({ title: 'Success', message: `${selectedForDelete.type.charAt(0).toUpperCase() + selectedForDelete.type.slice(1)} deleted successfully.` })
        setShowDeleteConfirmModal(false)
        setSelectedForDelete(null)
      } else {
        setDeleteError(data.error || 'Failed to delete item')
        setShowDeleteConfirmModal(false)
      }
    } catch (e) {
      setDeleteError('Failed to delete item')
      setShowDeleteConfirmModal(false)
    } finally {
      setDeleting(false)
    }
  }

  const openStatusChangeModal = (item: BacklogItem) => {
    if (item.type !== 'task') return
    setStatusChangeTaskId(item._id)
    setStatusChangeValue(item.status || 'backlog')
    setStatusChangeError('')
    setStatusChangeModalOpen(true)
  }

  const closeStatusChangeModal = () => {
    if (statusChanging) return
    setStatusChangeModalOpen(false)
    setStatusChangeTaskId(null)
    setStatusChangeError('')
  }

  const handleStatusChange = async () => {
    if (!statusChangeTaskId) return

    setStatusChanging(true)
    setStatusChangeError('')

    try {
      const response = await fetch(`/api/tasks/${statusChangeTaskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: statusChangeValue
        })
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update task status.')
      }

      setBacklogItems((prev) =>
        prev.map((item) =>
          item._id === statusChangeTaskId
            ? {
              ...item,
              status: statusChangeValue,
              sprint: statusChangeValue === 'sprint' ? item.sprint : statusChangeValue === 'backlog' ? undefined : item.sprint
            }
            : item
        )
      )

      notifySuccess({ title: 'Success', message: 'Task status updated successfully.' })
      closeStatusChangeModal()
    } catch (error) {
      console.error('Failed to change task status:', error)
      setStatusChangeError(error instanceof Error ? error.message : 'Failed to update task status.')
    } finally {
      setStatusChanging(false)
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'epic': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900'
      case 'story': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'task': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'medium': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'backlog': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'todo': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'sprint': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'in_progress': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900'
      case 'review': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900'
      case 'testing': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900'
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  // When assigning work to a sprint, temporarily narrow items to the sprint's project
  const displayedItems = useMemo(() => {
    let items = backlogItems
    if (selectedSprintId) {
      const selectedSprint = sprints.find((s) => s._id === selectedSprintId)
      if (selectedSprint?.project?._id) {
        items = items.filter((item) => item.project?._id === selectedSprint.project?._id)
      }
    }
    return items
  }, [backlogItems, selectedSprintId, sprints])

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize) || 1)
  const pageStartIndex = totalCount === 0 ? 0 : ((currentPage - 1) * pageSize) + 1
  const pageEndIndex = totalCount === 0 ? 0 : Math.min(currentPage * pageSize, totalCount)

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading backlog...</p>
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
      <div className="space-y-8 sm:space-y-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Product Backlog</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Manage your product backlog and sprint planning</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setDebouncedSearchQuery('');
                fetchBacklogItems();
              }}
              disabled={loading}
              className="w-full sm:w-auto"
              title="Refresh backlog items"
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
            <PermissionGate permission={Permission.EPIC_CREATE}>
              <Button variant="outline" onClick={() => router.push('/epics/create-epic')} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                New Epic
              </Button>
            </PermissionGate>
            <PermissionGate permission={Permission.STORY_CREATE}>
              <Button variant="outline" onClick={() => router.push('/stories/create-story')} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                New Story
              </Button>
            </PermissionGate>
            {canCreateTask && (
              <Button onClick={() => router.push('/tasks/create-new-task')} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                New Task
              </Button>
            )}
          </div>
        </div>


        <Card>
          <CardHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Backlog Items</CardTitle>
                  <CardDescription>
                    {totalCount} item{totalCount !== 1 ? 's' : ''} found
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Search backlog..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
                  <Select value={projectFilterValue} onValueChange={setProjectFilterValue}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue placeholder="Project" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                      <div className="p-2">
                        <Input
                          value={projectFilterQuery}
                          onChange={(e) => {
                            e.stopPropagation()
                            setProjectFilterQuery(e.target.value)
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Search projects"
                          className="mb-2"
                        />
                        <div className="max-h-56 overflow-y-auto">
                          <SelectItem value="all">All Projects</SelectItem>
                          {filteredProjectOptions.length === 0 ? (
                            <div className="px-2 py-1 text-xs text-muted-foreground">No matching projects</div>
                          ) : (
                            filteredProjectOptions.map((project) => (
                              <SelectItem key={project._id} value={project._id}>
                                {project.name}
                              </SelectItem>
                            ))
                          )}
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="epic">Epics</SelectItem>
                      <SelectItem value="story">Stories</SelectItem>
                      <SelectItem value="task">Tasks</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      {availableStatusOptions.map((status: string) => (
                        <SelectItem key={status} value={status}>
                          {formatToTitleCase(status.replace('_', ' '))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priority</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={assignedToFilter} onValueChange={(value) => { setAssignedToFilter(value); setAssignedToFilterQuery(''); }}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Assignee" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                      <div className="p-2">
                        <Input
                          value={assignedToFilterQuery}
                          onChange={(e) => {
                            e.stopPropagation()
                            setAssignedToFilterQuery(e.target.value)
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Search assignees"
                          className="mb-2"
                        />
                        <div className="max-h-56 overflow-y-auto">
                          <SelectItem value="all">All Assignees</SelectItem>
                          {filteredAssignedToOptions.length === 0 ? (
                            <div className="px-2 py-1 text-xs text-muted-foreground">No matching members</div>
                          ) : (
                            filteredAssignedToOptions.map((member) => (
                              <SelectItem key={member._id} value={member._id}>
                                {member.firstName} {member.lastName}
                              </SelectItem>
                            ))
                          )}
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                  <Select value={createdByFilter} onValueChange={setCreatedByFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Creator" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                      <div className="p-2">
                        <Input
                          value={createdByFilterQuery}
                          onChange={(e) => {
                            e.stopPropagation()
                            setCreatedByFilterQuery(e.target.value)
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Search creators"
                          className="mb-2"
                        />
                        <div className="max-h-56 overflow-y-auto">
                          <SelectItem value="all">All Creators</SelectItem>
                          {filteredCreatedByOptions.length === 0 ? (
                            <div className="px-2 py-1 text-xs text-muted-foreground">No matching members</div>
                          ) : (
                            filteredCreatedByOptions.map((member) => (
                              <SelectItem key={member._id} value={member._id}>
                                {member.firstName} {member.lastName}
                              </SelectItem>
                            ))
                          )}
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priority">Priority</SelectItem>
                      <SelectItem value="title">Title</SelectItem>
                      <SelectItem value="created">Created</SelectItem>
                      <SelectItem value="dueDate">Due Date</SelectItem>
                    </SelectContent>
                  </Select>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                          className="w-full sm:w-auto"
                          aria-label={sortOrder === 'asc' ? 'Click to sort descending' : 'Click to sort ascending'}
                        >
                          {sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{sortOrder === 'asc' ? 'Click to sort descending' : 'Click to sort ascending'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {hasActiveFilters && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={resetFilters}
                            className="w-full sm:w-auto"
                            aria-label="Reset all filters"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Reset filters</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
                  <Label className="text-xs sm:text-sm font-medium text-muted-foreground w-full sm:w-auto">Created Date Range:</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full sm:w-[200px] justify-start text-left font-normal",
                          !createdDateRange.from && "text-muted-foreground"
                        )}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {createdDateRange.from ? format(createdDateRange.from, "PPP") : "From"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <DateRangeCalendar
                        mode="single"
                        selected={createdDateRange.from}
                        onSelect={(date) => handleCreatedDateChange('from', date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full sm:w-[200px] justify-start text-left font-normal",
                          !createdDateRange.to && "text-muted-foreground"
                        )}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {createdDateRange.to ? format(createdDateRange.to, "PPP") : "To"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <DateRangeCalendar
                        mode="single"
                        selected={createdDateRange.to}
                        onSelect={(date) => handleCreatedDateChange('to', date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                    <Button
                      variant={selectMode ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={handleSelectModeToggle}
                      className="w-full sm:w-auto"
                      disabled={!canManageSprints}
                      title={!canManageSprints ? 'You do not have permission to manage sprints' : undefined}
                    >
                      <List className="h-4 w-4 mr-2" />
                      {selectMode ? 'Cancel Selection' : 'Add to Sprint'}
                    </Button>
                    {selectMode && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleOpenSprintModal(selectedTaskIds, selectedStoryIds)}
                          disabled={(selectedTaskCount === 0 && selectedStoryCount === 0) || assigningSprint}
                          className="w-full sm:w-auto"
                        >
                          {assigningSprint ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Kanban className="h-4 w-4 mr-2" />
                          )}
                          {assigningSprint ? 'Processing...' : 'Add Selected to Sprint'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearSelection}
                          disabled={selectedTaskCount === 0}
                          className="w-full sm:w-auto"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Clear
                        </Button>
                      </>
                    )}
                  </div>
                  {selectMode && (
                    <div className="text-sm text-muted-foreground w-full sm:w-auto text-left sm:text-right">
                      {(() => {
                        const parts: string[] = []
                        if (selectedStoryCount > 0) {
                          parts.push(`${selectedStoryCount} story${selectedStoryCount !== 1 ? 'ies' : ''}`)
                        }
                        if (selectedTaskCount > 0) {
                          parts.push(`${selectedTaskCount} task${selectedTaskCount !== 1 ? 's' : ''}`)
                        }
                        return parts.length > 0 ? parts.join(' and ') + ' selected' : 'No items selected'
                      })()}
                    </div>
                  )}
                </div>
                {selectMode && (
                  <p className="text-xs text-muted-foreground">
                    Select stories or tasks to add to a sprint. When a story is selected, all its related tasks will be automatically included.
                    <span className="block mt-1 text-amber-600 dark:text-amber-400">
                      Note: Items already in a sprint cannot be selected.
                    </span>
                  </p>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {displayedItems.map((item) => {

                const isTask = item.type === 'task'
                const isStory = item.type === 'story'
                const isTaskSelected = isTask && selectedTaskIds.includes(item._id)
                const isStorySelected = isStory && selectedStoryIds.includes(item._id)
                const isSelected = isTaskSelected || isStorySelected
                const isInSprint = !!(item.sprint && item.sprint._id)
                const showCheckbox = selectMode && (isTask || isStory)
                const canSelect = !isInSprint // Can only select if not already in a sprint

                return (
                  <Card
                    key={item._id}
                    className={cn(
                      'hover:shadow-md transition-shadow cursor-pointer',
                      showCheckbox && isSelected && 'border-primary/60 bg-primary/5',
                      showCheckbox && !canSelect && 'opacity-60'
                    )}
                    onClick={(e) => {
                      // Don't navigate if clicking on checkbox, dropdown, or buttons
                      const target = e.target as HTMLElement
                      if (
                        target.closest('button') ||
                        target.closest('[role="checkbox"]') ||
                        target.closest('[role="menuitem"]') ||
                        target.closest('.dropdown-menu')
                      ) {
                        return
                      }
                      // Navigate based on item type
                      if (isTask) {
                        router.push(`/tasks/${item._id}`)
                      } else if (isStory) {
                        router.push(`/stories/${item._id}`)
                      } else if (item.type === 'epic') {
                        router.push(`/epics/${item._id}`)
                      }
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {showCheckbox && (
                          <Checkbox
                            checked={isSelected}
                            disabled={!canSelect}
                            onCheckedChange={(checked) => {
                              if (!canSelect) return // Prevent selection if already in sprint
                              if (isTask) {
                                setTaskSelected(item._id, Boolean(checked))
                              } else if (isStory) {
                                setStorySelected(item._id, Boolean(checked))
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={canSelect ? `Select ${item.title}` : `${item.title} is already in a sprint and cannot be selected`}
                            className="mt-1"
                            title={!canSelect ? `This ${item.type} is already in a sprint and cannot be selected` : undefined}
                          />
                        )}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
                          <div className="flex-1 min-w-0 w-full">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-medium text-foreground text-sm sm:text-base truncate">
                                {item.title}
                              </h3>
                              <Badge className={cn(getStatusColor(item.status), "flex-shrink-0 font-semibold")}>
                                {formatToTitleCase(item.status.replace('_', ' '))}
                              </Badge>
                              {/* Display displayId for tasks only */}
                              {item.type === 'task' && item.displayId && (
                                <Badge className="bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200 ml-1 font-mono text-xs" title={`Task ID: ${item.displayId}`}>
                                  #{item.displayId}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <Badge className={getTypeColor(item.type)}>
                                {formatToTitleCase(item.type)}
                              </Badge>
                              <Badge className={getPriorityColor(item.priority)}>
                                {formatToTitleCase(item.priority)}
                              </Badge>
                              {item?.epic && (
                                <Badge
                                  variant="outline"
                                  className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900"
                                >
                                  {(() => {
                                    if (typeof item.epic === 'string') {
                                      const epicData = epicMap.get(item.epic)
                                      return epicData ? formatToTitleCase(epicData.title) : formatToTitleCase('Epic')
                                    }
                                    const epicObj = item.epic as { _id: string; name?: string; title?: string }
                                    return formatToTitleCase(epicObj.title || epicObj.name || 'Epic')
                                  })()}
                                </Badge>
                              )}
                              {item.sprint && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge
                                        variant="outline"
                                        className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900 cursor-default"
                                      >
                                        {truncateText(formatToTitleCase(item.sprint.name), 18)}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{formatToTitleCase(item.sprint.name)}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            {/* <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-xs sm:text-sm text-muted-foreground mb-2 line-clamp-2 cursor-default">
                                    {item.description }
                                  </p>
                                </TooltipTrigger>
                                {(item.description && item.description.length > 0) && (
                                  <TooltipContent>
                                    <p className="max-w-xs break-words">{item.description}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider> */}
                            <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                              {item.assignedTo && item.assignedTo.length > 0
                                ? item.assignedTo.map((assignment: any) => {
                                  // Try to get user data from populated user field first, then from denormalized fields
                                  const firstName = assignment?.user?.firstName || assignment?.firstName;
                                  const lastName = assignment?.user?.lastName || assignment?.lastName;
                                  if (firstName && lastName) {
                                    return `${firstName} ${lastName}`;
                                  }
                                  return 'Unknown User';
                                }).join(', ')
                                : 'Not assigned'}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                              <div className="flex items-center space-x-1">
                                <Target className="h-3 w-3 sm:h-4 sm:w-4" />
                                {item.project?.name ? (
                                  <span
                                    className="truncate"
                                    title={
                                      item.project.name && item.project.name.length > 10
                                        ? item.project.name
                                        : undefined
                                    }
                                  >
                                    {item.project.name && item.project.name.length > 10
                                      ? `${item.project.name.slice(0, 10)}…`
                                      : item.project.name}
                                  </span>
                                ) : (
                                  <span className="truncate italic text-muted-foreground">
                                    Project deleted or unavailable
                                  </span>
                                )}
                              </div>
                              {item.dueDate && (
                                <div className="flex items-center space-x-1">
                                  <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                                  <span>Due {formatDate(item.dueDate)}</span>
                                </div>
                              )}
                              {item.storyPoints && (
                                <div className="flex items-center space-x-1">
                                  <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
                                  <span>{item.storyPoints} points</span>
                                </div>
                              )}
                              {item.estimatedHours && (
                                <div className="flex items-center space-x-1">
                                  <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                                  <span>{item.estimatedHours}h estimated</span>
                                </div>
                              )}
                              {item.labels.length > 0 && (
                                <div className="flex items-center space-x-1">
                                  <Star className="h-3 w-3 sm:h-4 sm:w-4" />
                                  <span className="truncate">
                                    {truncateText(item.labels.join(', '), 30)}
                                  </span>
                                </div>
                              )}
                              {item.createdBy && (
                                <div className="flex items-center space-x-1">
                                  <span className="text-muted-foreground">Created by:</span>
                                  <span className="font-medium">
                                    {(() => {
                                      const firstName = item.createdBy?.firstName;
                                      const lastName = item.createdBy?.lastName;
                                      if (firstName && lastName) {
                                        return `${firstName} ${lastName}`;
                                      }
                                      return 'Unknown User';
                                    })()}
                                  </span>
                                </div>
                              )}
                              {item.createdAt && (
                                <div className="flex items-center space-x-1">
                                  <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                                  <span>Created {formatDate(item.createdAt)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 flex-shrink-0">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="flex-shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="min-w-[172px] py-2 rounded-md shadow-lg border border-border bg-background z-[10000]"
                              >
                                {/* View */}
                                {item.type === 'task' && (
                                  <DropdownMenuItem
                                    onClick={() => router.push(`/tasks/${item._id}`)}
                                    className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    <span>View Task</span>
                                  </DropdownMenuItem>
                                )}
                                {item.type === 'story' && (
                                  <DropdownMenuItem
                                    onClick={() => router.push(`/stories/${item._id}`)}
                                    className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    <span>View Story</span>
                                  </DropdownMenuItem>
                                )}
                                {item.type === 'epic' && (
                                  <DropdownMenuItem
                                    onClick={() => router.push(`/epics/${item._id}`)}
                                    className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    <span>View Epic</span>
                                  </DropdownMenuItem>
                                )}

                                {/* Edit */}
                                {item.type === 'task' && canEditTask(item) && (
                                  <DropdownMenuItem
                                    onClick={() => router.push(`/tasks/${item._id}/edit`)}
                                    className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
                                  >
                                    <Edit className="h-4 w-4 mr-2" />
                                    <span>Edit Task</span>
                                  </DropdownMenuItem>
                                )}
                                {item.type === 'story' && canEditStory(item) && (
                                  <DropdownMenuItem
                                    onClick={() => router.push(`/stories/${item._id}/edit`)}
                                    className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
                                  >
                                    <Edit className="h-4 w-4 mr-2" />
                                    <span>Edit Story</span>
                                  </DropdownMenuItem>
                                )}
                                {item.type === 'epic' && canEditEpic(item) && (
                                  <DropdownMenuItem
                                    onClick={() => router.push(`/epics/${item._id}/edit`)}
                                    className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
                                  >
                                    <Edit className="h-4 w-4 mr-2" />
                                    <span>Edit Epic</span>
                                  </DropdownMenuItem>
                                )}

                                {(item.type === 'task' || item.type === 'story') && !item.sprint && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      if (item.type === 'task') {
                                        handleOpenSprintModal([item._id], [], { mode: 'assign' })
                                      } else if (item.type === 'story') {
                                        handleOpenSprintModal([], [item._id], { mode: 'assign' })
                                      }
                                    }}
                                    disabled={!canManageSprints}
                                    className={cn(
                                      'flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer',
                                      !canManageSprints && 'opacity-50 cursor-not-allowed'
                                    )}
                                    title={!canManageSprints ? 'You do not have permission to manage sprints' : undefined}
                                  >
                                    <Kanban className="h-4 w-4 mr-2" />
                                    <span>Add to Sprint</span>
                                  </DropdownMenuItem>
                                )}
                                {(item.type === 'task' || item.type === 'story') && item.sprint && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      if (item.type === 'task') {
                                        handleOpenSprintModal([item._id], [], {
                                          mode: 'manage',
                                          existingSprint: { _id: item.sprint!._id, name: item.sprint!.name }
                                        })
                                      } else if (item.type === 'story') {
                                        handleOpenSprintModal([], [item._id], {
                                          mode: 'manage',
                                          existingSprint: { _id: item.sprint!._id, name: item.sprint!.name }
                                        })
                                      }
                                    }}
                                    disabled={!canManageSprints}
                                    className={cn(
                                      'flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer',
                                      !canManageSprints && 'opacity-50 cursor-not-allowed'
                                    )}
                                    title={!canManageSprints ? 'You do not have permission to manage sprints' : undefined}
                                  >
                                    <Kanban className="h-4 w-4 mr-2" />
                                    <span>Manage Sprint</span>
                                  </DropdownMenuItem>
                                )}

                                {item.type === 'task' && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      if (!item.sprint) return
                                      openStatusChangeModal(item)
                                    }}
                                    disabled={!item.sprint}
                                    className={cn(
                                      'flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer',
                                      !item.sprint && 'opacity-50 cursor-not-allowed'
                                    )}
                                    title={!item.sprint ? 'Assign the task to a sprint to change its status' : undefined}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    <span>Change Status</span>
                                  </DropdownMenuItem>
                                )}

                                {/* Delete */}
                                {((item.type === 'task' && canDeleteTask(item)) ||
                                  (item.type === 'story' && canDeleteStory(item)) ||
                                  (item.type === 'epic' && canDeleteEpic(item))) && (
                                    <DropdownMenuItem
                                      onClick={() => handleDeleteClick(item)}
                                      className="flex items-center space-x-2 px-4 py-2 text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      <span>
                                        Delete {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                                      </span>
                                    </DropdownMenuItem>
                                  )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <ConfirmationModal
          isOpen={showDeleteConfirmModal}
          onClose={() => { setShowDeleteConfirmModal(false); setSelectedForDelete(null); }}
          onConfirm={handleDeleteItem}
          title={`Delete ${selectedForDelete?.type ? selectedForDelete.type.charAt(0).toUpperCase() + selectedForDelete.type.slice(1) : 'Item'}`}
          description={`Are you sure you want to delete "${selectedForDelete?.title}"? This action cannot be undone.`}
          confirmText={deleting ? 'Deleting...' : 'Delete'}
          cancelText="Cancel"
          variant="destructive"
        />

        <ResponsiveDialog
          open={showSprintModal}
          onOpenChange={(open) => {
            if (open) {
              setShowSprintModal(true)
              return
            }
            handleCloseSprintModal()
          }}
          title={sprintModalTitle}
          description={sprintModalDescription}
          footer={
            <div className="flex flex-col sm:flex-row sm:justify-end gap-2 w-full">
              {sprintModalMode === 'manage' && (
                <Button
                  variant="destructive"
                  onClick={handleRemoveFromSprint}
                  disabled={assigningSprint || removingSprint}
                >
                  {removingSprint ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    'Remove from Sprint'
                  )}
                </Button>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={handleCloseSprintModal}
                  disabled={assigningSprint || removingSprint}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSprintAssignment}
                  disabled={
                    assigningSprint ||
                    removingSprint ||
                    (taskIdsForSprint.length === 0 && storyIdsForSprint.length === 0) ||
                    !selectedSprintId ||
                    loadingTasksFromStories
                  }
                >
                  {assigningSprint ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {sprintModalMode === 'manage' ? 'Updating...' : 'Adding...'}
                    </>
                  ) : (
                    <>
                      <Kanban className="h-4 w-4 mr-2" />
                      {sprintModalMode === 'manage' ? 'Update Sprint' : 'Add to Sprint'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {sprintsError && (
              <Alert variant="destructive">
                <AlertDescription>{sprintsError}</AlertDescription>
              </Alert>
            )}

            {currentSprintInfo && (
              <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{formatToTitleCase('Current Sprint')}:</span>{' '}
                <Badge variant="outline" className="ml-1 hover:bg-transparent dark:hover:bg-transparent" title={formatToTitleCase(currentSprintInfo.name)}>
                  {truncateText(formatToTitleCase(currentSprintInfo.name), 24)}
                </Badge>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium text-foreground">
                Sprint <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedSprintId}
                onValueChange={(value) => setSelectedSprintId(value)}
                disabled={sprintsLoading || sprints.length === 0}
              >
                <SelectTrigger className="mt-1 w-full text-left items-start min-h-[4.75rem] py-3">
                  <SelectValue
                    placeholder={
                      sprintsLoading
                        ? 'Loading sprints...'
                        : sprintModalMode === 'manage'
                          ? 'Select new sprint'
                          : 'Select sprint'
                    }
                  />
                </SelectTrigger>
                <SelectContent className="z-[10050] p-0 max-w-[26rem]">
                  <div className="p-2 space-y-2">
                    <Input
                      value={sprintQuery}
                      onChange={(e) => setSprintQuery(e.target.value)}
                      placeholder="Search sprints"
                      className="h-9"
                    />
                    <div className="max-h-56 overflow-y-auto">
                      {sprintsLoading ? (
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground p-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading sprints...</span>
                        </div>
                      ) : filteredSprints.length === 0 ? (
                        <div className="px-2 py-1 text-sm text-muted-foreground">
                          {sprints.length === 0
                            ? 'No planning or active sprints available.'
                            : 'No sprints match your search.'}
                        </div>
                      ) : (
                        filteredSprints.map((sprint) => (
                          <SelectItem key={sprint._id} value={sprint._id} className="leading-normal">
                            <div className="flex flex-col space-y-1 max-w-full">
                              <span className="font-medium break-words" title={sprint.name}>
                                {truncateText(sprint.name, 48)}
                              </span>
                              {sprint.project?.name && (
                                <span className="text-xs text-muted-foreground break-words" title={sprint.project.name}>
                                  Project: {truncateText(sprint.project.name, 48)}
                                </span>
                              )}
                              {(sprint.startDate || sprint.endDate) && (
                                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-1">
                                  <span>
                                    {sprint.startDate
                                      ? formatDate(sprint.startDate)
                                      : 'TBD'}
                                  </span>
                                  <span>-</span>
                                  <span>
                                    {sprint.endDate
                                      ? formatDate(sprint.endDate)
                                      : 'TBD'}
                                  </span>
                                </div>
                              )}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </div>
                  </div>
                </SelectContent>
              </Select>
            </div>

            {loadingTasksFromStories && (
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading tasks from selected stories...</span>
              </div>
            )}

            {storiesForSprint.length > 0 && (
              <div>
                <Label className="text-sm font-medium text-foreground">
                  Selected Stories ({storiesForSprint.length})
                </Label>
                <p className="mt-1 mb-2 text-xs text-muted-foreground">
                  All tasks related to these stories will be added to the sprint.
                </p>
                <ul className="mt-2 space-y-2 max-h-32 overflow-y-auto">
                  {storiesForSprint.map((story) => (
                    <li
                      key={story._id}
                      className="flex items-center justify-between gap-2 text-sm p-2 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900 flex-shrink-0">
                          {formatToTitleCase('Story')}
                        </Badge>
                        <span className="truncate font-medium">{story.title}</span>
                      </div>
                      <Badge variant="outline" className="flex-shrink-0 hover:bg-transparent dark:hover:bg-transparent">
                        {formatToTitleCase(story.priority)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium text-foreground">
                Tasks to Add ({allTasksForSprint.length})
                {storiesForSprint.length > 0 && (
                  <span className="text-xs text-muted-foreground ml-2">
                    ({taskIdsForSprint.length} directly selected + {tasksFromStories.length} from stories)
                  </span>
                )}
              </Label>
              {allTasksForSprint.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {storiesForSprint.length > 0
                    ? 'No tasks found for the selected stories.'
                    : 'Choose one or more tasks or stories from the backlog to add them to a sprint.'}
                </p>
              ) : (
                <ul className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                  {allTasksForSprint.map((task) => {
                    const isFromStory = !!(task as any)._sourceStoryId
                    const isDirectlySelected = (task as any)._isDirectlySelected === true
                    const sourceStoryTitle = (task as any)._sourceStoryTitle

                    return (
                      <li
                        key={task._id}
                        className={`flex flex-col gap-2 text-sm p-2 rounded-md ${isFromStory
                            ? 'bg-muted/50 border border-border'
                            : 'bg-background border border-border/50'
                          }`}
                      >
                        <div className="flex items-center justify-between gap-2 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isFromStory && sourceStoryTitle && (
                              <Badge variant="outline" className="text-xs flex-shrink-0 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900">
                                {formatToTitleCase('From')}: {truncateText(formatToTitleCase(sourceStoryTitle), 20)}
                              </Badge>
                            )}
                            {isDirectlySelected && !isFromStory && (
                              <Badge variant="outline" className="text-xs flex-shrink-0 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900">
                                {formatToTitleCase('Directly Selected')}
                              </Badge>
                            )}
                            {isDirectlySelected && isFromStory && (
                              <Badge variant="outline" className="text-xs flex-shrink-0 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900">
                                {formatToTitleCase('Direct + Story')}
                              </Badge>
                            )}
                            <span className="truncate font-medium">{task.title}</span>
                          </div>
                          <Badge variant="outline" className="flex-shrink-0 hover:bg-transparent dark:hover:bg-transparent">
                            {formatToTitleCase(task.priority)}
                          </Badge>
                        </div>
                        {isFromStory && sourceStoryTitle && (
                          <div className="text-xs text-muted-foreground pl-0.5">
                            {formatToTitleCase('Story')}: <span className="font-medium">{formatToTitleCase(sourceStoryTitle)}</span>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </ResponsiveDialog>

        <ResponsiveDialog
          open={statusChangeModalOpen}
          onOpenChange={(open) => {
            if (open) {
              setStatusChangeModalOpen(true)
              return
            }
            closeStatusChangeModal()
          }}
          title="Change Task Status"
          description="Select a new status for this task."
          footer={
            <div className="flex flex-col sm:flex-row sm:justify-end gap-2 w-full">
              <Button
                variant="outline"
                onClick={closeStatusChangeModal}
                disabled={statusChanging}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={handleStatusChange}
                disabled={statusChanging || !statusChangeTaskId}
                className="w-full sm:w-auto"
              >
                {statusChanging ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Update Status
                  </>
                )}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {statusChangeError && (
              <Alert variant="destructive">
                <AlertDescription>{statusChangeError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Status</Label>
              <Select
                value={statusChangeValue}
                onValueChange={(value) => setStatusChangeValue(value as BacklogItem['status'])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="z-[10050]">
                  {ALLOWED_BACKLOG_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {formatToTitleCase(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This update takes effect immediately and can be changed again later.
              </p>
            </div>
          </div>
        </ResponsiveDialog>

        {/* Pagination Controls */}
        {totalCount > 0 && (
          <Card className="mt-6">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
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
                    Showing {pageStartIndex} to {pageEndIndex} of {totalCount}
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
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage >= totalPages || loading}
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
      </div>
    </MainLayout>
  )
}