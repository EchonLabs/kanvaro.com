'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '@radix-ui/react-dropdown-menu'
import { DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { Checkbox } from '@/components/ui/Checkbox'
import { Label } from '@/components/ui/label'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
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
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'backlog' | 'sprint' | 'in_progress' | 'done'
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
    name: string
  }
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

const ALLOWED_BACKLOG_STATUSES: BacklogItem['status'][] = ['backlog', 'sprint', 'in_progress', 'done']

function normalizeBacklogStatus(status: string | undefined): BacklogItem['status'] {
  if (typeof status !== 'string') {
    return 'backlog'
  }
  return ALLOWED_BACKLOG_STATUSES.includes(status as BacklogItem['status'])
    ? (status as BacklogItem['status'])
    : 'backlog'
}

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
  const [taskIdsForSprint, setTaskIdsForSprint] = useState<string[]>([])
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
        const normalized = rawItems.map((item: any) => {
          const status =
            item.type === 'task' && item.sprint
              ? 'sprint'
              : normalizeBacklogStatus(item.status)

          return {
            ...item,
            status,
            labels: Array.isArray(item.labels) ? item.labels : []
          }
        }) as BacklogItem[]
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

  const clearSelection = () => {
    setSelectedTaskIds([])
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
    setSprintModalMode('assign')
    setCurrentSprintInfo(null)
  }

  const handleCloseSprintModal = () => {
    if (assigningSprint || removingSprint) return
    setShowSprintModal(false)
    resetSprintModalState()
  }

  const handleOpenSprintModal = (
    taskIds: string[],
    options?: {
      mode?: 'assign' | 'manage'
      existingSprint?: { _id: string; name: string }
    }
  ) => {
    const uniqueTaskIds = Array.from(new Set(taskIds.filter(Boolean)))
    if (uniqueTaskIds.length === 0) return

    setTaskIdsForSprint(uniqueTaskIds)
    clearSprintSelection()
    setSprintModalMode(options?.mode ?? 'assign')
    setCurrentSprintInfo(options?.existingSprint ?? null)
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

  const tasksForSprint = useMemo(
    () =>
      backlogItems.filter(
        (item) => item.type === 'task' && taskIdsForSprint.includes(item._id)
      ),
    [backlogItems, taskIdsForSprint]
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
      ? taskIdsForSprint.length > 1
        ? `Manage Sprint for ${taskIdsForSprint.length} Tasks`
        : 'Manage Sprint Assignment'
      : taskIdsForSprint.length > 1
        ? `Add ${taskIdsForSprint.length} Tasks to Sprint`
        : 'Add Task to Sprint'

  const sprintModalDescription =
    sprintModalMode === 'manage'
      ? 'Change the sprint or remove it from this task.'
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
      const results = await Promise.all(
        taskIdsForSprint.map(async (taskId) => {
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

      const failed = results.filter((result) => !result.ok)
      if (failed.length > 0) {
        console.error('Failed to assign some tasks to sprint:', failed)
        setSprintsError('Failed to add one or more tasks to the sprint. Please try again.')
        return
      }

      setBacklogItems((prev) =>
        prev.map((item) => {
          if (item.type === 'task' && taskIdsForSprint.includes(item._id)) {
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

      setSuccess(
        taskIdsForSprint.length > 1
          ? `${taskIdsForSprint.length} tasks assigned to ${sprint.name} successfully.`
          : `Task assigned to ${sprint.name} successfully.`
      )
      setTimeout(() => setSuccess(''), 3000)

      setShowSprintModal(false)
      resetSprintModalState()
      setSelectedTaskIds([])
      setSelectMode(false)
    } catch (error) {
      console.error('Failed to assign tasks to sprint:', error)
      setSprintsError('Failed to add tasks to sprint. Please try again.')
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
      const results = await Promise.all(
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

      const failed = results.filter((result) => !result.ok)
      if (failed.length > 0) {
        console.error('Failed to remove sprint from some tasks:', failed)
        setSprintsError('Failed to remove sprint from the task. Please try again.')
        return
      }

      setBacklogItems((prev) =>
        prev.map((item) => {
          if (item.type === 'task' && taskIdsForSprint.includes(item._id)) {
            return {
              ...item,
              sprint: undefined,
              status: 'backlog'
            }
          }
          return item
        })
      )

      setSuccess(
        taskIdsForSprint.length > 1
          ? `${taskIdsForSprint.length} tasks removed from sprint successfully.`
          : 'Task removed from sprint successfully.'
      )
      setTimeout(() => setSuccess(''), 3000)

      setShowSprintModal(false)
      resetSprintModalState()
      setSelectedTaskIds([])
      setSelectMode(false)
    } catch (error) {
      console.error('Failed to remove task from sprint:', error)
      setSprintsError('Failed to remove sprint from the task. Please try again.')
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

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'epic': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'story': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'task': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'backlog': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      case 'sprint': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'in_progress': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
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
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
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
      <div className="space-y-6">
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
            <Button onClick={() => router.push('/stories/create')} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              New Story
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
                          onClick={() => handleOpenSprintModal(selectedTaskIds)}
                          disabled={selectedTaskCount === 0 || assigningSprint}
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
                      {selectedTaskCount > 0
                        ? `${selectedTaskCount} task${selectedTaskCount !== 1 ? 's' : ''} selected`
                        : 'No tasks selected'}
                    </div>
                  )}
                </div>
                {selectMode && (
                  <p className="text-xs text-muted-foreground">
                    Only task items can be added to sprints. Use the checkboxes to choose the tasks you want to move.
                  </p>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredAndSortedItems.map((item) => {
                const isTask = item.type === 'task'
                const isSelected = selectedTaskIds.includes(item._id)
                const showCheckbox = selectMode && isTask

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
                            onCheckedChange={(checked) =>
                              setTaskSelected(item._id, Boolean(checked))
                            }
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
                                {item.type}
                              </Badge>
                              <Badge className={getPriorityColor(item.priority)}>
                                {item.priority}
                              </Badge>
                              <Badge className={getStatusColor(item.status)}>
                                {item.status.replace('_', ' ')}
                              </Badge>
                              {item.epic && (
                                <Badge
                                  variant="outline"
                                  className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                                >
                                  {item.epic.name}
                                </Badge>
                              )}
                              {item.sprint && (
                                <Badge
                                  variant="outline"
                                  className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                  title={item.sprint.name}
                                >
                                  {truncateText(item.sprint.name, 18)}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs sm:text-sm text-muted-foreground mb-2 break-words">
                              {item.description || 'No description'}
                            </p>
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
                                  <span className="truncate">{item.labels.join(', ')}</span>
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

                                {item.type === 'task' && !item.sprint && (
                                  <DropdownMenuItem
                                    onClick={() => handleOpenSprintModal([item._id], { mode: 'assign' })}
                                    className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
                                  >
                                    <Kanban className="h-4 w-4 mr-2" />
                                    <span>Add to Sprint</span>
                                  </DropdownMenuItem>
                                )}
                                {item.type === 'task' && item.sprint && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleOpenSprintModal([item._id], {
                                        mode: 'manage',
                                        existingSprint: { _id: item.sprint!._id, name: item.sprint!.name }
                                      })
                                    }
                                    className="flex items-center space-x-2 px-4 py-2 focus:bg-accent cursor-pointer"
                                  >
                                    <Kanban className="h-4 w-4 mr-2" />
                                    <span>Manage Sprint</span>
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
                    taskIdsForSprint.length === 0 ||
                    !selectedSprintId
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
                <Badge variant="outline" className="ml-1" title={currentSprintInfo.name}>
                  {truncateText(currentSprintInfo.name, 24)}
                </Badge>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium text-foreground">
                Sprint
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

            <div>
              <Label className="text-sm font-medium text-foreground">
                Selected tasks
              </Label>
              {tasksForSprint.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Choose one or more tasks from the backlog to add them to a sprint.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {tasksForSprint.map((task) => (
                    <li
                      key={task._id}
                      className="flex items-center justify-between gap-2 text-sm text-muted-foreground"
                    >
                      <span className="truncate">{task.title}</span>
                      <Badge variant="outline" className="flex-shrink-0">
                        {task.priority}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </ResponsiveDialog>
      </div>
    </MainLayout>
  )
}