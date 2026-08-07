'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { useProjectKanbanStatuses } from '@/hooks/useProjectKanbanStatuses'
import { DEFAULT_TASK_STATUS_OPTIONS, DEFAULT_TASK_STATUS_BADGE_MAP, type TaskStatusOption } from '@/constants/taskStatuses'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { useNotify } from '@/lib/notify'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  Play,
  XCircle,
  BarChart3,
  User,
  Loader2,
  Edit,
  Trash2,
  List,
  Gauge,
  Zap,
  ChevronDown,
  ChevronRight,
  CheckSquare
} from 'lucide-react'

interface Sprint {
  _id: string
  name: string
  description: string
  status: 'planning' | 'active' | 'completed' | 'cancelled'
  project: {
    _id: string
    name: string
  }
  startDate: string
  endDate: string
  goal: string
  capacity: number
  velocity: number
  teamMembers: Array<{
    _id: string
    firstName: string
    lastName: string
    email: string
  }>
  createdBy: {
    firstName: string
    lastName: string
    email: string
  }
  progress: {
    completionPercentage: number
    tasksCompleted: number
    totalTasks: number
    storyPointsCompleted: number
    totalStoryPoints: number
    estimatedHours: number
    actualHours: number
  }
  taskSummary?: {
    total: number
    completed: number
    inProgress: number
    todo: number
    blocked: number
    cancelled: number
  }
  tasks?: Array<{
    _id: string
    title: string
    displayId?: string
    status: string
    storyPoints: number
    estimatedHours: number
    actualHours: number
    priority: string
    type: string
    assignedTo?: Array<{
      user?: {
        _id: string
        firstName: string
        lastName: string
        email: string
      }
      firstName?: string
      lastName?: string
      email?: string
    }>
    archived?: boolean
    movedToSprint?: {
      _id: string
      name: string
    } | null
    movedToBacklog?: boolean
  }>
  createdAt: string
  updatedAt: string
}

type SprintTask = NonNullable<Sprint['tasks']>[number]

interface SprintOption {
  _id: string
  name: string
  status: string
  project?: {
    _id: string
    name: string
  }
}

const buildTaskSummaryFromTasks = (tasks?: Sprint['tasks']) => {
  if (!tasks) {
    return undefined
  }

  const summary = {
    total: tasks.length,
    completed: 0,
    inProgress: 0,
    todo: 0,
    blocked: 0,
    cancelled: 0
  }

  tasks.forEach(task => {
    switch (task.status) {
      case 'done':
      case 'completed':
        summary.completed += 1
        break
      case 'in_progress':
      case 'review':
      case 'testing':
        summary.inProgress += 1
        break
      case 'cancelled':
        summary.cancelled += 1
        break
      case 'blocked':
        summary.blocked += 1
        break
      default:
        summary.todo += 1
        break
    }
  })

  return summary
}

const buildProgressFromTasks = (tasks?: Sprint['tasks'], previous?: Sprint['progress']) => {
  if (!tasks || !previous) {
    return previous
  }

  const totalTasks = tasks.length
  const completedTasks = tasks.filter(task => ['done', 'completed'].includes(task.status)).length

  return {
    ...previous,
    totalTasks,
    tasksCompleted: completedTasks,
    completionPercentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  }
}

const formatDateInputValue = (date: Date) => date.toISOString().split('T')[0]

