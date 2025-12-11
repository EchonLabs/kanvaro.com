'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { useProjectKanbanStatuses } from '@/hooks/useProjectKanbanStatuses'
import { DEFAULT_TASK_STATUS_OPTIONS, DEFAULT_TASK_STATUS_BADGE_MAP, type TaskStatusOption } from '@/constants/taskStatuses'
import {
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  Play,
  XCircle,
  Target,
  BarChart3,
  User,
  Loader2,
  Edit,
  Trash2,
  Users,
  TrendingUp,
  List,
  PauseCircle,
  Gauge,
  Zap,
  ChevronDown,
  ChevronRight
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
    status: string
    storyPoints: number
    estimatedHours: number
    actualHours: number
    priority: string
    type: string
    assignedTo: {
      _id: string
      firstName: string
      lastName: string
      email: string
    } | null
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
  const router = useRouter()
  const params = useParams()
  const sprintId = params.id as string

  const [sprint, setSprint] = useState<Sprint | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
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
  const [selectedTargetSprintId, setSelectedTargetSprintId] = useState('')
  const [completeError, setCompleteError] = useState('')
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
  const [taskStatusError, setTaskStatusError] = useState('')
  const { getStatusesForProject } = useProjectKanbanStatuses()

  useEffect(() => {
    if (!successMessage) return
    const timeout = setTimeout(() => setSuccessMessage(''), 3000)
    return () => clearTimeout(timeout)
  }, [successMessage])

  const sprintTasks = sprint?.tasks || []

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

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')

      if (response.ok) {
        setAuthError('')
        await fetchSprint()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })

        if (refreshResponse.ok) {
          setAuthError('')
          await fetchSprint()
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
  }, [router, fetchSprint])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const loadAvailableSprints = useCallback(async (excludeSprintId: string) => {
    try {
      setAvailableSprintsLoading(true)
      const response = await fetch('/api/sprints?limit=200')
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
    } catch (err) {
      console.error('Failed to load sprints list:', err)
      setAvailableSprints([])
      setCompleteError(err instanceof Error ? err.message : 'Failed to load sprints')
    } finally {
      setAvailableSprintsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!completeModalOpen) {
      setCompleteError('')
      setSelectedTargetSprintId('')
      setCompletionMode('existing')
      setIncompleteTasks([])
      setSelectedTaskIds(new Set())
      setExpandedTasks(new Set())
      return
    }
  }, [completeModalOpen])

  const handleDelete = async () => {
    try {
      setDeleting(true)
      setActionError('')
      const res = await fetch(`/api/sprints/${sprintId}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.success) {
        router.push('/sprints')
      } else {
        setActionError(data?.error || 'Failed to delete sprint')
      }
    } catch (e) {
      setActionError('Failed to delete sprint')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleStartSprint = async () => {
    try {
      setStartingSprint(true)
      setActionError('')
      const res = await fetch(`/api/sprints/${sprintId}/start`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to start sprint')
      }
      setSuccessMessage('Sprint started successfully.')
      await fetchSprint({ silent: true })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to start sprint')
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
    setCompleteModalOpen(false)
    setIncompleteTasks([])
    setSelectedTaskIds(new Set())
    setSelectedTargetSprintId('')
    setCompleteError('')
    setExpandedTasks(new Set())
    await fetchSprint({ silent: true })
  }

  const handleCompleteSprintClick = async () => {
    if (!sprint) return

    const incomplete = await checkSprintForIncompleteTasks(sprintId)

    if (incomplete.length > 0) {
      setIncompleteTasks(incomplete)
      // Initialize all tasks as selected by default
      setSelectedTaskIds(new Set(incomplete.map(task => task._id)))
      setCompleteModalOpen(true)
      await loadAvailableSprints(sprintId)

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
        setCompleteError(err instanceof Error ? err.message : 'Failed to complete sprint')
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
        setCompleteError(err instanceof Error ? err.message : 'Failed to complete sprint')
      } finally {
        setCompletingSprint(false)
      }
      return
    }

    if (completionMode === 'existing') {
      if (!selectedTargetSprintId) {
        setCompleteError('Select a sprint to move the remaining tasks into.')
        return
      }
      try {
        setCompletingSprint(true)
        await finalizeCompleteSprint(selectedTargetSprintId)
      } catch (err) {
        setCompleteError(err instanceof Error ? err.message : 'Failed to move tasks to the selected sprint')
      } finally {
        setCompletingSprint(false)
      }
      return
    }

    if (!newSprintForm.name || !newSprintForm.startDate || !newSprintForm.endDate) {
      setCompleteError('Provide a name and date range for the new sprint.')
      return
    }

    if (!sprint?.project?._id) {
      setCompleteError('Sprint project information is missing.')
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
      setCompleteError(err instanceof Error ? err.message : 'Failed to create sprint')
    } finally {
      setCompletingSprint(false)
    }
  }

  const handleTaskStatusChange = async (taskId: string, newStatus: string) => {
    try {
      if (!projectStatusOptions.some(option => option.value === newStatus)) {
        setTaskStatusError('Selected status is not available for this project.')
        return
      }
      setTaskStatusUpdating(taskId)
      setTaskStatusError('')
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
    } catch (err) {
      setTaskStatusError(err instanceof Error ? err.message : 'Failed to update task status')
    } finally {
      setTaskStatusUpdating(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planning': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      case 'completed': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'planning': return <Calendar className="h-4 w-4" />
      case 'active': return <Play className="h-4 w-4" />
      case 'completed': return <CheckCircle className="h-4 w-4" />
      case 'cancelled': return <XCircle className="h-4 w-4" />
      default: return <Calendar className="h-4 w-4" />
    }
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
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading sprint...</p>
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

  if (error || !sprint) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive mb-4">{error || 'Sprint not found'}</p>
            <Button onClick={() => router.push('/sprints')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Sprints
            </Button>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-8 sm:space-y-10 lg:space-y-12 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto min-w-0">
            <Button variant="ghost" onClick={() => router.push('/sprints')} className="w-full sm:w-auto flex-shrink-0">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex-1 min-w-0 w-full sm:w-auto">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground flex items-center space-x-2 min-w-0">
                <Zap className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 text-blue-600 flex-shrink-0" />
                <span className="truncate min-w-0" title={sprint?.name}>{sprint?.name}</span>
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Sprint Details</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto flex-shrink-0">
            <Button variant="outline" onClick={() => router.push(`/sprints/${sprintId}/edit`)} className="w-full sm:w-auto">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)} disabled={deleting} className="w-full sm:w-auto">
              <Trash2 className="h-4 w-4 mr-2" />
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
            {sprint.status === 'planning' && (
              <Button
                onClick={handleStartSprint}
                disabled={startingSprint}
                className="w-full sm:w-auto"
              >
                {startingSprint ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {startingSprint ? 'Starting...' : 'Start Sprint'}
              </Button>
            )}
            {sprint.status === 'active' && (
              <Button
                onClick={handleCompleteSprintClick}
                disabled={completingSprint}
                className="w-full sm:w-auto"
              >
                {completingSprint ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                {completingSprint ? 'Completing...' : 'Complete Sprint'}
              </Button>
            )}
          </div>
        </div>

        {actionError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert variant="success">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-8 grid-cols-1 md:grid-cols-3">
          <div className="md:col-span-2 space-y-8">
            <Card className="overflow-x-hidden">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Description</CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <p className="text-sm sm:text-base text-muted-foreground break-words">
                  {sprint?.description || 'No description provided'}
                </p>
              </CardContent>
            </Card>

            {sprint?.goal && (
              <Card className="overflow-x-hidden">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base sm:text-lg">Sprint Goal</CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0">
                  <p className="text-sm sm:text-base text-muted-foreground break-words">{sprint?.goal}</p>
                </CardContent>
              </Card>
            )}

            <Card className="overflow-x-hidden">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Progress</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {sprint?.progress?.totalTasks
                    ? `${sprint.progress.tasksCompleted} of ${sprint.progress.totalTasks} tasks completed`
                    : 'No tasks have been assigned to this sprint yet.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-muted-foreground">Overall Progress</span>
                    <span className="font-medium">{sprint?.progress?.completionPercentage || 0}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 sm:h-2 overflow-hidden">
                    <div
                      className="bg-blue-600 dark:bg-blue-500 h-1.5 sm:h-2 rounded-full transition-all duration-300 ease-out"
                      style={{
                        width: `${Math.min(100, Math.max(0, sprint?.progress?.completionPercentage || 0))}%`,
                        minWidth: sprint?.progress?.completionPercentage && sprint.progress.completionPercentage > 0 ? '2px' : '0'
                      }}
                    />
                  </div>
                </div>

                {!sprint?.progress?.totalTasks && (
                  <Alert variant="default" className="border-dashed border-muted-foreground/40 bg-muted/40">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs sm:text-sm">
                      Assign tasks to this sprint to start tracking progress, story points, and burn-down metrics.
                    </AlertDescription>
                  </Alert>
                )}

                {sprint?.progress?.totalTasks ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <div className="rounded-lg border bg-background p-3">
                        <div className="flex items-center justify-between text-xs uppercase text-muted-foreground tracking-wide">
                          <span>Tasks Completed</span>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        </div>
                        <p className="mt-2 text-lg font-semibold">
                          {sprint.progress.tasksCompleted} / {sprint.progress.totalTasks}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background p-3">
                        <div className="flex items-center justify-between text-xs uppercase text-muted-foreground tracking-wide">
                          <span>Story Points Burned</span>
                          <BarChart3 className="h-4 w-4 text-blue-500" />
                        </div>
                        <p className="mt-2 text-lg font-semibold">
                          {sprint.progress.storyPointsCompleted || 0} / {sprint.progress.totalStoryPoints || 0}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-lg border bg-background p-3">
                        <div className="flex items-center justify-between text-xs uppercase text-muted-foreground tracking-wide">
                          <span>Estimated Hours</span>
                          <Clock className="h-4 w-4 text-primary" />
                        </div>
                        <p className="mt-2 text-lg font-semibold">
                          {sprint.progress.estimatedHours || 0}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {Math.max((sprint.progress.estimatedHours || 0) - (sprint.progress.actualHours || 0), 0)}h remaining
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background p-3">
                        <div className="flex items-center justify-between text-xs uppercase text-muted-foreground tracking-wide">
                          <span>Actual Hours</span>
                          <Gauge className="h-4 w-4 text-orange-500" />
                        </div>
                        <p className="mt-2 text-lg font-semibold">
                          {sprint.progress.actualHours || 0}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(sprint.progress.actualHours || 0) > (sprint.progress.estimatedHours || 0)
                            ? 'Over capacity'
                            : 'On track'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Task Breakdown</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {/* Total card */}
                        <div className="rounded-md border bg-background px-3 py-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Total</span>
                            <List className="h-3.5 w-3.5" />
                          </div>
                          <p className="mt-1 text-base font-semibold">{sprintTasks.length}</p>
                        </div>
                        {/* Dynamic status cards based on project's custom statuses */}
                        {taskBreakdownByStatus.map(({ status, label, count, color }) => (
                          <div key={status} className="rounded-md border bg-background px-3 py-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="truncate">{label}</span>
                              <Badge className={`${color || DEFAULT_TASK_STATUS_BADGE_MAP[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'} h-3.5 px-1.5 text-[10px] [&:hover]:!bg-[inherit]`}>
                                {count}
                              </Badge>
                            </div>
                            <p className="mt-1 text-base font-semibold">{count}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="overflow-x-hidden">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Sprint Tasks</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {sprintTasks.length} task{sprintTasks.length === 1 ? '' : 's'} {sprint?.status === 'completed' ? '(including completed and spillover tasks)' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
                {taskStatusError && (
                  <Alert variant="destructive">
                    <AlertDescription>{taskStatusError}</AlertDescription>
                  </Alert>
                )}

                {sprintTasks.length === 0 ? (
                  <p className="text-sm sm:text-base text-muted-foreground">
                    No tasks {sprint?.status === 'completed' ? 'were' : 'are currently'} assigned to this sprint.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    {sprintTasks.map(task => (
                      <div
                        key={task._id}
                        onClick={() => router.push(`/tasks/${task._id}`)}
                        className={`rounded-lg border bg-background p-3 sm:p-4 space-y-3 cursor-pointer hover:shadow-md transition-shadow ${task.archived ? 'border-dashed opacity-90' : ''
                          }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm sm:text-base truncate" title={task.title}>
                              {task.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {task.assignedTo
                                ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}`
                                : 'Unassigned'}
                            </p>
                            {task.movedToSprint && (
                              <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mt-1">
                                Moved to: {task.movedToSprint.name}
                              </p>
                            )}
                            {task.movedToBacklog && (
                              <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mt-1">
                                Moved to Backlog
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[11px] uppercase hover:bg-transparent dark:hover:bg-transparent">
                              {formatToTitleCase(task.priority)}
                            </Badge>
                            {task.archived && (
                              <Badge variant="secondary" className="text-[11px] uppercase hover:bg-secondary dark:hover:bg-secondary">
                                Archived
                              </Badge>
                            )}
                            {task.movedToSprint && (
                              <Badge variant="outline" className="text-[11px] bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400 border-orange-200 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/20">
                                Spillover
                              </Badge>
                            )}
                            {task.movedToBacklog && (
                              <Badge variant="outline" className="text-[11px] bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400 border-orange-200 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/20">
                                Backlog
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge className={`${getTaskStatusBadgeClass(task.status)} text-[11px]`}>
                            {formatTaskStatusLabel(task.status)}
                          </Badge>
                        </div>

                        {!task.movedToSprint && !task.movedToBacklog && (
                          <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                            <Label className="text-xs text-muted-foreground">Status</Label>
                            <Select
                              value={task.status}
                              onValueChange={(value) => handleTaskStatusChange(task._id, value)}
                              disabled={taskStatusUpdating === task._id || task.archived}
                            >
                              <SelectTrigger className="text-sm">
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
                              <p className="text-xs text-muted-foreground">
                                This task is archived and no longer appears on active boards.
                              </p>
                            )}
                          </div>
                        )}
                        {task.movedToSprint && (
                          <div className="rounded-md border bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800 p-2">
                            <p className="text-xs text-muted-foreground">
                              This task has been moved to <span className="font-medium text-orange-700 dark:text-orange-400">{task.movedToSprint.name}</span>
                            </p>
                          </div>
                        )}
                        {task.movedToBacklog && (
                          <div className="rounded-md border bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800 p-2">
                            <p className="text-xs text-muted-foreground">
                              This task has been moved to <span className="font-medium text-orange-700 dark:text-orange-400">Backlog</span>
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
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
                  <Badge className={`${getStatusColor(sprint?.status)} text-xs`}>
                    {getStatusIcon(sprint?.status)}
                    <span className="ml-1">{formatToTitleCase(sprint?.status)}</span>
                  </Badge>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Project</span>
                  <span
                    className="text-xs sm:text-sm font-medium truncate max-w-[200px] sm:max-w-none text-right sm:text-left"
                    title={sprint?.project?.name && sprint?.project?.name.length > 10 ? sprint?.project?.name : undefined}
                  >
                    {sprint?.project?.name && sprint?.project?.name.length > 10 ? `${sprint?.project?.name.slice(0, 10)}…` : sprint?.project?.name}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Duration</span>
                  <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
                    {Math.ceil((new Date(sprint?.endDate).getTime() - new Date(sprint?.startDate).getTime()) / (1000 * 60 * 60 * 24))} days
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Start Date</span>
                  <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
                    {new Date(sprint?.startDate).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">End Date</span>
                  <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
                    {new Date(sprint?.endDate).toLocaleDateString()}
                  </span>
                </div>

                {getDaysRemaining() > 0 && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground">Days Remaining</span>
                    <span className="text-xs sm:text-sm font-medium text-orange-600 whitespace-nowrap">{getDaysRemaining()}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Capacity</span>
                  <span className="text-xs sm:text-sm font-medium whitespace-nowrap">{sprint?.capacity}h</span>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Velocity</span>
                  <span className="text-xs sm:text-sm font-medium whitespace-nowrap">{sprint?.velocity}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-x-hidden">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Team Members</CardTitle>
                <CardDescription className="text-xs sm:text-sm">{sprint?.teamMembers?.length} members</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <div className="space-y-2">
                  {sprint?.teamMembers?.map((member, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <User className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs sm:text-sm truncate">
                        {member.firstName} {member.lastName}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-x-hidden">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Created By</CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <div className="flex items-center space-x-2">
                  <User className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs sm:text-sm truncate">
                    {sprint?.createdBy?.firstName} {sprint?.createdBy?.lastName}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(sprint?.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
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
              setCompleteError('')
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
                      Move Tasks to Backlog and Complete Sprint
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
            {completeError && (
              <Alert variant="destructive">
                <AlertDescription>{completeError}</AlertDescription>
              </Alert>
            )}

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
                  // No tasks selected - show "Move to Backlog" option

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
                          setCompleteError('')
                        }}
                      >
                        Move to Next Sprint
                      </Button>
                      <Button
                        type="button"
                        variant={completionMode === 'new' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setCompletionMode('new')
                          setCompleteError('')
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
      </div>
    </MainLayout>
  )
}
