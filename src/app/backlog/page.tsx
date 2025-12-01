'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
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
  Star
} from 'lucide-react'
import { format } from 'date-fns'
import { DateRange } from 'react-day-picker'

interface UserSummary {
  _id: string
  firstName: string
  lastName: string
  email: string
}

interface ProjectSummary {
  _id: string
  name: string
}

interface BacklogItem {
  _id: string
  title: string
  description: string
  type: 'epic' | 'story' | 'task'
  priority: string
  status: string
  project?: ProjectSummary | null
  assignedTo?: UserSummary | null
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

const ALLOWED_BACKLOG_STATUSES: string[] = ['backlog', 'todo', 'sprint', 'in_progress', 'done']

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
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedForDelete, setSelectedForDelete] = useState<{ id: string; type: BacklogItem['type']; title: string } | null>(null)
  const [authError, setAuthError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('priority')
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
  const [projectFilterValue, setProjectFilterValue] = useState('all')
  const [assignedToFilter, setAssignedToFilter] = useState('all')
  const [assignedByFilter, setAssignedByFilter] = useState('all')
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRange | undefined>()
  const [projectFilterQuery, setProjectFilterQuery] = useState('')
  const [assignedToFilterQuery, setAssignedToFilterQuery] = useState('')
  const [assignedByFilterQuery, setAssignedByFilterQuery] = useState('')
  const startDateBoundary = useMemo(() => {
    if (!dateRangeFilter?.from) return null
    const boundary = new Date(dateRangeFilter.from)
    boundary.setHours(0, 0, 0, 0)
    return boundary
  }, [dateRangeFilter])
  const endDateBoundary = useMemo(() => {
    if (!dateRangeFilter?.to) return null
    const boundary = new Date(dateRangeFilter.to)
    boundary.setHours(23, 59, 59, 999)
    return boundary
  }, [dateRangeFilter])

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await fetchBacklogItems()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
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

  useEffect(() => {
    const successParam = searchParams?.get('success')
    if (successParam === 'story-created') {
      setSuccess('User story created successfully.')
      const timeout = setTimeout(() => setSuccess(''), 3000)
      return () => clearTimeout(timeout)
    }
  }, [searchParams])

  const fetchBacklogItems = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/backlog')
      const data = await response.json()

      if (data.success) {
        const rawItems = Array.isArray(data.data) ? data.data : []
        const normalized = rawItems.map((item: any) => ({
          ...item,
          labels: Array.isArray(item.labels) ? item.labels : []
        })) as BacklogItem[]
        setBacklogItems(normalized)

        const projectMap = new Map<string, ProjectSummary>()
        const assignedToMap = new Map<string, UserSummary>()
        const createdByMap = new Map<string, UserSummary>()

        normalized.forEach((item) => {
          if (item.project?._id) {
            projectMap.set(item.project._id, {
              _id: item.project._id,
              name: item.project.name
            })
          }
          if (item.assignedTo?._id) {
            assignedToMap.set(item.assignedTo._id, {
              _id: item.assignedTo._id,
              firstName: item.assignedTo.firstName,
              lastName: item.assignedTo.lastName,
              email: item.assignedTo.email
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
        })

        setProjectOptions(Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name)))
        setAssignedToOptions(Array.from(assignedToMap.values()).sort((a, b) =>
          `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
        ))
        setAssignedByOptions(Array.from(createdByMap.values()).sort((a, b) =>
          `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
        ))
      } else {
        setError(data.error || 'Failed to fetch backlog items')
      }
    } catch (err) {
      setError('Failed to fetch backlog items')
    } finally {
      setLoading(false)
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
    const uniqueTaskIds = Array.from(new Set(taskIds.filter(Boolean)))
    const uniqueStoryIds = Array.from(new Set(storyIds.filter(Boolean)))
    
    if (uniqueTaskIds.length === 0 && uniqueStoryIds.length === 0) return

    setTaskIdsForSprint(uniqueTaskIds)
    setStoryIdsForSprint(uniqueStoryIds)
    clearSprintSelection()
    setSprintModalMode(options?.mode ?? 'assign')
    setCurrentSprintInfo(options?.existingSprint ?? null)
    
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
    setSelectedTaskIds((prev) => {
      const validIds = prev.filter((id) =>
        backlogItems.some((item) => item._id === id && item.type === 'task')
      )
      return validIds.length === prev.length ? prev : validIds
    })
    setSelectedStoryIds((prev) => {
      const validIds = prev.filter((id) =>
        backlogItems.some((item) => item._id === id && item.type === 'story')
      )
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
    if (!query) {
      return sprints
    }
    return sprints.filter((sprint) => {
      const nameMatch = sprint.name.toLowerCase().includes(query)
      const projectMatch = sprint.project?.name
        ? sprint.project.name.toLowerCase().includes(query)
        : false
      return nameMatch || projectMatch
    })
  }, [sprints, sprintQuery])

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
              sprint: selectedSprintId
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
              }
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
              status: 'sprint'
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

      setSuccess(message)
      setTimeout(() => setSuccess(''), 3000)

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

      setSuccess(message)
      setTimeout(() => setSuccess(''), 3000)

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
        setSuccess(`${selectedForDelete.type.charAt(0).toUpperCase() + selectedForDelete.type.slice(1)} deleted successfully.`)
        setTimeout(() => setSuccess(''), 3000)
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

      setSuccess('Task status updated successfully.')
      setTimeout(() => setSuccess(''), 3000)
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
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
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

  const filteredAndSortedItems = backlogItems
    .filter(item => {
      const matchesSearch = !searchQuery || 
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.project?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      
      const matchesType = typeFilter === 'all' || item.type === typeFilter
      const matchesPriority = priorityFilter === 'all' || item.priority === priorityFilter

      // Treat "done" / "completed" as final states that should not appear in the
      // default backlog view.
      const isFinalTask = item.type === 'task' && item.status === 'done'
      const isFinalStory = item.type === 'story' && (item.status === 'completed' || item.status === 'done')
      const isFinalEpic = item.type === 'epic' && (item.status === 'completed' || item.status === 'done')

      const isFinal = isFinalTask || isFinalStory || isFinalEpic

      const matchesStatus =
        statusFilter === 'all'
          ? !isFinal
          : item.status === statusFilter
      const matchesProject =
        projectFilterValue === 'all' ||
        (item.project?._id ? item.project._id === projectFilterValue : false)
      const matchesAssignedTo =
        assignedToFilter === 'all' ||
        (item.assignedTo?._id ? item.assignedTo._id === assignedToFilter : false)
      const matchesAssignedBy =
        assignedByFilter === 'all' ||
        (item.createdBy?._id ? item.createdBy._id === assignedByFilter : false)

      const createdAtDate = new Date(item.createdAt)
      const matchesStartDate = !startDateBoundary || createdAtDate >= startDateBoundary
      const matchesEndDate = !endDateBoundary || createdAtDate <= endDateBoundary

      return (
        matchesSearch &&
        matchesType &&
        matchesPriority &&
        matchesStatus &&
        matchesProject &&
        matchesAssignedTo &&
        matchesAssignedBy &&
        matchesStartDate &&
        matchesEndDate
      )
    })
    .sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'priority':
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
          comparison = (priorityOrder[b.priority as keyof typeof priorityOrder] || 0) - 
                      (priorityOrder[a.priority as keyof typeof priorityOrder] || 0)
          break
        case 'title':
          comparison = a.title.localeCompare(b.title)
          break
        case 'created':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'dueDate':
          const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
          const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
          comparison = aDate - bDate
          break
        default:
          comparison = 0
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })

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
            <Button variant="outline" onClick={() => router.push('/epics/create')} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              New Epic
            </Button>
            <Button variant="outline" onClick={() => router.push('/stories/create')} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              New Story
            </Button>
            <Button onClick={() => router.push('/tasks/create')} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              New Task
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert variant="success">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Backlog Items</CardTitle>
                  <CardDescription>
                    {filteredAndSortedItems.length} item{filteredAndSortedItems.length !== 1 ? 's' : ''} found
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search backlog..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-full"
                  />
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
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
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priority</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="backlog">Backlog</SelectItem>
                      <SelectItem value="sprint">Sprint</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="w-full sm:w-auto"
                  >
                    {sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
                  <Select value={projectFilterValue} onValueChange={setProjectFilterValue}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Project" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                      <div className="p-2">
                        <Input
                          value={projectFilterQuery}
                          onChange={(e) => setProjectFilterQuery(e.target.value)}
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
                  <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Assigned To" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                      <div className="p-2">
                        <Input
                          value={assignedToFilterQuery}
                          onChange={(e) => setAssignedToFilterQuery(e.target.value)}
                          placeholder="Search assignees"
                          className="mb-2"
                        />
                        <div className="max-h-56 overflow-y-auto">
                          <SelectItem value="all">All Assignees</SelectItem>
                          {filteredAssignedToOptions.length === 0 ? (
                            <div className="px-2 py-1 text-xs text-muted-foreground">No matching assignees</div>
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
                  <Select value={assignedByFilter} onValueChange={setAssignedByFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Assigned By" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                      <div className="p-2">
                        <Input
                          value={assignedByFilterQuery}
                          onChange={(e) => setAssignedByFilterQuery(e.target.value)}
                          placeholder="Search creators"
                          className="mb-2"
                        />
                        <div className="max-h-56 overflow-y-auto">
                          <SelectItem value="all">All Creators</SelectItem>
                          {filteredAssignedByOptions.length === 0 ? (
                            <div className="px-2 py-1 text-xs text-muted-foreground">No matching creators</div>
                          ) : (
                            filteredAssignedByOptions.map((member) => (
                              <SelectItem key={member._id} value={member._id}>
                                {member.firstName} {member.lastName}
                              </SelectItem>
                            ))
                          )}
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                  <div className="flex flex-col gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !dateRangeFilter?.from && !dateRangeFilter?.to && 'text-muted-foreground'
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {dateRangeFilter?.from ? (
                            dateRangeFilter.to ? (
                              `${format(dateRangeFilter.from, 'LLL dd, y')} - ${format(dateRangeFilter.to, 'LLL dd, y')}`
                            ) : (
                              `${format(dateRangeFilter.from, 'LLL dd, y')} - …`
                            )
                          ) : (
                            'Select date range'
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <DateRangeCalendar
                          initialFocus
                          mode="range"
                          defaultMonth={dateRangeFilter?.from}
                          selected={dateRangeFilter}
                          onSelect={setDateRangeFilter}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearDateFilters}
                        disabled={!dateRangeFilter?.from && !dateRangeFilter?.to}
                      >
                        Clear dates
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                    <Button
                      variant={selectMode ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={handleSelectModeToggle}
                      className="w-full sm:w-auto"
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
                  </p>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredAndSortedItems.map((item) => {
                
                const isTask = item.type === 'task'
                const isStory = item.type === 'story'
                const isTaskSelected = isTask && selectedTaskIds.includes(item._id)
                const isStorySelected = isStory && selectedStoryIds.includes(item._id)
                const isSelected = isTaskSelected || isStorySelected
                const showCheckbox = selectMode && (isTask || isStory)

                return (
                  <Card
                    key={item._id}
                    className={cn(
                      'hover:shadow-md transition-shadow',
                      showCheckbox && isSelected && 'border-primary/60 bg-primary/5'
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {showCheckbox && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              if (isTask) {
                                setTaskSelected(item._id, Boolean(checked))
                              } else if (isStory) {
                                setStorySelected(item._id, Boolean(checked))
                              }
                            }}
                            aria-label={`Select ${item.title}`}
                            className="mt-1"
                          />
                        )}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
                          <div className="flex-1 min-w-0 w-full">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <h3 className="font-medium text-foreground text-sm sm:text-base truncate flex-1 min-w-0">
                                {item.title}
                              </h3>
                              <Badge className={getTypeColor(item.type)}>
                                {formatToTitleCase(item.type)}
                              </Badge>
                              <Badge className={getPriorityColor(item.priority)}>
                                {formatToTitleCase(item.priority)}
                              </Badge>
                              <Badge className={getStatusColor(item.status)}>
                                {formatToTitleCase(item.status.replace('_', ' '))}
                              </Badge>
                              {item.epic && (
                                <Badge
                                  variant="outline"
                                  className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900"
                                >
                                  {(() => {
                                    if (typeof item.epic === 'string') {
                                      return 'Epic'
                                    }
                                    const epicObj = item.epic as { _id: string; name?: string; title?: string }
                                    return epicObj.title || epicObj.name || 'Epic'
                                  })()}
                                </Badge>
                              )}
                              {item.sprint && (
                                <Badge
                                  variant="outline"
                                  className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900"
                                  title={item.sprint.name}
                                >
                                  {truncateText(item.sprint.name, 18)}
                                </Badge>
                              )}
                            </div>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-xs sm:text-sm text-muted-foreground mb-2 line-clamp-2 cursor-default">
                                    {item.description || 'No description'}
                                  </p>
                                </TooltipTrigger>
                                {(item.description && item.description.length > 0) && (
                                  <TooltipContent>
                                    <p className="max-w-xs break-words">{item.description}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                            {item.assignedTo && (
                              <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                                {item.assignedTo.firstName} {item.assignedTo.lastName}
                              </p>
                            )}
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
                                  <span>Due {new Date(item.dueDate).toLocaleDateString()}</span>
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
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 flex-shrink-0">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="flex-shrink-0">
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
                                {item.type === 'task' && (
                                  <DropdownMenuItem
                                    onClick={() => router.push(`/tasks/${item._id}/edit`)}
                                    className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
                                  >
                                    <Edit className="h-4 w-4 mr-2" />
                                    <span>Edit Task</span>
                                  </DropdownMenuItem>
                                )}
                                {item.type === 'story' && (
                                  <DropdownMenuItem
                                    onClick={() => router.push(`/stories/${item._id}/edit`)}
                                    className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
                                  >
                                    <Edit className="h-4 w-4 mr-2" />
                                    <span>Edit Story</span>
                                  </DropdownMenuItem>
                                )}
                                {item.type === 'epic' && (
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
                                    className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
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
                                    className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
                                  >
                                    <Kanban className="h-4 w-4 mr-2" />
                                    <span>Manage Sprint</span>
                                  </DropdownMenuItem>
                                )}

                                {item.type === 'task' && (
                                  <DropdownMenuItem
                                    onClick={() => openStatusChangeModal(item)}
                                    className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
                                  >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    <span>Change Status</span>
                                  </DropdownMenuItem>
                                )}

                                {/* Delete */}
                                <DropdownMenuItem
                                  onClick={() => handleDeleteClick(item)}
                                  className="flex items-center space-x-2 px-4 py-2 text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  <span>
                                    Delete {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                                  </span>
                                </DropdownMenuItem>
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
                <span className="font-medium text-foreground">Current sprint:</span>{' '}
                <Badge variant="outline" className="ml-1 hover:bg-transparent dark:hover:bg-transparent" title={currentSprintInfo.name}>
                  {truncateText(currentSprintInfo.name, 24)}
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
                                      ? new Date(sprint.startDate).toLocaleDateString()
                                      : 'TBD'}
                                  </span>
                                  <span>-</span>
                                  <span>
                                    {sprint.endDate
                                      ? new Date(sprint.endDate).toLocaleDateString()
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
                          Story
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
                        className={`flex flex-col gap-2 text-sm p-2 rounded-md ${
                          isFromStory 
                            ? 'bg-muted/50 border border-border' 
                            : 'bg-background border border-border/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isFromStory && sourceStoryTitle && (
                              <Badge variant="outline" className="text-xs flex-shrink-0 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900">
                                From: {truncateText(sourceStoryTitle, 20)}
                              </Badge>
                            )}
                            {isDirectlySelected && !isFromStory && (
                              <Badge variant="outline" className="text-xs flex-shrink-0 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900">
                                Directly Selected
                              </Badge>
                            )}
                            {isDirectlySelected && isFromStory && (
                              <Badge variant="outline" className="text-xs flex-shrink-0 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900">
                                Direct + Story
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
                            Story: <span className="font-medium">{sourceStoryTitle}</span>
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
                      {status.replace('_', ' ')}
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
      </div>
    </MainLayout>
  )
}