export default function SprintDetailPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()

  const router = useRouter()
  const params = useParams()
  const sprintId = params.id as string
  const { success: notifySuccess, error: notifyError } = useNotify()
  const { formatDate } = useDateTime()

  const [sprint, setSprint] = useState<Sprint | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [startingSprint, setStartingSprint] = useState(false)
  const [completingSprint, setCompletingSprint] = useState(false)
  const [completeModalOpen, setCompleteModalOpen] = useState(false)
  const [completionMode, setCompletionMode] = useState<'existing' | 'new'>('existing')
  const [availableSprints, setAvailableSprints] = useState<SprintOption[]>([])
  const [availableSprintsLoading, setAvailableSprintsLoading] = useState(false)
  const [sprintTasksCurrentPage, setSprintTasksCurrentPage] = useState(1)
  const [sprintTasksPageSize, setSprintTasksPageSize] = useState(5)
  const [selectedTargetSprintId, setSelectedTargetSprintId] = useState('')
  const [incompleteTasks, setIncompleteTasks] = useState<Array<{
    _id: string
    title: string
    status: string
    subtasks?: Array<{
      _id?: string
      title: string
      description?: string
      status: string
      isCompleted: boolean
    }>
  }>>([])
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [newSprintForm, setNewSprintForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    capacity: ''
  })
  const [taskStatusUpdating, setTaskStatusUpdating] = useState<string | null>(null)
  const { getStatusesForProject } = useProjectKanbanStatuses()

  const { hasPermission } = usePermissions()

  const sprintTasks = sprint?.tasks || []

  // Pagination logic for sprint tasks
  const paginatedSprintTasks = useMemo(() => {
    const startIndex = (sprintTasksCurrentPage - 1) * sprintTasksPageSize
    const endIndex = startIndex + sprintTasksPageSize
    return sprintTasks.slice(startIndex, endIndex)
  }, [sprintTasks, sprintTasksCurrentPage, sprintTasksPageSize])

  const sprintTasksTotalPages = Math.ceil(sprintTasks.length / sprintTasksPageSize)

  const canCreateSprint = hasPermission(Permission.SPRINT_CREATE)
  const canViewSprint = hasPermission(Permission.SPRINT_VIEW) || hasPermission(Permission.SPRINT_READ)
  const canEditSprint = hasPermission(Permission.SPRINT_EDIT) && hasPermission(Permission.SPRINT_CREATE)
  const canDeleteSprint = hasPermission(Permission.SPRINT_DELETE)
  const canStartSprint = hasPermission(Permission.SPRINT_START)
  const canCompleteSprint = hasPermission(Permission.SPRINT_COMPLETE)

  const totalTasks = sprint?.progress?.totalTasks ?? sprintTasks.length
  const hasTasks = (totalTasks ?? 0) > 0


  // Auth initialization - trigger data loading
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      setLoading(false)
      fetchSprint()
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated])

  useEffect(() => {
    if (!successMessage) return
    const timeout = setTimeout(() => setSuccessMessage(''), 3000)
    return () => clearTimeout(timeout)
  }, [successMessage])

  const projectStatusOptions = useMemo<TaskStatusOption[]>(() => {
    if (!sprint?.project?._id) {
      return DEFAULT_TASK_STATUS_OPTIONS
    }
    const statuses = getStatusesForProject(sprint.project._id)
    if (statuses?.length) {
      return statuses.map(status => ({
        value: status.key,
        label: status.title || formatToTitleCase(status.key),
        color: status.color
      }))
    }
    return DEFAULT_TASK_STATUS_OPTIONS
  }, [sprint?.project?._id, getStatusesForProject])

  const formatTaskStatusLabel = useCallback(
    (status: string) => {
      const option = projectStatusOptions.find(opt => opt.value === status)
      return option?.label || formatToTitleCase(status)
    },
    [projectStatusOptions]
  )

  const getTaskStatusBadgeClass = useCallback(
    (status: string) => {
      const option = projectStatusOptions.find(opt => opt.value === status)
      const baseColor = option?.color || DEFAULT_TASK_STATUS_BADGE_MAP[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      // Remove hover effects by adding hover states that match base color
      // Extract base bg color and add matching hover
      if (baseColor.includes('bg-gray-')) {
        return baseColor + ' hover:bg-gray-100 dark:hover:bg-gray-900'
      } else if (baseColor.includes('bg-blue-')) {
        return baseColor + ' hover:bg-blue-100 dark:hover:bg-blue-900'
      } else if (baseColor.includes('bg-green-')) {
        return baseColor + ' hover:bg-green-100 dark:hover:bg-green-900'
      } else if (baseColor.includes('bg-yellow-')) {
        return baseColor + ' hover:bg-yellow-100 dark:hover:bg-yellow-900'
      } else if (baseColor.includes('bg-purple-')) {
        return baseColor + ' hover:bg-purple-100 dark:hover:bg-purple-900'
      } else if (baseColor.includes('bg-red-')) {
        return baseColor + ' hover:bg-red-100 dark:hover:bg-red-900'
      } else if (baseColor.includes('bg-orange-')) {
        return baseColor + ' hover:bg-orange-100 dark:hover:bg-orange-900'
      } else if (baseColor.includes('bg-amber-')) {
        return baseColor + ' hover:bg-amber-100 dark:hover:bg-amber-900'
      }
      return baseColor + ' hover:bg-gray-100 dark:hover:bg-gray-900'
    },
    [projectStatusOptions]
  )

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev)
      if (newSet.has(taskId)) {
        newSet.delete(taskId)
      } else {
        newSet.add(taskId)
      }
      return newSet
    })
  }

  const getIncompleteSubtasks = (task: typeof incompleteTasks[0]) => {
    if (!task.subtasks || !Array.isArray(task.subtasks)) return []
    return task.subtasks.filter((subtask: any) => {
      const status = subtask.status || 'backlog'
      return status !== 'done' && status !== 'completed' && !subtask.isCompleted
    })
  }

  const TASK_STATUS_BADGE_MAP: Record<string, string> = {
    backlog: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
    todo: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    review: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    testing: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    blocked: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  }

  const checkSprintForIncompleteTasks = async (sprintId: string): Promise<Array<{
    _id: string
    title: string
    status: string
    subtasks?: Array<{
      _id?: string
      title: string
      description?: string
      status: string
      isCompleted: boolean
    }>
  }>> => {
    try {
      const response = await fetch(`/api/sprints/${sprintId}`)
      const data = await response.json()

      if (!response.ok || !data.success) {
        return []
      }

      const tasks = data.data?.tasks || []
      return tasks
        .filter((task: any) => !['done', 'completed'].includes(task.status))
        .map((task: any) => ({
          _id: task._id,
          title: task.title,
          status: task.status,
          subtasks: Array.isArray(task.subtasks) ? task.subtasks : []
        }))
    } catch (err) {
      console.error('Failed to check sprint tasks:', err)
      return []
    }
  }

  const incompleteTasksList = useMemo(
    () => sprintTasks.filter(task => !['done', 'completed'].includes(task.status)),
    [sprintTasks]
  )

  // Calculate task counts per status based on project's custom statuses
  const taskBreakdownByStatus = useMemo(() => {
    const breakdown: Array<{ status: string; label: string; count: number; color?: string }> = []

    if (!sprintTasks.length) return breakdown

    // Get all unique statuses from tasks
    const taskStatuses = new Set(sprintTasks.map(task => task.status))

    // For each status in project's configuration, count tasks
    projectStatusOptions.forEach(option => {
      if (taskStatuses.has(option.value)) {
        const count = sprintTasks.filter(task => task.status === option.value).length
        if (count > 0) {
          breakdown.push({
            status: option.value,
            label: option.label,
            count,
            color: option.color
          })
        }
      }
    })

    // Also include any task statuses that aren't in the project config (fallback)
    taskStatuses.forEach(status => {
      if (!projectStatusOptions.find(opt => opt.value === status)) {
        const count = sprintTasks.filter(task => task.status === status).length
        if (count > 0) {
          breakdown.push({
            status,
            label: formatToTitleCase(status),
            count,
            color: DEFAULT_TASK_STATUS_BADGE_MAP[status]
          })
        }
      }
    })

    return breakdown
  }, [sprintTasks, projectStatusOptions])

  const isCompleteConfirmDisabled = useMemo(() => {
    if (completingSprint) return true
    if (!incompleteTasks.length) return false

    // If no tasks are selected, allow completion (will move all to backlog)
    if (selectedTaskIds.size === 0) return false

    // If tasks are selected, require destination selection
    if (completionMode === 'existing') {
      return !selectedTargetSprintId
    }
    return !newSprintForm.name || !newSprintForm.startDate || !newSprintForm.endDate
  }, [completingSprint, incompleteTasks.length, completionMode, selectedTargetSprintId, newSprintForm, selectedTaskIds.size])

  const fetchSprint = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setLoading(true)
      }
      const response = await fetch(`/api/sprints/${sprintId}`)
      const data = await response.json()
      if (data.success) {
        setSprint(data.data)
      } else {
        setError(data.error || 'Failed to fetch sprint')
      }
    } catch (err) {
      setError('Failed to fetch sprint')
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
    }
  }, [sprintId])

  const loadAvailableSprints = useCallback(async (excludeSprintId: string, projectId?: string) => {
    try {
      setAvailableSprintsLoading(true)
      const params = new URLSearchParams({ limit: '200' })
      if (projectId) {
        params.set('project', projectId)
      }
      const response = await fetch(`/api/sprints?${params.toString()}`)
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load sprints')
      }

      const sprintList: SprintOption[] = Array.isArray(data.data) ? data.data : []
      const filtered = sprintList.filter(
        sprintOption =>
          sprintOption._id !== excludeSprintId && ['planning', 'active'].includes(sprintOption.status)
      )

      setAvailableSprints(filtered)
      return filtered
    } catch (err) {
      console.error('Failed to load sprints list:', err)
      setAvailableSprints([])
      notifyError({ title: 'Failed to Load Sprints', message: err instanceof Error ? err.message : 'Failed to load sprints' })
      return []
    } finally {
      setAvailableSprintsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!completeModalOpen) {
      setSelectedTargetSprintId('')
      setCompletionMode('existing')
      setIncompleteTasks([])
      setSelectedTaskIds(new Set())
      setExpandedTasks(new Set())
      return
    }
  }, [completeModalOpen])

  const handleDelete = async () => {
    if (!canDeleteSprint) {
      setActionError('You do not have permission to delete this sprint.')
      notifyError({ title: 'You do not have permission to delete this sprint.' })
      setShowDeleteConfirm(false)
      return
    }
    try {
      setDeleting(true)
      setActionError('')
      const res = await fetch(`/api/sprints/${sprintId}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.success) {
        notifySuccess({ title: 'Sprint deleted successfully' })
        router.push('/sprints')
      } else {
        setActionError(data?.error || 'Failed to delete sprint')
        notifyError({ title: data?.error || 'Failed to delete sprint' })
      }
    } catch (e) {
      setActionError('Failed to delete sprint')
      notifyError({ title: 'Failed to delete sprint' })
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleStartSprint = async () => {
    if (!canStartSprint) {
      setActionError('You do not have permission to start this sprint.')
      notifyError({ title: 'You do not have permission to start this sprint.' })
      return
    }
    if (!hasTasks) {
      setActionError('Add tasks to this sprint before starting it.')
      notifyError({ title: 'Add tasks to this sprint before starting it.' })
      return
    }
    try {
      setStartingSprint(true)
      setActionError('')
      const res = await fetch(`/api/sprints/${sprintId}/start`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to start sprint')
      }
      setSuccessMessage('Sprint started successfully.')
      notifySuccess({ title: 'Sprint started successfully' })
      await fetchSprint({ silent: true })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to start sprint')
      notifyError({ title: err instanceof Error ? err.message : 'Failed to start sprint' })
    } finally {
      setStartingSprint(false)
    }
  }

  const finalizeCompleteSprint = async (targetSprintId?: string, newSprintData?: Sprint) => {
    const options: RequestInit = { method: 'POST' }
    if (targetSprintId || selectedTaskIds.size > 0) {
      options.headers = { 'Content-Type': 'application/json' }
      options.body = JSON.stringify({
        targetSprintId,
        selectedTaskIds: Array.from(selectedTaskIds)
      })
    }

    const res = await fetch(`/api/sprints/${sprintId}/complete`, options)
    const data = await res.json().catch(() => ({}))

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to complete sprint')
    }

    setSuccessMessage('Sprint completed successfully.')
    notifySuccess({ title: 'Sprint completed successfully' })
    setCompleteModalOpen(false)
    setIncompleteTasks([])
    setSelectedTaskIds(new Set())
    setSelectedTargetSprintId('')
    setExpandedTasks(new Set())
    await fetchSprint({ silent: true })
  }

  const handleCompleteSprintClick = async () => {
    if (!sprint) return
    if (!canCompleteSprint) {
      setActionError('You do not have permission to complete this sprint.')
      notifyError({ title: 'You do not have permission to complete this sprint.' })
      return
    }
    if (!hasTasks) {
      setActionError('Add tasks to this sprint before completing it.')
      notifyError({ title: 'Add tasks to this sprint before completing it.' })
      return
    }

    const incomplete = await checkSprintForIncompleteTasks(sprintId)

    if (incomplete.length > 0) {
      setIncompleteTasks(incomplete)
      // Initialize all tasks as selected by default
      setSelectedTaskIds(new Set(incomplete.map(task => task._id)))
      setCompleteModalOpen(true)
      const available = await loadAvailableSprints(sprintId, sprint?.project?._id)

      const baseStart = sprint.endDate ? new Date(sprint.endDate) : new Date()
      const startDate = formatDateInputValue(baseStart)
      const endDateObj = new Date(baseStart)
      endDateObj.setDate(endDateObj.getDate() + 14)
      const endDate = formatDateInputValue(endDateObj)

      // Determine next sprint number
      const currentSprintName = sprint.name
      const sprintNumberMatch = currentSprintName.match(/Sprint (\d+)/)
      let nextSprintNumber = 1

      if (sprintNumberMatch) {
        nextSprintNumber = parseInt(sprintNumberMatch[1]) + 1
      } else {
        // If current sprint doesn't follow "Sprint X" pattern, get total count
        try {
          const countResponse = await fetch('/api/sprints?countOnly=true')
          const countData = await countResponse.json()
          if (countData.success) {
            nextSprintNumber = countData.count + 1
          }
        } catch (err) {
          console.error('Failed to get sprint count:', err)
        }
      }

      const nextSprintName = `Sprint ${nextSprintNumber}`

      // Check if next sprint already exists
      const allSprintsResponse = await fetch('/api/sprints?limit=200')
      const allSprintsData = await allSprintsResponse.json()

      if (allSprintsData.success) {
        const allSprintsList = allSprintsData.data || []
        const nextSprint = allSprintsList.find((s: Sprint) => s.name === nextSprintName)

        if (nextSprint && ['planning', 'active'].includes(nextSprint.status)) {
          // Next sprint exists - auto-select it
          setSelectedTargetSprintId(nextSprint._id)
          setCompletionMode('existing')
        } else {
          // Next sprint doesn't exist - pre-fill create form
          setCompletionMode('new')
        }
      } else if (available.length === 0) {
        // No other available sprints - default to creating a new one
        setCompletionMode('new')
      }

      setNewSprintForm({
        name: nextSprintName,
        startDate,
        endDate,
        capacity: sprint.capacity ? String(sprint.capacity) : ''
      })
      return
    }

    try {
      setCompletingSprint(true)
      setActionError('')
      await finalizeCompleteSprint()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to complete sprint')
      notifyError({ title: err instanceof Error ? err.message : 'Failed to complete sprint' })
    } finally {
      setCompletingSprint(false)
    }
  }

  const handleCompleteModalConfirm = async () => {
    if (!incompleteTasks.length) {
      try {
        setCompletingSprint(true)
        await finalizeCompleteSprint()
      } catch (err) {
        notifyError({ title: 'Failed to Complete Sprint', message: err instanceof Error ? err.message : 'Failed to complete sprint' })
      } finally {
        setCompletingSprint(false)
      }
      return
    }

    // If no tasks are selected, move all to backlog
    if (selectedTaskIds.size === 0) {
      try {
        setCompletingSprint(true)
        await finalizeCompleteSprint() // No targetSprintId means move all to backlog
      } catch (err) {
        notifyError({ title: 'Failed to Complete Sprint', message: err instanceof Error ? err.message : 'Failed to complete sprint' })
      } finally {
        setCompletingSprint(false)
      }
      return
    }

    if (completionMode === 'existing') {
      if (!selectedTargetSprintId) {
        notifyError({ title: 'Sprint Selection Required', message: 'Select a sprint to move the remaining tasks into.' })
        return
      }
      try {
        setCompletingSprint(true)
        await finalizeCompleteSprint(selectedTargetSprintId)
      } catch (err) {
        notifyError({ title: 'Failed to Move Tasks', message: err instanceof Error ? err.message : 'Failed to move tasks to the selected sprint' })
      } finally {
        setCompletingSprint(false)
      }
      return
    }

    if (!newSprintForm.name || !newSprintForm.startDate || !newSprintForm.endDate) {
      notifyError({ title: 'Validation Error', message: 'Provide a name and date range for the new sprint.' })
      return
    }

    if (!sprint?.project?._id) {
      notifyError({ title: 'Project Information Missing', message: 'Sprint project information is missing.' })
      return
    }

    try {
      setCompletingSprint(true)

      let teamMemberIds: string[] = []
      if (sprint.teamMembers && sprint.teamMembers.length > 0) {
        const fullSprintResponse = await fetch(`/api/sprints/${sprintId}`)
        const fullSprintData = await fullSprintResponse.json()
        if (fullSprintResponse.ok && fullSprintData.success) {
          teamMemberIds = (fullSprintData.data?.teamMembers || [])
            .map((m: any) => m._id || m)
            .filter(Boolean)
        } else {
          teamMemberIds = sprint.teamMembers
            .map((m: any) => m._id || m)
            .filter(Boolean)
        }
      }

      const createResponse = await fetch('/api/sprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSprintForm.name,
          description: `Auto-created from completion of ${sprint.name}`,
          project: sprint.project._id,
          startDate: newSprintForm.startDate,
          endDate: newSprintForm.endDate,
          goal: sprint.goal,
          capacity: Number(newSprintForm.capacity) || sprint.capacity,
          teamMembers: teamMemberIds
        })
      })

      const createdSprint = await createResponse.json()
      if (!createResponse.ok || !createdSprint.success) {
        throw new Error(createdSprint.error || 'Failed to create sprint')
      }

      const newSprintId = createdSprint.data?._id
      if (!newSprintId) {
        throw new Error('New sprint ID missing in response')
      }

      // Fetch full sprint details to get all populated fields
      const fullSprintResponse = await fetch(`/api/sprints/${newSprintId}`)
      const fullSprintData = await fullSprintResponse.json()

      let newSprint: Sprint | undefined
      if (fullSprintResponse.ok && fullSprintData.success) {
        newSprint = fullSprintData.data
      } else {
        // Fallback to the created sprint data if fetch fails
        newSprint = createdSprint.data
      }

      await finalizeCompleteSprint(newSprintId, newSprint)
    } catch (err) {
      notifyError({ title: 'Failed to Create Sprint', message: err instanceof Error ? err.message : 'Failed to create sprint' })
    } finally {
      setCompletingSprint(false)
    }
  }

  const handleTaskStatusChange = async (taskId: string, newStatus: string) => {
    try {
      if (!projectStatusOptions.some(option => option.value === newStatus)) {
        notifyError({ title: 'Invalid Status', message: 'Selected status is not available for this project.' })
        return
      }
      setTaskStatusUpdating(taskId)
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update task status')
      }

      setSprint(prev => {
        if (!prev || !prev.tasks) return prev
        const updatedTasks = prev.tasks.map(task =>
          task._id === taskId ? { ...task, status: newStatus } : task
        )
        const updatedProgress = buildProgressFromTasks(updatedTasks, prev.progress) || prev.progress
        return {
          ...prev,
          tasks: updatedTasks,
          taskSummary: buildTaskSummaryFromTasks(updatedTasks),
          progress: updatedProgress
        }
      })
      notifySuccess({ title: 'Task status updated' })
    } catch (err) {
      notifyError({ title: 'Failed to Update Task', message: err instanceof Error ? err.message : 'Failed to update task status' })
    } finally {
      setTaskStatusUpdating(null)
    }
  }

  const SPRINT_STATUS_BADGE: Record<string, { bg: string; text: string; dot: string; border: string }> = {
    planning:  { bg: 'bg-blue-50 dark:bg-blue-950/30',     text: 'text-blue-600 dark:text-blue-400',     dot: 'bg-blue-500',    border: 'border-blue-200 dark:border-blue-800' },
    active:    { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800' },
    completed: { bg: 'bg-gray-50 dark:bg-gray-900/40',     text: 'text-gray-500 dark:text-gray-400',     dot: 'bg-gray-400',    border: 'border-gray-200 dark:border-gray-700' },
    cancelled: { bg: 'bg-red-50 dark:bg-red-950/30',       text: 'text-red-600 dark:text-red-400',       dot: 'bg-red-500',     border: 'border-red-200 dark:border-red-800' },
  }

  const renderStatusChip = (cfg: Record<string, { bg: string; text: string; dot: string; border: string }>, key: string, label: string) => {
    const c = cfg[key] ?? { bg: 'bg-gray-50', text: 'text-gray-500', dot: 'bg-gray-400', border: 'border-gray-200' }
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-medium ${c.bg} ${c.text} ${c.border}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
        {label}
      </span>
    )
  }

  const getDaysRemaining = () => {
    if (!sprint) return 0
    const now = new Date()
    const endDate = new Date(sprint?.endDate)
    const diffTime = endDate.getTime() - now.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-[var(--apple-system-blue)]" />
            <p className="text-[15px] text-[var(--apple-secondary-label)]">Loading sprint…</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error || !sprint) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <XCircle className="h-12 w-12 text-[var(--apple-system-red)]" />
          <h2 className="text-[22px] font-semibold text-[var(--apple-label)]">{error || 'Sprint not found'}</h2>
          <Button
            onClick={() => router.back()}
            className="rounded-full bg-[var(--apple-system-blue)] text-white text-[15px] font-semibold px-5 h-9 hover:opacity-90 apple-transition"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6 overflow-x-hidden animate-in fade-in-0 duration-300">

        {/* ── Page Header ─────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-1.5 text-[14px] text-[var(--apple-secondary-label)] hover:text-[var(--apple-system-blue)] apple-transition font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
              <Zap className="h-8 w-8 flex-shrink-0" style={{ color: 'var(--apple-card-gradient)' }} />
              <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-[var(--apple-label)] leading-tight min-w-0">{sprint.name}</h1>
            </div>

            <div className="flex flex-col gap-2 flex-shrink-0">
              {((sprint.status === 'planning' && canStartSprint) || (sprint.status === 'active' && canCompleteSprint)) && (
                <div className="flex items-center gap-2 justify-end">
                  {sprint.status === 'planning' && canStartSprint && (
                    <button
                      onClick={handleStartSprint}
                      disabled={startingSprint}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full text-white text-[13px] font-semibold px-4 h-9 hover:opacity-90 apple-transition disabled:opacity-40"
                      style={{ background: 'linear-gradient(90deg,#34C759 0%,#30D158 100%)' }}
                    >
                      {startingSprint ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      {startingSprint ? 'Starting…' : 'Start Sprint'}
                    </button>
                  )}
                  {sprint.status === 'active' && canCompleteSprint && (
                    <button
                      onClick={handleCompleteSprintClick}
                      disabled={completingSprint}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full text-white text-[13px] font-semibold px-4 h-9 hover:opacity-90 apple-transition disabled:opacity-40"
                      style={{ background: 'linear-gradient(90deg,#34C759 0%,#30D158 100%)' }}
                    >
                      {completingSprint ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
                      {completingSprint ? 'Completing…' : 'Complete Sprint'}
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                {canEditSprint && (
                  <button
                    onClick={() => router.push(`/sprints/${sprintId}/edit`)}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-full text-white text-[13px] font-semibold px-4 h-9 hover:opacity-90 apple-transition disabled:opacity-40"
                    style={{ background: 'var(--apple-card-gradient)' }}
                  >
                    <Edit className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
                {canDeleteSprint && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--apple-system-red)]/40 bg-[var(--apple-system-red)]/10 text-[var(--apple-system-red)] text-[13px] font-medium px-4 h-9 hover:bg-[var(--apple-system-red)]/20 apple-transition disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Main Grid ───────────────────────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3">

          {/* Left column — main content */}
          <div className="lg:col-span-2 space-y-5">

            {/* Description */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Description</h2>
              </div>
              <div className="px-5 py-4">
                {sprint.description ? (() => {
                  const isHtml = /<(p|br|div|ul|ol|li|strong|em|u|h[1-6]|img|a)(\s|>|\/)/i.test(sprint.description)
                  return isHtml
                    ? <div className="task-description max-w-none" dangerouslySetInnerHTML={{ __html: sprint.description }} />
                    : <div className="task-description text-[15px] text-[var(--apple-label)] whitespace-pre-line leading-relaxed">{sprint.description}</div>
                })() : (
                  <p className="text-[15px] text-[var(--apple-tertiary-label)]">No description provided.</p>
                )}
              </div>
            </div>

            {/* Sprint Goal */}
            {sprint.goal && (
              <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                  <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Sprint Goal</h2>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[15px] text-[var(--apple-label)] whitespace-pre-line leading-relaxed">{sprint.goal}</p>
                </div>
              </div>
            )}

            {/* Progress */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Progress</h2>
                <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">
                  {sprint.progress?.totalTasks
                    ? `${sprint.progress.tasksCompleted} of ${sprint.progress.totalTasks} tasks completed`
                    : 'No tasks have been assigned to this sprint yet.'}
                </p>
              </div>
              <div className="px-5 py-4 space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-[var(--apple-secondary-label)]">Overall Progress</span>
                    <span className="font-semibold font-apple-mono text-[var(--apple-label)]">{sprint.progress?.completionPercentage || 0}%</span>
                  </div>
                  <div className="mt-2 h-[6px] rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(0, sprint.progress?.completionPercentage || 0))}%`,
                        background: 'linear-gradient(90deg,#34C759 0%,#30D158 100%)'
                      }}
                    />
                  </div>
                </div>

                {sprint.progress?.totalTasks ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] p-3">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-[var(--apple-secondary-label)]">
                          <span>Tasks Completed</span>
                          <CheckCircle className="h-3.5 w-3.5 text-[var(--apple-system-green)]" />
                        </div>
                        <p className="mt-2 text-[17px] font-semibold font-apple-mono text-[var(--apple-label)]">
                          {sprint.progress.tasksCompleted} / {sprint.progress.totalTasks}
                        </p>
                      </div>
                      <div className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] p-3">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-[var(--apple-secondary-label)]">
                          <span>Story Points Burned</span>
                          <BarChart3 className="h-3.5 w-3.5 text-[var(--apple-system-blue)]" />
                        </div>
                        <p className="mt-2 text-[17px] font-semibold font-apple-mono text-[var(--apple-label)]">
                          {sprint.progress.storyPointsCompleted || 0} / {sprint.progress.totalStoryPoints || 0}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] p-3">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-[var(--apple-secondary-label)]">
                          <span>Estimated Hours</span>
                          <Clock className="h-3.5 w-3.5" style={{ color: 'var(--apple-card-gradient)' }} />
                        </div>
                        <p className="mt-2 text-[17px] font-semibold font-apple-mono text-[var(--apple-label)]">
                          {sprint.progress.estimatedHours || 0}
                        </p>
                        <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-1">
                          {Math.max((sprint.progress.estimatedHours || 0) - (sprint.progress.actualHours || 0), 0)}h remaining
                        </p>
                      </div>
                      <div className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] p-3">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-[var(--apple-secondary-label)]">
                          <span>Actual Hours</span>
                          <Gauge className="h-3.5 w-3.5 text-[var(--apple-system-orange)]" />
                        </div>
                        <p className="mt-2 text-[17px] font-semibold font-apple-mono text-[var(--apple-label)]">
                          {sprint.progress.actualHours || 0}
                        </p>
                        <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-1">
                          {(sprint.progress.actualHours || 0) > (sprint.progress.estimatedHours || 0)
                            ? 'Over capacity'
                            : 'On track'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <p className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">Task Breakdown</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <div className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-3 py-2">
                          <div className="flex items-center justify-between text-[11px] text-[var(--apple-secondary-label)]">
                            <span>Total</span>
                            <List className="h-3.5 w-3.5" />
                          </div>
                          <p className="mt-1 text-[15px] font-semibold font-apple-mono text-[var(--apple-label)]">{sprintTasks.length}</p>
                        </div>
                        {taskBreakdownByStatus.map(({ status, label, count, color }) => (
                          <div key={status} className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-3 py-2">
                            <div className="flex items-center justify-between text-[11px] text-[var(--apple-secondary-label)]">
                              <span className="truncate">{label}</span>
                              <Badge className={`${color || DEFAULT_TASK_STATUS_BADGE_MAP[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'} h-3.5 px-1.5 text-[10px] [&:hover]:!bg-[inherit]`}>
                                {count}
                              </Badge>
                            </div>
                            <p className="mt-1 text-[15px] font-semibold font-apple-mono text-[var(--apple-label)]">{count}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Sprint Tasks */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Sprint Tasks</h2>
                <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">
                  {sprintTasks.length} task{sprintTasks.length === 1 ? '' : 's'} {sprint.status === 'completed' ? '(including completed and spillover tasks)' : ''}
                </p>
              </div>
              <div className="px-5 py-4">
                {sprintTasks.length === 0 ? (
                  <p className="text-[15px] text-[var(--apple-tertiary-label)]">
                    No tasks {sprint.status === 'completed' ? 'were' : 'are currently'} assigned to this sprint.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    {paginatedSprintTasks.map(task => (
                      <div
                        key={task._id}
                        onClick={() => router.push(`/tasks/${task._id}`)}
                        className={`rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4 space-y-3 cursor-pointer hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)] hover:-translate-y-0.5 apple-transition ${task.archived ? 'border-dashed opacity-90' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {task?.displayId && (
                                <span className="font-apple-mono text-[11px] font-semibold px-2 py-0.5 rounded-full border border-[var(--apple-separator)] text-[var(--apple-secondary-label)]">#{task.displayId}</span>
                              )}
                              <h4 className="text-[14px] font-semibold text-[var(--apple-label)] truncate flex-1" title={task.title}>
                                {task?.title || 'Untitled Task'}
                              </h4>
                            </div>
                            <p className="text-[12px] text-[var(--apple-tertiary-label)]">
                              {(() => {
                                if (!task?.assignedTo || !Array.isArray(task.assignedTo) || task.assignedTo.length === 0) {
                                  return 'Unassigned';
                                }

                                if (task.assignedTo.length === 1) {
                                  // Handle both string (user ID) and object formats for backward compatibility
                                  const assignee = task.assignedTo[0];
                                  if (typeof assignee === 'string') {
                                    return `Assigned to 1 person`;
                                  } else {
                                    // Legacy object format
                                    const firstName = assignee?.user?.firstName || assignee?.firstName || '';
                                    const lastName = assignee?.user?.lastName || assignee?.lastName || '';
                                    const displayName = `${firstName} ${lastName}`.trim();
                                    return displayName || 'Unknown User';
                                  }
                                } else {
                                  return `Assigned to ${task.assignedTo.length} people`;
                                }
                              })()}
                            </p>
                            {task.movedToSprint && (
                              <p className="text-[12px] font-medium text-orange-600 dark:text-orange-400 mt-1">
                                Moved to: {task.movedToSprint.name}
                              </p>
                            )}
                            {task.movedToBacklog && (
                              <p className="text-[12px] font-medium text-orange-600 dark:text-orange-400 mt-1">
                                Moved to backlog
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--apple-separator)] text-[12px] font-medium text-[var(--apple-secondary-label)] uppercase">
                            {formatToTitleCase(task.priority)}
                          </span>
                          {task.archived && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--apple-quaternary-fill)] text-[12px] font-medium text-[var(--apple-secondary-label)] uppercase">
                              Archived
                            </span>
                          )}
                          {task.movedToSprint && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 text-[12px] font-medium text-orange-700 dark:text-orange-400">
                              Spillover
                            </span>
                          )}
                          {task.movedToBacklog && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 text-[12px] font-medium text-orange-700 dark:text-orange-400">
                              Backlog
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-medium ${getTaskStatusBadgeClass(task.status)}`}>
                            {formatTaskStatusLabel(task.status)}
                          </span>
                        </div>

                        {!task.movedToSprint && !task.movedToBacklog && (
                          <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                            <Label className="text-[12px] text-[var(--apple-secondary-label)]">Status</Label>
                            <Select
                              value={task.status}
                              onValueChange={(value) => handleTaskStatusChange(task._id, value)}
                              disabled={taskStatusUpdating === task._id || task.archived}
                            >
                              <SelectTrigger className="text-[13px] rounded-[var(--apple-radius-md)] border-[var(--apple-separator)]">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                              <SelectContent>
                                {projectStatusOptions.map(option => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {task.archived && (
                              <p className="text-[12px] text-[var(--apple-tertiary-label)]">
                                This task is archived and no longer appears on active boards.
                              </p>
                            )}
                          </div>
                        )}
                        {task.movedToSprint && (
                          <div className="rounded-[var(--apple-radius-md)] border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 p-2">
                            <p className="text-[12px] text-[var(--apple-secondary-label)]">
                              This task has been moved to <span className="font-medium text-orange-700 dark:text-orange-400">{task.movedToSprint.name}</span>
                            </p>
                          </div>
                        )}
                        {task.movedToBacklog && (
                          <div className="rounded-[var(--apple-radius-md)] border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 p-2">
                            <p className="text-[12px] text-[var(--apple-secondary-label)]">
                              This task has been moved to <span className="font-medium text-orange-700 dark:text-orange-400">backlog</span>
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination Controls */}
                {sprintTasks.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t border-[var(--apple-separator)]">
                    <div className="flex items-center gap-2 text-[13px] text-[var(--apple-secondary-label)]">
                      <span>Items per page:</span>
                      <select
                        value={sprintTasksPageSize}
                        onChange={(e) => {
                          setSprintTasksPageSize(parseInt(e.target.value))
                          setSprintTasksCurrentPage(1)
                        }}
                        className="px-2 py-1 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] text-[13px] bg-[var(--apple-quaternary-fill)]"
                      >
                        <option value="5">5</option>
                        <option value="10">10</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                      </select>
                      <span>
                        Showing {((sprintTasksCurrentPage - 1) * sprintTasksPageSize) + 1} to {Math.min(sprintTasksCurrentPage * sprintTasksPageSize, sprintTasks.length)} of {sprintTasks.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setSprintTasksCurrentPage(sprintTasksCurrentPage - 1)}
                        disabled={sprintTasksCurrentPage === 1}
                        className="h-8 px-3 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition disabled:opacity-40"
                      >
                        Previous
                      </button>
                      <span className="text-[13px] text-[var(--apple-secondary-label)] font-apple-mono px-1">
                        {sprintTasksCurrentPage}/{sprintTasksTotalPages || 1}
                      </span>
                      <button
                        onClick={() => setSprintTasksCurrentPage(sprintTasksCurrentPage + 1)}
                        disabled={sprintTasksCurrentPage >= sprintTasksTotalPages}
                        className="h-8 px-3 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[13px] text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right Sidebar ──────────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Details */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">Details</h2>
              </div>
              <div className="px-5 py-1 divide-y divide-[var(--apple-separator)]">
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Status</span>
                  {renderStatusChip(SPRINT_STATUS_BADGE, sprint.status, formatToTitleCase(sprint.status))}
                </div>

                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Project</span>
                  <span
                    className="text-[13px] font-medium text-[var(--apple-label)] truncate max-w-[160px]"
                    title={sprint.project?.name}
                  >
                    {sprint.project?.name || '—'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Duration</span>
                  <span className="text-[13px] font-apple-mono font-medium text-[var(--apple-label)]">
                    {Math.ceil((new Date(sprint.endDate).getTime() - new Date(sprint.startDate).getTime()) / (1000 * 60 * 60 * 24))} days
                  </span>
                </div>

                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Start Date</span>
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--apple-label)]">
                    <Calendar className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" />
                    {formatDate(sprint.startDate)}
                  </div>
                </div>

                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">End Date</span>
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--apple-label)]">
                    <Calendar className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" />
                    {formatDate(sprint.endDate)}
                  </div>
                </div>

                {getDaysRemaining() > 0 && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">Days Remaining</span>
                    <span className="text-[13px] font-apple-mono font-semibold text-[var(--apple-system-orange)]">{getDaysRemaining()}</span>
                  </div>
                )}

                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Capacity</span>
                  <span className="text-[13px] font-apple-mono font-medium text-[var(--apple-label)]">{sprint.capacity}h</span>
                </div>

                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Velocity</span>
                  <span className="text-[13px] font-apple-mono font-medium text-[var(--apple-label)]">{sprint.velocity}</span>
                </div>
              </div>
            </div>

            {/* Team Members */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">Team Members</h2>
                <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">{sprint.teamMembers?.length || 0} members</p>
              </div>
              <div className="px-5 py-3 space-y-2.5">
                {sprint.teamMembers && sprint.teamMembers.length > 0 ? sprint.teamMembers.map((member, index) => {
                  const displayName = `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Unknown User'
                  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
                  return (
                    <div key={member._id || index} className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-[13px] select-none"
                        style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 1px 4px var(--apple-chart-glow)' }}>
                        {initials}
                      </div>
                      <span className="text-[13px] text-[var(--apple-label)] font-medium leading-tight">{displayName}</span>
                    </div>
                  )
                }) : (
                  <p className="text-[13px] text-[var(--apple-tertiary-label)]">No team members assigned.</p>
                )}
              </div>
            </div>

            {/* Created By */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">Created By</h2>
              </div>
              <div className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-[13px] select-none"
                    style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 1px 4px var(--apple-chart-glow)' }}>
                    {`${sprint.createdBy?.firstName || ''} ${sprint.createdBy?.lastName || ''}`.trim().split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || <User className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-[var(--apple-label)] leading-tight">
                      {sprint.createdBy?.firstName} {sprint.createdBy?.lastName}
                    </p>
                    <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">{formatDate(sprint.createdAt)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
        <ConfirmationModal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          title="Delete Sprint"
          description="Are you sure you want to delete this sprint? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          variant="destructive"
          isLoading={deleting}
        />

        <ResponsiveDialog
          open={completeModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              setCompleteModalOpen(false)
              setSelectedTargetSprintId('')
              setCompletionMode('existing')
              setIncompleteTasks([])
              setSelectedTaskIds(new Set())
              setExpandedTasks(new Set())
              return
            }
            setCompleteModalOpen(true)
          }}
          title="Complete Sprint"
          description={
            incompleteTasks.length
              ? `There are ${incompleteTasks.length} incomplete task${incompleteTasks.length === 1 ? '' : 's'
              }. Move them before completing the sprint.`
              : 'All tasks are completed. You can finish the sprint now.'
          }
          footer={
            <div className="flex flex-col sm:flex-row sm:justify-end gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => setCompleteModalOpen(false)}
                disabled={completingSprint}
              >
                Cancel
              </Button>
              {incompleteTasks.length > 0 && selectedTaskIds.size === 0 ? (
                <Button
                  onClick={handleCompleteModalConfirm}
                  disabled={completingSprint}
                >
                  {completingSprint ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Move Tasks to backlog and Complete Sprint
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleCompleteModalConfirm}
                  disabled={isCompleteConfirmDisabled}
                >
                  {completingSprint ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Complete Sprint
                    </>
                  )}
                </Button>
              )}
            </div>
          }
        >
          <div className="space-y-4">
            {incompleteTasks.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium text-foreground">
                      Incomplete Tasks
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (selectedTaskIds.size === incompleteTasks.length) {
                          // Deselect all
                          setSelectedTaskIds(new Set())
                        } else {
                          // Select all
                          setSelectedTaskIds(new Set(incompleteTasks.map(t => t._id)))
                        }
                      }}
                      className="h-7 text-xs"
                    >
                      {selectedTaskIds.size === incompleteTasks.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Select tasks to move to the next sprint. Unselected tasks will return to backlog.
                  </p>
                  <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1">
                    {incompleteTasks.map(task => {
                      const incompleteSubtasks = getIncompleteSubtasks(task)
                      const hasIncompleteSubtasks = incompleteSubtasks.length > 0
                      const isExpanded = expandedTasks.has(task._id)
                      const isSelected = selectedTaskIds.has(task._id)

                      return (
                        <div key={task._id} className={`rounded-md border px-3 py-2 space-y-2 transition-colors ${isSelected ? 'bg-muted/40 border-primary/30' : 'bg-muted/20 border-muted'
                          }`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const newSelected = new Set(selectedTaskIds)
                                  if (e.target.checked) {
                                    newSelected.add(task._id)
                                  } else {
                                    newSelected.delete(task._id)
                                  }
                                  setSelectedTaskIds(newSelected)
                                }}
                                className="rounded flex-shrink-0 cursor-pointer"
                              />
                              {hasIncompleteSubtasks && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleTaskExpansion(task._id)
                                  }}
                                  className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-all hover:scale-110 active:scale-95 p-0.5 rounded hover:bg-muted/50"
                                  aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                                  title={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 transition-transform" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 transition-transform" />
                                  )}
                                </button>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate" title={task.title}>
                                  {task.title}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Current status: {formatTaskStatusLabel(task.status)}
                                </p>
                                {hasIncompleteSubtasks && (
                                  <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mt-1">
                                    {incompleteSubtasks.length} incomplete sub-task{incompleteSubtasks.length === 1 ? '' : 's'}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          {isExpanded && hasIncompleteSubtasks && (
                            <div className="ml-6 space-y-2 border-l-2 border-primary/20 dark:border-primary/30 pl-3 pt-1 overflow-hidden transition-all duration-300 ease-in-out">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                Incomplete Sub-tasks
                              </p>
                              <div className="space-y-2">
                                {incompleteSubtasks.map((subtask: any, index: number) => (
                                  <div
                                    key={subtask._id || `subtask-${index}`}
                                    className="rounded-md border p-2.5 space-y-1.5 transition-all hover:shadow-sm bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-start gap-2 flex-1 min-w-0">
                                        <AlertTriangle className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-medium text-foreground" title={subtask.title}>
                                            {subtask.title}
                                          </p>
                                          {subtask.description && (
                                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                              {subtask.description}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      <Badge
                                        className={`${TASK_STATUS_BADGE_MAP[subtask.status] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                                          } text-[10px] flex-shrink-0`}
                                      >
                                        {formatTaskStatusLabel(subtask.status)}
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {selectedTaskIds.size === 0 ? (
                  // No tasks selected - show "Move to backlog" option

                  <p className="text-xs text-muted-foreground">
                    All incomplete tasks will be moved to the backlog.
                  </p>
                ) : (
                  // Some tasks selected - show existing/new sprint options
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={completionMode === 'existing' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setCompletionMode('existing')
                          setSelectedTargetSprintId('')
                        }}
                        disabled={availableSprintsLoading || availableSprints.length === 0}
                      >
                        Move to Next Sprint
                      </Button>
                      <Button
                        type="button"
                        variant={completionMode === 'new' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setCompletionMode('new')
                        }}
                      >
                        Create New Sprint
                      </Button>
                    </div>

                    {completionMode === 'existing' ? (
                      <div className="space-y-2">
                        <Label className="text-sm text-foreground">Select Sprint</Label>
                        <Select
                          value={selectedTargetSprintId}
                          onValueChange={(value) => setSelectedTargetSprintId(value)}
                          disabled={availableSprintsLoading || availableSprints.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={availableSprintsLoading ? 'Loading...' : 'Choose sprint'} />
                          </SelectTrigger>
                          <SelectContent>
                            {availableSprintsLoading ? (
                              <div className="px-2 py-1 text-sm text-muted-foreground">
                                Loading sprints...
                              </div>
                            ) : availableSprints.length === 0 ? (
                              <div className="px-2 py-1 text-sm text-muted-foreground">
                                No planning or active sprints available. Create a new sprint instead.
                              </div>
                            ) : (
                              availableSprints.map(option => (
                                <SelectItem key={option._id} value={option._id}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{option.name}</span>
                                    {option.project?.name && (
                                      <span className="text-xs text-muted-foreground">
                                        Project: {option.project.name}
                                      </span>
                                    )}
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Label className="text-sm text-foreground">Sprint Name</Label>
                          <Input
                            value={newSprintForm.name}
                            onChange={(event) =>
                              setNewSprintForm(prev => ({ ...prev, name: event.target.value }))
                            }
                            placeholder="Sprint name"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-sm text-foreground">Start Date</Label>
                            <Input
                              type="date"
                              value={newSprintForm.startDate}
                              onChange={(event) =>
                                setNewSprintForm(prev => ({ ...prev, startDate: event.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-sm text-foreground">End Date</Label>
                            <Input
                              type="date"
                              value={newSprintForm.endDate}
                              onChange={(event) =>
                                setNewSprintForm(prev => ({ ...prev, endDate: event.target.value }))
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-sm text-foreground">Capacity (hours)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={newSprintForm.capacity}
                            onChange={(event) =>
                              setNewSprintForm(prev => ({ ...prev, capacity: event.target.value }))
                            }
                            placeholder="Team capacity"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                All tasks in this sprint are completed. You can finish the sprint immediately.
              </p>
            )}
          </div>
        </ResponsiveDialog>
    </MainLayout>
  )
}
