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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { AddCustomStatusModal } from '@/components/sprints/AddCustomStatusModal'
import { DeleteCustomStatusModal } from '@/components/sprints/DeleteCustomStatusModal'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useProjectKanbanStatuses } from '@/hooks/useProjectKanbanStatuses'
import { DEFAULT_TASK_STATUS_OPTIONS, DEFAULT_TASK_STATUS_BADGE_MAP, DEFAULT_TASK_STATUS_KEYS, type TaskStatusOption } from '@/constants/taskStatuses'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { useNotify } from '@/lib/notify'
import { useAuthContext } from '@/contexts/AuthContext'
import CreateTaskModal from '@/components/tasks/CreateTaskModal'
import {
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  Play,
  XCircle,
  BarChart3,
  User,
  Users,
  Loader2,
  Edit,
  Pencil,
  Trash2,
  List,
  LayoutGrid,
  Gauge,
  Zap,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Plus,
  Briefcase,
  Target,
  ClipboardList,
  Search,
  Save,
  Flag,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Check,
  Link2,
  X
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
    loggedHours?: number
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
    module?: string
    story?: {
      _id: string
      title: string
    } | null
    epic?: {
      _id: string
      title: string
    } | null
    startDate?: string
    dueDate?: string
    createdAt?: string
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

const PRIORITY_CONFIG: Record<string, { label: string; icon: any; cls: string }> = {
  critical: {
    label: 'Critical',
    icon: <Flag className="w-3 h-3 text-rose-500 fill-rose-500 shrink-0" />,
    cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50'
  },
  high: {
    label: 'High',
    icon: <ArrowUp className="w-3 h-3 text-orange-600 stroke-[2.5] shrink-0" />,
    cls: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/50'
  },
  medium: {
    label: 'Medium',
    icon: <ArrowRight className="w-3 h-3 text-amber-600 stroke-[2.5] shrink-0" />,
    cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50'
  },
  low: {
    label: 'Low',
    icon: <ArrowDown className="w-3 h-3 text-sky-600 stroke-[2.5] shrink-0" />,
    cls: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/50'
  }
}

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
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [taskSortOrder, setTaskSortOrder] = useState<'desc' | 'asc'>('desc')
  const [tableSelectedTasks, setTableSelectedTasks] = useState<Set<string>>(new Set())
  const [activeStatusMenuTaskId, setActiveStatusMenuTaskId] = useState<string | null>(null)
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [editingTask, setEditingTask] = useState<NonNullable<Sprint['tasks']>[number] | null>(null)
  const [savingTaskEdit, setSavingTaskEdit] = useState(false)
  const [taskToDeleteId, setTaskToDeleteId] = useState<string | null>(null)
  const [deletingTask, setDeletingTask] = useState(false)
  const [showDeleteTaskConfirm, setShowDeleteTaskConfirm] = useState(false)
  const [editFormData, setEditFormData] = useState({
    module: '',
    title: '',
    type: 'task',
    priority: 'medium',
    status: 'todo',
    assigneeId: '',
    estimatedHours: '',
    actualHours: '0'
  })
  const [initialEditFormData, setInitialEditFormData] = useState({
    module: '',
    title: '',
    type: 'task',
    priority: 'medium',
    status: 'todo',
    assigneeId: '',
    estimatedHours: '',
    actualHours: '0'
  })

  const hasEditFormChanges = useMemo(() => {
    if (!editingTask) return false
    return (
      editFormData.module.trim() !== initialEditFormData.module.trim() ||
      editFormData.title.trim() !== initialEditFormData.title.trim() ||
      editFormData.type !== initialEditFormData.type ||
      editFormData.priority !== initialEditFormData.priority ||
      editFormData.status !== initialEditFormData.status ||
      editFormData.assigneeId !== initialEditFormData.assigneeId ||
      editFormData.estimatedHours.trim() !== initialEditFormData.estimatedHours.trim()
    )
  }, [editFormData, initialEditFormData, editingTask])
  const { getStatusesForProject, refreshStatuses } = useProjectKanbanStatuses()
  const [isAddStatusModalOpen, setIsAddStatusModalOpen] = useState(false)
  const [targetTaskIdForNewStatus, setTargetTaskIdForNewStatus] = useState<string | null>(null)
  const [statusToDelete, setStatusToDelete] = useState<{ value: string; label: string } | null>(null)
  const [isDeletingStatus, setIsDeletingStatus] = useState(false)

  const { hasPermission } = usePermissions()

  const sprintTasks = sprint?.tasks || []

  // Unique assignees extracted from sprint tasks
  const uniqueAssignees = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    sprintTasks.forEach(task => {
      if (Array.isArray(task.assignedTo)) {
        task.assignedTo.forEach(assignee => {
          const id = typeof assignee === 'string' ? assignee : assignee?.user?._id || (assignee as any)?._id
          const name = typeof assignee === 'object'
            ? `${assignee?.user?.firstName || assignee?.firstName || ''} ${assignee?.user?.lastName || assignee?.lastName || ''}`.trim()
            : ''
          if (id && name) {
            map.set(id, { id, name })
          }
        })
      }
    })
    return Array.from(map.values())
  }, [sprintTasks])

  // Unique types from sprint tasks
  const uniqueTypes = useMemo(() => {
    const set = new Set<string>()
    sprintTasks.forEach(t => {
      if (t.type) set.add(t.type.toLowerCase())
    })
    return Array.from(set)
  }, [sprintTasks])

  // Filtered sprint tasks based on search and filters
  const filteredSprintTasks = useMemo(() => {
    return sprintTasks.filter(task => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesTitle = task.title?.toLowerCase().includes(q)
        const matchesDisplayId = task.displayId?.toLowerCase().includes(q)
        const matchesModule = (task.module || task.story?.title || task.epic?.title)?.toLowerCase().includes(q)
        if (!matchesTitle && !matchesDisplayId && !matchesModule) {
          return false
        }
      }

      if (filterStatus !== 'all' && task.status?.toLowerCase() !== filterStatus.toLowerCase()) {
        return false
      }

      if (filterAssignee !== 'all') {
        if (filterAssignee === 'unassigned') {
          if (task.assignedTo && task.assignedTo.length > 0) return false
        } else {
          const hasAssignee = task.assignedTo?.some(a => {
            const id = typeof a === 'string' ? a : a?.user?._id || (a as any)?._id
            return id === filterAssignee
          })
          if (!hasAssignee) return false
        }
      }

      if (filterPriority !== 'all' && task.priority?.toLowerCase() !== filterPriority.toLowerCase()) {
        return false
      }

      if (filterType !== 'all' && task.type?.toLowerCase() !== filterType.toLowerCase()) {
        return false
      }

      return true
    }).sort((a, b) => {
      const mult = taskSortOrder === 'desc' ? 1 : -1

      // 1. Compare createdAt timestamp (newer date first)
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) {
        return (timeB - timeA) * mult
      }

      // 2. Compare numeric portion of displayId (e.g. 1.5 vs 1.1)
      const parseNum = (dId?: string) => {
        if (!dId) return 0
        const m = dId.match(/(\d+(?:\.\d+)?)/)
        return m ? parseFloat(m[1]) : 0
      }
      const numA = parseNum(a.displayId)
      const numB = parseNum(b.displayId)
      if (numA !== numB) {
        return (numB - numA) * mult
      }

      // 3. Fallback to ObjectId hex comparison (larger hex = newer ObjectId)
      return String(b._id || '').localeCompare(String(a._id || '')) * mult
    })
  }, [sprintTasks, searchQuery, filterStatus, filterAssignee, filterPriority, filterType, taskSortOrder])

  // Reset page when filters change
  useEffect(() => {
    setSprintTasksCurrentPage(1)
  }, [searchQuery, filterStatus, filterAssignee, filterPriority, filterType])

  // Pagination logic for sprint tasks
  const paginatedSprintTasks = useMemo(() => {
    const startIndex = (sprintTasksCurrentPage - 1) * sprintTasksPageSize
    const endIndex = startIndex + sprintTasksPageSize
    return filteredSprintTasks.slice(startIndex, endIndex)
  }, [filteredSprintTasks, sprintTasksCurrentPage, sprintTasksPageSize])

  const sprintTasksTotalPages = Math.ceil(filteredSprintTasks.length / sprintTasksPageSize)

  const canCreateSprint = hasPermission(Permission.SPRINT_CREATE)
  const canViewSprint = hasPermission(Permission.SPRINT_VIEW) || hasPermission(Permission.SPRINT_READ)
  const canEditSprint = hasPermission(Permission.SPRINT_EDIT) && hasPermission(Permission.SPRINT_CREATE)
  const canDeleteSprint = hasPermission(Permission.SPRINT_DELETE)
  const canStartSprint = hasPermission(Permission.SPRINT_START)
  const canCompleteSprint = hasPermission(Permission.SPRINT_COMPLETE)
  const canCreateTask = hasPermission(Permission.TASK_CREATE)

  const totalTasks = sprint?.progress?.totalTasks ?? sprintTasks.length
  const hasTasks = (totalTasks ?? 0) > 0

  const handleTaskPriorityChange = async (taskId: string, newPriority: string) => {
    try {
      setTaskStatusUpdating(taskId)
      setActivePriorityMenuTaskId(null)
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: newPriority })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update priority')
      }

      setSprint(prev => {
        if (!prev || !prev.tasks) return prev
        const updatedTasks = prev.tasks.map(task =>
          task._id === taskId ? { ...task, priority: newPriority } : task
        )
        return {
          ...prev,
          tasks: updatedTasks
        }
      })
      notifySuccess({ title: 'Task priority updated' })
    } catch (err) {
      notifyError({
        title: 'Failed to Update Priority',
        message: err instanceof Error ? err.message : 'Failed to update task priority'
      })
    } finally {
      setTaskStatusUpdating(null)
    }
  }

  const formatShortDate = (dateVal?: string | Date) => {
    if (!dateVal) return '—'
    const d = new Date(dateVal)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Bulk Assignable Members (Sprint members + unique assignees)
  const assignableMembers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email?: string }>()
    if (sprint?.teamMembers && Array.isArray(sprint.teamMembers)) {
      sprint.teamMembers.forEach(m => {
        const id = m._id || (m as any).id
        const name = `${m.firstName || ''} ${m.lastName || ''}`.trim()
        if (id) {
          map.set(id, { id, name: name || m.email || 'Team Member', email: m.email })
        }
      })
    }
    uniqueAssignees.forEach(a => {
      if (!map.has(a.id)) {
        map.set(a.id, { id: a.id, name: a.name })
      }
    })
    if (editingTask && Array.isArray(editingTask.assignedTo)) {
      editingTask.assignedTo.forEach(a => {
        const id = typeof a === 'string' ? a : a?.user?._id || (a as any)?._id
        const name = typeof a === 'object'
          ? `${a?.user?.firstName || a?.firstName || ''} ${a?.user?.lastName || a?.lastName || ''}`.trim()
          : ''
        if (id && !map.has(id)) {
          map.set(id, { id, name: name || 'Assigned User' })
        }
      })
    }
    return Array.from(map.values())
  }, [sprint?.teamMembers, uniqueAssignees, editingTask])

  // Bulk Assign Handler
  const handleBulkAssign = async (member: { id: string; name: string; email?: string } | null) => {
    if (tableSelectedTasks.size === 0) return
    try {
      setBulkActionLoading(true)
      const selectedIds = Array.from(tableSelectedTasks)
      const assignedToVal = member ? [{
        user: member.id,
        firstName: member.name.split(' ')[0] || '',
        lastName: member.name.split(' ').slice(1).join(' ') || '',
        email: member.email || ''
      }] : []

      await Promise.all(
        selectedIds.map(taskId =>
          fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignedTo: assignedToVal })
          })
        )
      )

      notifySuccess({
        title: member ? `Assigned ${selectedIds.length} tasks to ${member.name}` : `Unassigned ${selectedIds.length} tasks`
      })
      setTableSelectedTasks(new Set())
      setBulkAssignMenuOpen(false)
      fetchSprint({ silent: true })
    } catch (err) {
      notifyError({
        title: 'Failed to Assign Tasks',
        message: err instanceof Error ? err.message : 'Failed to update assignees'
      })
    } finally {
      setBulkActionLoading(false)
    }
  }

  // Bulk Status Handler (Mark Done, Mark In Progress)
  const handleBulkMarkStatus = async (targetStatus: string, label: string) => {
    if (tableSelectedTasks.size === 0) return
    try {
      setBulkActionLoading(true)
      const selectedIds = Array.from(tableSelectedTasks)
      const response = await fetch('/api/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          taskIds: selectedIds,
          updates: { status: targetStatus }
        })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update task statuses')
      }

      notifySuccess({
        title: `${selectedIds.length} ${selectedIds.length === 1 ? 'task' : 'tasks'} marked as ${label}`
      })
      setTableSelectedTasks(new Set())
      fetchSprint({ silent: true })
    } catch (err) {
      notifyError({
        title: 'Failed to Update Tasks',
        message: err instanceof Error ? err.message : 'Failed to update task status'
      })
    } finally {
      setBulkActionLoading(false)
    }
  }

  // Bulk Move to Sprint Handler
  const handleBulkMoveToSprint = async (targetSprintId: string | null) => {
    if (tableSelectedTasks.size === 0) return
    try {
      setBulkActionLoading(true)
      const selectedIds = Array.from(tableSelectedTasks)

      await Promise.all(
        selectedIds.map(taskId =>
          fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sprint: targetSprintId || null,
              ...(targetSprintId ? {} : { movedToBacklog: true, status: 'backlog' })
            })
          })
        )
      )

      notifySuccess({
        title: targetSprintId ? `Moved ${selectedIds.length} tasks to sprint` : `Moved ${selectedIds.length} tasks to backlog`
      })
      setTableSelectedTasks(new Set())
      setBulkMoveMenuOpen(false)
      fetchSprint({ silent: true })
    } catch (err) {
      notifyError({
        title: 'Failed to Move Tasks',
        message: err instanceof Error ? err.message : 'Failed to move tasks'
      })
    } finally {
      setBulkActionLoading(false)
    }
  }

  // Bulk Export to CSV
  const handleExportSelected = () => {
    const selectedTasksList = sprintTasks.filter(t => tableSelectedTasks.has(t._id))
    if (selectedTasksList.length === 0) return

    const headers = ['Task ID', 'Title', 'Module', 'Type', 'Priority', 'Status', 'Assignee', 'Start Date', 'Due Date', 'Est Hours', 'Act Hours']
    const rows = selectedTasksList.map(t => {
      const assigneeNames = Array.isArray(t.assignedTo) && t.assignedTo.length > 0
        ? t.assignedTo
            .map(a => typeof a === 'object' ? `${a?.user?.firstName || a?.firstName || ''} ${a?.user?.lastName || a?.lastName || ''}`.trim() : '')
            .filter(Boolean)
            .join(', ')
        : 'Unassigned'

      return [
        `"${t.displayId || t._id}"`,
        `"${(t.title || '').replace(/"/g, '""')}"`,
        `"${(t.module || t.story?.title || t.epic?.title || '').replace(/"/g, '""')}"`,
        `"${t.type || 'task'}"`,
        `"${t.priority || 'medium'}"`,
        `"${t.status || ''}"`,
        `"${assigneeNames.replace(/"/g, '""')}"`,
        `"${formatShortDate(t.startDate || t.createdAt)}"`,
        `"${formatShortDate(t.dueDate)}"`,
        `"${t.estimatedHours || 0}"`,
        `"${t.actualHours || 0}"`
      ].join(',')
    })

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `${(sprint?.name || 'sprint').toLowerCase().replace(/\s+/g, '_')}_tasks_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    notifySuccess({ title: `Exported ${selectedTasksList.length} tasks to CSV` })
  }

  const handleOpenEditTask = (task: NonNullable<Sprint['tasks']>[number]) => {
    setEditingTask(task)

    let assigneeId = ''
    if (Array.isArray(task.assignedTo) && task.assignedTo.length > 0) {
      const first = task.assignedTo[0]
      assigneeId = typeof first === 'string' ? first : first?.user?._id || (first as any)?._id || ''
    }

    const data = {
      module: task.module || task.story?.title || task.epic?.title || '',
      title: task.title || '',
      type: (task.type || 'task').toLowerCase(),
      priority: (task.priority || 'medium').toLowerCase(),
      status: task.status || 'todo',
      assigneeId: assigneeId,
      estimatedHours: task.estimatedHours ? String(task.estimatedHours) : '',
      actualHours: task.actualHours ? String(task.actualHours) : (task.loggedHours ? String(task.loggedHours) : '0')
    }

    setEditFormData(data)
    setInitialEditFormData(data)
  }

  const handleSaveTaskEdit = async () => {
    if (!editingTask) return
    if (!editFormData.title.trim()) {
      notifyError({ title: 'Task title is required' })
      return
    }
    try {
      setSavingTaskEdit(true)
      const assigneeVal = editFormData.assigneeId
        ? (() => {
            const m = assignableMembers.find(member => member.id === editFormData.assigneeId)
            if (!m) return [{ user: editFormData.assigneeId }]
            return [{
              user: m.id,
              firstName: m.name.split(' ')[0] || '',
              lastName: m.name.split(' ').slice(1).join(' ') || '',
              email: m.email || ''
            }]
          })()
        : []

      const payload: any = {
        title: editFormData.title.trim(),
        module: editFormData.module.trim(),
        type: editFormData.type.toLowerCase(),
        priority: editFormData.priority.toLowerCase(),
        status: editFormData.status,
        assignedTo: assigneeVal,
        estimatedHours: editFormData.estimatedHours ? Number(editFormData.estimatedHours) : 0
      }

      const res = await fetch(`/api/tasks/${editingTask._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update task')
      }

      const updatedTaskObj = data.task || data.data
      const isMovedToBacklog = payload.status === 'backlog'
      setSprint(prev => {
        if (!prev || !prev.tasks) return prev
        const updatedTasks = isMovedToBacklog
          ? prev.tasks.filter(t => t._id !== editingTask._id)
          : prev.tasks.map(t =>
              t._id === editingTask._id
                ? {
                    ...t,
                    title: payload.title,
                    module: payload.module,
                    type: payload.type,
                    priority: payload.priority,
                    status: payload.status,
                    assignedTo: updatedTaskObj?.assignedTo || t.assignedTo,
                    estimatedHours: payload.estimatedHours
                  }
                : t
            )
        const updatedProgress = buildProgressFromTasks(updatedTasks, prev.progress) || prev.progress
        return {
          ...prev,
          tasks: updatedTasks,
          taskSummary: buildTaskSummaryFromTasks(updatedTasks),
          progress: updatedProgress
        }
      })

      if (isMovedToBacklog) {
        notifySuccess({
          title: 'Task moved to Backlog',
          message: 'Task has been removed from this sprint and moved to the backlog module.'
        })
      } else {
        notifySuccess({ title: 'Task updated successfully' })
      }
      setEditingTask(null)
      fetchSprint({ silent: true })
    } catch (err) {
      notifyError({
        title: 'Failed to Save Task',
        message: err instanceof Error ? err.message : 'An error occurred'
      })
    } finally {
      setSavingTaskEdit(false)
    }
  }

  const handleDeleteTaskFromSideCard = async () => {
    if (!taskToDeleteId) return
    try {
      setDeletingTask(true)
      const res = await fetch(`/api/tasks/${taskToDeleteId}`, {
        method: 'DELETE'
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete task')
      }
      notifySuccess({ title: 'Task deleted successfully' })
      if (editingTask?._id === taskToDeleteId) {
        setEditingTask(null)
      }
      setShowDeleteTaskConfirm(false)
      setTaskToDeleteId(null)
      fetchSprint({ silent: true })
    } catch (err) {
      notifyError({
        title: 'Failed to delete task',
        message: err instanceof Error ? err.message : 'An error occurred'
      })
    } finally {
      setDeletingTask(false)
    }
  }

  const getDurationText = () => {
    if (!sprint?.startDate || !sprint?.endDate) return ''
    const start = new Date(sprint.startDate).getTime()
    const end = new Date(sprint.endDate).getTime()
    const diffDays = Math.round(Math.abs(end - start) / (1000 * 60 * 60 * 24))
    if (diffDays % 7 === 0) {
      const weeks = diffDays / 7
      return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`
    }
    return `${diffDays} days`
  }


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
    const projectSettingsStatuses: any[] | undefined = (sprint.project as any)?.settings?.kanbanStatuses
    const hookStatuses = getStatusesForProject(sprint.project._id)

    const activeStatuses = (projectSettingsStatuses && projectSettingsStatuses.length > 0)
      ? projectSettingsStatuses
      : (hookStatuses && hookStatuses.length > 0)
        ? hookStatuses
        : null

    if (activeStatuses && activeStatuses.length > 0) {
      const mapped = activeStatuses
        .map((status: any) => {
          const key = status?.key || status?._doc?.key || status?.value
          const title = status?.title || status?._doc?.title || status?.label || (key ? formatToTitleCase(key) : '')
          const color = status?.color || status?._doc?.color || (key ? DEFAULT_TASK_STATUS_BADGE_MAP[key] : undefined)
          return {
            value: key,
            label: title,
            color
          }
        })
        .filter(opt => Boolean(opt.value && opt.label))

      if (mapped.length > 0) {
        return mapped
      }
    }
    return DEFAULT_TASK_STATUS_OPTIONS
  }, [sprint?.project, getStatusesForProject])

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

  const handleStatusCreated = async (newStatus: { key: string; title: string; color?: string; order: number }) => {
    try {
      setSprint(prev => {
        if (!prev) return prev
        const proj = prev.project as any
        const existing = proj?.settings?.kanbanStatuses || []
        const alreadyExists = existing.some((s: any) => s.key === newStatus.key)
        const updatedStatuses = alreadyExists ? existing : [...existing, newStatus]
        return {
          ...prev,
          project: {
            ...proj,
            settings: {
              ...(proj?.settings || {}),
              kanbanStatuses: updatedStatuses
            }
          }
        }
      })
      refreshStatuses().catch(err => console.error('Failed to refresh statuses in background:', err))
      if (targetTaskIdForNewStatus) {
        const taskId = targetTaskIdForNewStatus
        setTargetTaskIdForNewStatus(null)
        await handleTaskStatusChange(taskId, newStatus.key, true)
        if (editingTask && editingTask._id === taskId) {
          setEditFormData(prev => ({ ...prev, status: newStatus.key }))
        }
      }
    } catch (err) {
      console.error('Failed to handle status creation:', err)
    } finally {
      setTargetTaskIdForNewStatus(null)
    }
  }

  const handleDeleteCustomStatus = async () => {
    if (!statusToDelete || !sprint?.project?._id) return
    try {
      setIsDeletingStatus(true)
      const projectId = sprint.project._id
      const statusKey = statusToDelete.value
      const res = await fetch(`/api/projects/${projectId}/statuses?key=${encodeURIComponent(statusKey)}`, {
        method: 'DELETE'
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete custom status')
      }

      // Parse updatedStatuses cleanly
      const rawList = Array.isArray(data.statuses) && data.statuses.length > 0
        ? data.statuses
        : ((sprint.project as any)?.settings?.kanbanStatuses || [])

      const updatedStatuses = rawList
        .filter((s: any) => {
          const k = s?.key || s?._doc?.key || s?.value
          return k && k !== statusKey
        })
        .map((s: any, idx: number) => {
          const key = s?.key || s?._doc?.key || s?.value
          const title = s?.title || s?._doc?.title || s?.label || (key ? formatToTitleCase(key) : '')
          const color = s?.color || s?._doc?.color || (key ? DEFAULT_TASK_STATUS_BADGE_MAP[key] : undefined)
          return { key, title, color, order: idx }
        })

      setSprint(prev => {
        if (!prev) return prev
        const proj = prev.project as any
        const updatedTasks = (prev.tasks || []).map(t => t.status === statusKey ? { ...t, status: 'todo' } : t)
        return {
          ...prev,
          tasks: updatedTasks,
          project: {
            ...proj,
            settings: {
              ...(proj?.settings || {}),
              kanbanStatuses: updatedStatuses
            }
          }
        }
      })

      if (editFormData.status === statusKey) {
        setEditFormData(prev => ({ ...prev, status: 'todo' }))
      }

      notifySuccess({
        title: 'Status Deleted',
        message: `Status "${statusToDelete.label}" was deleted and any associated tasks were moved to To Do.`
      })
      setStatusToDelete(null)

      // Background synchronization
      refreshStatuses().catch(() => {})
      fetchSprint({ silent: true }).catch(() => {})
    } catch (err: any) {
      notifyError({
        title: 'Failed to Delete Status',
        message: err.message || 'An error occurred while deleting the status.'
      })
    } finally {
      setIsDeletingStatus(false)
    }
  }

  const handleTaskStatusChange = async (taskId: string, newStatus: string, bypassValidation: boolean = false) => {
    try {
      const isKnownInOptions = projectStatusOptions.some(option => option.value === newStatus)
      const isKnownInSprintProject = ((sprint?.project as any)?.settings?.kanbanStatuses || []).some((s: any) => s.key === newStatus)
      const isKnownDefault = DEFAULT_TASK_STATUS_OPTIONS.some(option => option.value === newStatus)

      if (!bypassValidation && !isKnownInOptions && !isKnownInSprintProject && !isKnownDefault) {
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

      const isMovedToBacklog = newStatus === 'backlog'
      setSprint(prev => {
        if (!prev || !prev.tasks) return prev
        const updatedTasks = isMovedToBacklog
          ? prev.tasks.filter(task => task._id !== taskId)
          : prev.tasks.map(task =>
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

      if (isMovedToBacklog) {
        setTableSelectedTasks(prev => {
          if (!prev.has(taskId)) return prev
          const next = new Set(prev)
          next.delete(taskId)
          return next
        })
        if (editingTask?._id === taskId) {
          setEditingTask(null)
        }
        notifySuccess({
          title: 'Task moved to Backlog',
          message: 'Task has been removed from this sprint and moved to the backlog module.'
        })
      } else {
        notifySuccess({ title: 'Task status updated' })
      }
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
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              {/* Back navigation & Badges */}
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <button
                  onClick={() => router.back()}
                  className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors font-medium"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[12px] font-medium">
                  {sprint.project?.name || 'Project'}
                </span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                {/* Status chip */}
                {sprint.status === 'active' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-[12px] font-medium border border-emerald-200 dark:border-emerald-800/60">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                )}
                {sprint.status === 'planning' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 text-[12px] font-medium border border-blue-200 dark:border-blue-800/60">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    Planning
                  </span>
                )}
                {sprint.status === 'completed' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[12px] font-medium border border-gray-200 dark:border-gray-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                    Completed
                  </span>
                )}
                {sprint.status === 'cancelled' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-[12px] font-medium border border-red-200 dark:border-red-800/60">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    Cancelled
                  </span>
                )}
              </div>

              {/* Title & Subtitle */}
              <h1 className="text-[22px] sm:text-[26px] font-bold text-gray-900 dark:text-white tracking-tight truncate">
                {sprint.name.toLowerCase().includes('task sheet') ? sprint.name : `${sprint.name} - Task Sheet`}
              </h1>
              <p className="text-[13px] sm:text-[14px] text-gray-500 dark:text-gray-400">
                Manage, assign and track tasks for this sprint
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap flex-shrink-0 self-start sm:self-center">
              {/* Start / Complete Sprint Button */}
              {sprint.status === 'active' && canCompleteSprint && (
                <button
                  onClick={handleCompleteSprintClick}
                  disabled={completingSprint}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#16a34a] hover:bg-[#15803d] text-white text-[13px] font-semibold px-4 h-9 shadow-sm transition-all disabled:opacity-40"
                >
                  {completingSprint ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>{completingSprint ? 'Completing…' : 'Complete Sprint'}</span>
                </button>
              )}

              {sprint.status === 'planning' && canStartSprint && (
                <button
                  type="button"
                  onClick={handleStartSprint}
                  disabled={startingSprint || !hasTasks}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold px-4 h-9 shadow-sm transition-all ${
                    !hasTasks
                      ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed shadow-none'
                      : 'bg-[#16a34a] hover:bg-[#15803d] text-white disabled:opacity-40 cursor-pointer'
                  }`}
                >
                  {startingSprint ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className={`h-4 w-4 ${!hasTasks ? 'fill-gray-400 dark:fill-gray-500' : 'fill-white'}`} />
                  )}
                  <span>{startingSprint ? 'Starting…' : 'Start Sprint'}</span>
                </button>
              )}

              {/* Create New Task Button */}
              {canCreateTask && (
                <button
                  type="button"
                  onClick={() => setShowCreateTaskModal(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-200 text-[13px] font-medium px-4 h-9 shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create New Task</span>
                </button>
              )}

              {/* Add Task Button (Redirects to Backlog) */}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => router.push(sprint?.project?._id ? `/backlog?project=${sprint.project._id}` : '/backlog')}
                      className="h-9 w-9 rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 text-gray-600 dark:text-gray-300 flex items-center justify-center shadow-sm transition-all cursor-pointer"
                      title="Add Task"
                      aria-label="Add Task"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs font-medium">
                    Add Task
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Edit Icon Button */}
              {canEditSprint && (
                <button
                  onClick={() => router.push(`/sprints/${sprintId}/edit`)}
                  className="h-9 w-9 rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 text-gray-600 dark:text-gray-300 flex items-center justify-center shadow-sm transition-all"
                  title="Edit Sprint"
                  aria-label="Edit Sprint"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}

              {/* Delete Icon Button */}
              {canDeleteSprint && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="h-9 w-9 rounded-full border border-red-200 dark:border-red-900/50 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 flex items-center justify-center shadow-sm transition-all"
                  title="Delete Sprint"
                  aria-label="Delete Sprint"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Sprint Info Banner Card ────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            {/* Left Column: Description & Metadata */}
            <div className="flex-1 space-y-4 min-w-0">
              <div>
                <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white">Description</h3>
                <div className="mt-1 text-[13px] sm:text-[14px] text-gray-600 dark:text-gray-300 leading-relaxed">
                  {sprint.description ? (() => {
                    const isHtml = /<(p|br|div|ul|ol|li|strong|em|u|h[1-6]|img|a)(\s|>|\/)/i.test(sprint.description)
                    return isHtml
                      ? <div className="task-description max-w-none" dangerouslySetInnerHTML={{ __html: sprint.description }} />
                      : <div className="whitespace-pre-line">{sprint.description}</div>
                  })() : (
                    <span className="text-gray-400 dark:text-gray-500">No description provided.</span>
                  )}
                </div>
                {sprint.goal && (
                  <div className="mt-2 text-[13px] text-gray-500 dark:text-gray-400">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Sprint Goal: </span>
                    <span>{sprint.goal}</span>
                  </div>
                )}
              </div>

              {/* Metadata rows */}
              <div className="space-y-2 pt-1 text-[12px] sm:text-[13px] text-gray-500 dark:text-gray-400">
                {/* Row 1: Timeline & Capacity */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span>Timeline:</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200 font-apple-mono">
                      {formatDate(sprint.startDate)} - {formatDate(sprint.endDate)}{getDurationText() ? ` (${getDurationText()})` : ''}
                    </span>
                  </div>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span>Capacity:</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200 font-apple-mono">
                      {sprint.capacity || 0} hrs
                    </span>
                  </div>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                </div>

                {/* Row 2: Story Points & Team */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Target className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span>Story Points:</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200 font-apple-mono">
                      {sprint.progress?.storyPointsCompleted || 0} / {sprint.progress?.totalStoryPoints || 0} pts
                    </span>
                  </div>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span>Team:</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200 font-apple-mono">
                      {sprint.teamMembers?.length || 0} {sprint.teamMembers?.length === 1 ? 'Contributor' : 'Contributors'}
                    </span>
                  </div>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                </div>

                {/* Row 3: Velocity */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span>Velocity:</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200 font-apple-mono">
                      {sprint.velocity ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Created By & Team Members */}
            <div className="flex flex-col sm:items-end justify-between self-stretch sm:self-auto gap-4 min-w-[200px] flex-shrink-0">
              {/* Created By */}
              <div className="flex flex-col sm:items-end">
                <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">Created By</span>
                <div className="mt-1.5 flex items-center justify-end">
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[12px] font-semibold overflow-hidden border-2 border-white dark:border-gray-800 shadow-sm"
                    style={{ background: 'var(--apple-card-gradient, linear-gradient(135deg, #3b82f6, #1d4ed8))' }}
                    title={`${sprint.createdBy?.firstName || ''} ${sprint.createdBy?.lastName || ''}`.trim() || 'Creator'}
                  >
                    {`${sprint.createdBy?.firstName || ''} ${sprint.createdBy?.lastName || ''}`.trim().split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || <User className="h-4 w-4" />}
                  </div>
                </div>
              </div>

              {/* Team Members */}
              <div className="flex flex-col sm:items-end">
                <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">Team Members</span>
                <div className="mt-1.5 flex items-center -space-x-1.5 overflow-hidden justify-end">
                  {sprint.teamMembers && sprint.teamMembers.length > 0 ? (
                    sprint.teamMembers.map((member, index) => {
                      const memberName = `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Unknown User'
                      const initials = memberName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
                      const bgColors = [
                        'bg-slate-700',
                        'bg-emerald-600',
                        'bg-sky-600',
                        'bg-indigo-600',
                        'bg-amber-600',
                        'bg-rose-600',
                        'bg-purple-600'
                      ]
                      const bgColor = bgColors[index % bgColors.length]
                      return (
                        <div
                          key={member._id || index}
                          className={`h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold border-2 border-white dark:border-gray-900 shadow-sm ${bgColor} select-none flex-shrink-0`}
                          title={memberName}
                        >
                          {initials}
                        </div>
                      )
                    })
                  ) : (
                    <span className="text-[12px] text-gray-400">No members</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 4 KPI Metric Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: TASK COMPLETED */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold tracking-wider text-gray-400 dark:text-gray-500 uppercase">TASK COMPLETED</p>
              <p className="mt-2 text-[24px] font-bold font-apple-mono text-gray-900 dark:text-white leading-none">
                {sprint.progress?.tasksCompleted ?? 0} / {sprint.progress?.totalTasks ?? sprintTasks.length}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>

          {/* Card 2: ESTIMATED HOURS */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold tracking-wider text-gray-400 dark:text-gray-500 uppercase">ESTIMATED HOURS</p>
              <p className="mt-2 text-[24px] font-bold font-apple-mono text-gray-900 dark:text-white leading-none">
                {sprint.progress?.estimatedHours ?? sprint.capacity ?? 0}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900/50 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <ClipboardList className="h-5 w-5" />
            </div>
          </div>

          {/* Card 3: ACTUAL HOURS */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold tracking-wider text-gray-400 dark:text-gray-500 uppercase">ACTUAL HOURS</p>
              <p className="mt-2 text-[24px] font-bold font-apple-mono text-gray-900 dark:text-white leading-none">
                {sprint.progress?.actualHours ?? 0}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Gauge className="h-5 w-5" />
            </div>
          </div>

          {/* Card 4: OVERALL PROGRESS */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold tracking-wider text-gray-400 dark:text-gray-500 uppercase">OVERALL PROGRESS</p>
              <span className="text-[15px] font-bold font-apple-mono text-gray-900 dark:text-white">
                {sprint.progress?.completionPercentage ?? 0}%
              </span>
            </div>
            <div className="mt-4 h-2 w-full rounded-full bg-blue-50 dark:bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.max(0, sprint.progress?.completionPercentage ?? 0))}%`,
                  background: 'linear-gradient(90deg, #1d4ed8 0%, #3b82f6 100%)'
                }}
              />
            </div>
          </div>
        </div>

            {/* Tasks Section */}
            {sprintTasks.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 sm:p-20 flex flex-col items-center justify-center text-center shadow-xs">
                {/* Center Graphic */}
                <div className="relative mb-6">
                  {/* Outer light blue squircle */}
                  <div className="w-20 h-20 rounded-2xl bg-blue-100/70 dark:bg-blue-950/50 flex items-center justify-center shadow-xs">
                    {/* Inner Document Graphic */}
                    <div className="relative flex items-center justify-center">
                      <svg className="w-10 h-10 text-blue-500" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="6" y="4" width="24" height="28" rx="4" fill="#3B82F6" />
                        <line x1="11" y1="12" x2="25" y2="12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                        <line x1="11" y1="18" x2="20" y2="18" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                        <line x1="11" y1="24" x2="16" y2="24" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                        <circle cx="26" cy="24" r="5" fill="#1D4ED8" stroke="white" strokeWidth="1.5" />
                        <path d="M24 24L25.5 25.5L28.5 22.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                  {/* Bottom-right Zap badge */}
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white dark:bg-gray-900 shadow-md flex items-center justify-center border border-gray-100 dark:border-gray-800">
                    <Zap className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />
                  </div>
                </div>

                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                  No tasks in this sprint yet
                </h3>

                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-lg leading-relaxed">
                  {sprint.name} is initialized and ready for planning. Populate tasks to forecast velocity, assign team bandwidth, and monitor milestone deliverables.
                </p>

                <div className="mt-6 flex items-center gap-3 flex-wrap justify-center">
                  {canCreateTask && (
                    <button
                      type="button"
                      onClick={() => setShowCreateTaskModal(true)}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#0059e0] hover:bg-blue-700 text-white text-sm font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create New Task</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => router.push(sprint?.project?._id ? `/backlog?project=${sprint.project._id}` : '/backlog')}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-blue-50/90 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 text-sm font-semibold transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Task</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
              {/* Search & Filters Bar */}
              <div className="rounded-2xl border border-slate-200/90 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-3 sm:p-3.5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 shadow-xs">
                {/* Search Bar */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Tasks..."
                    className="w-full h-10 pl-10 pr-8 rounded-full border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Status Filter */}
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-10 px-4 rounded-full border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs sm:text-[13px] font-normal text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-800/80 focus:ring-2 focus:ring-blue-500/20 w-auto gap-2.5 inline-flex items-center cursor-pointer transition-colors shadow-none">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] max-h-60 overflow-y-auto thin-scrollbar">
                      <SelectItem value="all">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
                          <span>All Status</span>
                        </div>
                      </SelectItem>
                      {projectStatusOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${
                              opt.value === 'done' || opt.value === 'completed'
                                ? 'bg-emerald-500'
                                : opt.value === 'in_progress'
                                ? 'bg-amber-500'
                                : opt.value === 'testing'
                                ? 'bg-purple-500'
                                : opt.value === 'review'
                                ? 'bg-indigo-500'
                                : 'bg-blue-500'
                            }`} />
                            <span>{opt.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Assignee Filter */}
                  <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                    <SelectTrigger className="h-10 px-4 rounded-full border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs sm:text-[13px] font-normal text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-800/80 focus:ring-2 focus:ring-blue-500/20 w-auto gap-2.5 inline-flex items-center cursor-pointer transition-colors shadow-none">
                      <SelectValue placeholder="All Assignees" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] max-h-60 overflow-y-auto thin-scrollbar">
                      <SelectItem value="all">
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>All Assignees</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="unassigned">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 shrink-0">
                            <User className="w-3 h-3" />
                          </div>
                          <span>Unassigned</span>
                        </div>
                      </SelectItem>
                      {uniqueAssignees.map(a => {
                        const initial = a.name ? a.name.charAt(0).toUpperCase() : 'U'
                        return (
                          <SelectItem key={a.id} value={a.id}>
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-[10px] font-semibold shrink-0">
                                {initial}
                              </div>
                              <span>{a.name}</span>
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>

                  {/* Priority Filter */}
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger className="h-10 px-4 rounded-full border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs sm:text-[13px] font-normal text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-800/80 focus:ring-2 focus:ring-blue-500/20 w-auto gap-2.5 inline-flex items-center cursor-pointer transition-colors shadow-none">
                      <SelectValue placeholder="All Priorities" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050]">
                      <SelectItem value="all">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
                          <span>All Priorities</span>
                        </div>
                      </SelectItem>
                      {(['critical', 'high', 'medium', 'low'] as const).map(priKey => {
                        const cfg = PRIORITY_CONFIG[priKey]
                        return (
                          <SelectItem key={priKey} value={priKey}>
                            <div className="flex items-center gap-2">
                              {cfg.icon}
                              <span>{cfg.label}</span>
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>

                  {/* Type Filter */}
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="h-10 px-4 rounded-full border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs sm:text-[13px] font-normal text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-800/80 focus:ring-2 focus:ring-blue-500/20 w-auto gap-2.5 inline-flex items-center cursor-pointer transition-colors shadow-none">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050]">
                      <SelectItem value="all">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
                          <span>All Types</span>
                        </div>
                      </SelectItem>
                      {Array.from(new Set(['story', 'task', 'bug', 'improvement', ...uniqueTypes])).map(t => {
                        let dotColor = 'bg-sky-500'
                        if (t === 'story') dotColor = 'bg-purple-500'
                        else if (t === 'bug') dotColor = 'bg-rose-500'
                        else if (t === 'improvement') dotColor = 'bg-emerald-500'
                        return (
                          <SelectItem key={t} value={t}>
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                              <span>{formatToTitleCase(t)}</span>
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Status Row & View Switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                {/* Status Tabs */}
                <div className="flex items-center gap-4 overflow-x-auto pb-1 text-sm font-medium scrollbar-hide">
                  {(() => {
                    const total = sprintTasks.length
                    const todoCount = sprintTasks.filter(t => t.status === 'todo').length
                    const inProgCount = sprintTasks.filter(t => t.status === 'in_progress').length
                    const testingCount = sprintTasks.filter(t => t.status === 'testing').length
                    const reviewCount = sprintTasks.filter(t => t.status === 'review').length

                    const tabs = [
                      { id: 'all', label: 'Total Task', count: total },
                      { id: 'todo', label: 'To Do', count: todoCount },
                      { id: 'in_progress', label: 'In Progress', count: inProgCount },
                      { id: 'testing', label: 'Testing', count: testingCount },
                      { id: 'review', label: 'Review', count: reviewCount },
                    ]

                    return tabs.map((tab, idx) => {
                      const isActive = filterStatus === tab.id
                      return (
                        <div key={tab.id} className="flex items-center gap-4 shrink-0">
                          <button
                            type="button"
                            onClick={() => setFilterStatus(tab.id)}
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                              isActive
                                ? 'text-blue-700 dark:text-blue-400 font-semibold border-b-2 border-blue-600 dark:border-blue-400 pb-1 -mb-1'
                                : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
                            }`}
                          >
                            <span>{tab.label}</span>
                            <span className={`text-xs px-1.5 py-0.2 rounded-full ${
                              isActive
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 font-bold'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                            }`}>
                              {tab.count}
                            </span>
                          </button>
                          {idx < tabs.length - 1 && (
                            <span className="text-gray-300 dark:text-gray-700 font-light select-none">|</span>
                          )}
                        </div>
                      )
                    })
                  })()}
                </div>

                {/* View Switcher: List vs Grid */}
                <div className="flex items-center gap-1 self-end sm:self-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800/80 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === 'list'
                        ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>List</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === 'grid'
                        ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Grid</span>
                  </button>
                </div>
              </div>

              {/* Bulk Actions Floating Bar */}
              {tableSelectedTasks.size > 0 && (
                <div className="rounded-2xl bg-[#0059e0] text-white px-5 sm:px-6 py-3.5 shadow-lg flex items-center justify-between gap-4 flex-wrap animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center gap-5 sm:gap-7 flex-wrap text-sm font-medium">
                    {/* Selected Count */}
                    <span className="font-semibold whitespace-nowrap">
                      {tableSelectedTasks.size} Selected
                    </span>

                    {/* Divider */}
                    <div className="h-4 w-px bg-white/30 hidden sm:block" />

                    {/* Assign Action */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={bulkActionLoading}
                          className="hover:text-blue-100 hover:underline cursor-pointer transition-colors whitespace-nowrap disabled:opacity-50 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                        >
                          Assign
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        side="bottom"
                        sideOffset={6}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                        className="z-[10050] w-64 max-h-64 overflow-y-auto thin-scrollbar rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-1.5 shadow-2xl text-gray-900 dark:text-white"
                      >
                        <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                          Assign selected tasks to
                        </div>
                        <DropdownMenuItem
                          onClick={() => handleBulkAssign(null)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors text-gray-700 dark:text-gray-300"
                        >
                          <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400">
                            <User className="w-3.5 h-3.5" />
                          </div>
                          <span>Unassign</span>
                        </DropdownMenuItem>
                        {assignableMembers.map(member => (
                          <DropdownMenuItem
                            key={member.id}
                            onClick={() => handleBulkAssign(member)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors text-gray-700 dark:text-gray-300"
                          >
                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-[10px] font-semibold">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{member.name}</p>
                              {member.email && (
                                <p className="text-[10px] text-gray-400 truncate">{member.email}</p>
                              )}
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Mark Done Action */}
                    <button
                      type="button"
                      onClick={() => handleBulkMarkStatus('done', 'Done')}
                      disabled={bulkActionLoading}
                      className="hover:text-blue-100 hover:underline cursor-pointer transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      Mark Done
                    </button>

                    {/* Mark In Progress Action */}
                    <button
                      type="button"
                      onClick={() => handleBulkMarkStatus('in_progress', 'In Progress')}
                      disabled={bulkActionLoading}
                      className="hover:text-blue-100 hover:underline cursor-pointer transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      Mark In Progress
                    </button>

                    {/* Move to Sprint Action */}
                    <DropdownMenu onOpenChange={(open) => {
                      if (open) {
                        loadAvailableSprints(sprintId, sprint?.project?._id)
                      }
                    }}>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={bulkActionLoading}
                          className="hover:text-blue-100 hover:underline cursor-pointer transition-colors whitespace-nowrap disabled:opacity-50 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                        >
                          Move to Sprint
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        side="bottom"
                        sideOffset={6}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                        className="z-[10050] w-64 max-h-64 overflow-y-auto thin-scrollbar rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-1.5 shadow-2xl text-gray-900 dark:text-white"
                      >
                        <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                          Move selected tasks to
                        </div>
                        <DropdownMenuItem
                          onClick={() => handleBulkMoveToSprint(null)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors text-orange-600 dark:text-orange-400 font-medium"
                        >
                          <span>Backlog (Remove from sprint)</span>
                        </DropdownMenuItem>
                        {availableSprintsLoading ? (
                          <div className="p-3 text-center text-xs text-gray-400">
                            <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                            Loading sprints...
                          </div>
                        ) : availableSprints.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-gray-400">
                            No other active or planning sprints found.
                          </div>
                        ) : (
                          availableSprints.map(s => (
                            <DropdownMenuItem
                              key={s._id}
                              onClick={() => handleBulkMoveToSprint(s._id)}
                              className="w-full flex items-center justify-between px-3 py-2 text-xs text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors text-gray-700 dark:text-gray-300"
                            >
                              <span className="font-medium truncate">{s.name}</span>
                              <span className="text-[10px] text-gray-400 capitalize shrink-0 ml-2">{s.status}</span>
                            </DropdownMenuItem>
                          ))
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>


                    {/* Export Selected Action */}
                    <button
                      type="button"
                      onClick={handleExportSelected}
                      disabled={bulkActionLoading}
                      className="hover:text-blue-100 hover:underline cursor-pointer transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      Export Selected
                    </button>
                  </div>

                  {/* Right side: Loading or Clear */}
                  <div className="flex items-center gap-3">
                    {bulkActionLoading ? (
                      <span className="flex items-center gap-1.5 text-xs text-blue-100">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Updating...
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTableSelectedTasks(new Set())}
                        className="text-xs text-white/80 hover:text-white px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                        title="Deselect all"
                      >
                        ✕ Clear
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Tasks Content */}
              {filteredSprintTasks.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center shadow-xs">
                  <ClipboardList className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">No tasks found</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                    {searchQuery || filterStatus !== 'all' || filterAssignee !== 'all' || filterPriority !== 'all' || filterType !== 'all'
                      ? 'Try clearing or changing your filters to see more tasks.'
                      : (sprint.status === 'completed' ? 'No tasks were assigned to this sprint.' : 'No tasks are currently assigned to this sprint.')}
                  </p>
                  {(searchQuery || filterStatus !== 'all' || filterAssignee !== 'all' || filterPriority !== 'all' || filterType !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('')
                        setFilterStatus('all')
                        setFilterAssignee('all')
                        setFilterPriority('all')
                        setFilterType('all')
                      }}
                      className="mt-4 inline-flex items-center px-3.5 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col lg:flex-row gap-5 items-start">
                  {/* Left Column: Tasks Table / Grid */}
                  <div className="flex-1 min-w-0 w-full space-y-4">
                    {viewMode === 'list' ? (
                      /* List View: Table */
                      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs overflow-hidden">
                        <div className="overflow-x-auto thin-scrollbar [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 dark:hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/75 dark:bg-gray-800/40 text-[11px] font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase">
                                <th className="py-3.5 pl-4 pr-2 w-10">
                                  <input
                                    type="checkbox"
                                    checked={tableSelectedTasks.size > 0 && tableSelectedTasks.size === filteredSprintTasks.length}
                                    onChange={() => {
                                      if (tableSelectedTasks.size === filteredSprintTasks.length) {
                                        setTableSelectedTasks(new Set())
                                      } else {
                                        setTableSelectedTasks(new Set(filteredSprintTasks.map(t => t._id)))
                                      }
                                    }}
                                    className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                </th>
                                <th className="py-3.5 px-3 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => setTaskSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                                    className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors uppercase font-semibold text-[11px] tracking-wider cursor-pointer select-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                                    title={`Sort tasks (${taskSortOrder === 'desc' ? 'Newest first (click for oldest first)' : 'Oldest first (click for newest first)'})`}
                                  >
                                    TASK ID {taskSortOrder === 'desc' ? (
                                      <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 stroke-[2.5]" />
                                    ) : (
                                      <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 stroke-[2.5]" />
                                    )}
                                  </button>
                                </th>
                                <th className="py-3.5 px-3 whitespace-nowrap">MODULE</th>
                                <th className="py-3.5 px-3 min-w-[180px]">TASK</th>
                                <th className="py-3.5 px-3 whitespace-nowrap">TYPE</th>
                                <th className="py-3.5 px-3 whitespace-nowrap">ASSIGNEE</th>
                                <th className="py-3.5 px-3 whitespace-nowrap">PRIORITY</th>
                                <th className="py-3.5 px-3 whitespace-nowrap">STATUS</th>
                                <th className="py-3.5 px-3 whitespace-nowrap">START</th>
                                <th className="py-3.5 px-3 whitespace-nowrap">DUE</th>
                                <th className="py-3.5 px-3 whitespace-nowrap">EST.</th>
                                <th className="py-3.5 px-3 whitespace-nowrap">ACT.</th>
                                <th className="py-3.5 pr-4 pl-2 text-right">ACTION</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70 text-sm">
                              {paginatedSprintTasks.map((task, index) => {
                                const isSelected = tableSelectedTasks.has(task._id)
                                const isEditingThisTask = editingTask?._id === task._id
                                const p = (task.priority || 'medium').toLowerCase()
                                const isNearBottom = index >= Math.max(1, paginatedSprintTasks.length - 2)

                                const priorityConfig = PRIORITY_CONFIG
                                const currentPriorityCfg = PRIORITY_CONFIG[p] || PRIORITY_CONFIG.medium

                                return (
                                  <tr
                                    key={task._id}
                                    className={`hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors ${
                                      isEditingThisTask
                                        ? 'bg-blue-50/60 dark:bg-blue-950/30 ring-1 ring-blue-500/30'
                                        : isSelected
                                        ? 'bg-blue-50/40 dark:bg-blue-950/20'
                                        : ''
                                    }`}
                                  >
                                    {/* Checkbox */}
                                    <td className="py-3 pl-4 pr-2">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => {
                                          setTableSelectedTasks(prev => {
                                            const next = new Set(prev)
                                            if (next.has(task._id)) next.delete(task._id)
                                            else next.add(task._id)
                                            return next
                                          })
                                        }}
                                        className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                      />
                                    </td>

                                    {/* Task ID */}
                                    <td className="py-3 px-3 whitespace-nowrap">
                                      <span className="font-apple-mono text-xs font-semibold px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/60">
                                        #{task.displayId || task._id.slice(-4)}
                                      </span>
                                    </td>

                                    {/* Module */}
                                    <td className="py-3 px-3 whitespace-nowrap">
                                      <span
                                        className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate max-w-[120px] block"
                                        title={task.module || task.story?.title || task.epic?.title || '—'}
                                      >
                                        {task.module || task.story?.title || task.epic?.title || '—'}
                                      </span>
                                    </td>

                                    {/* Task Title */}
                                    <td className="py-3 px-3">
                                      <span
                                        onClick={() => handleOpenEditTask(task)}
                                        className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer line-clamp-1"
                                        title={task.title}
                                      >
                                        {task.title || 'Untitled Task'}
                                      </span>
                                    </td>

                                    {/* Type */}
                                    <td className="py-3 px-3 whitespace-nowrap">
                                      {(() => {
                                        const t = (task.type || 'task').toLowerCase()
                                        let badgeCls = 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
                                        if (t === 'story') badgeCls = 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                                        else if (t === 'bug') badgeCls = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                                        else if (t === 'task') badgeCls = 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800'
                                        else if (t === 'improvement') badgeCls = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                        return (
                                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badgeCls}`}>
                                            {formatToTitleCase(t)}
                                          </span>
                                        )
                                      })()}
                                    </td>

                                    {/* Assignee */}
                                    <td className="py-3 px-3 whitespace-nowrap">
                                      {(() => {
                                        if (!task.assignedTo || !Array.isArray(task.assignedTo) || task.assignedTo.length === 0) {
                                          return (
                                            <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400" title="Unassigned">
                                              <User className="w-3.5 h-3.5" />
                                            </div>
                                          )
                                        }
                                        const first = task.assignedTo[0]
                                        const name = typeof first === 'object'
                                          ? `${first?.user?.firstName || first?.firstName || ''} ${first?.user?.lastName || first?.lastName || ''}`.trim()
                                          : 'Assignee'
                                        const initial = name ? name.charAt(0).toUpperCase() : 'U'
                                        return (
                                          <div className="flex items-center gap-1.5" title={name || 'Assignee'}>
                                            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-xs font-semibold shadow-xs">
                                              {initial}
                                            </div>
                                            {task.assignedTo.length > 1 && (
                                              <span className="text-[11px] font-medium text-gray-500">+{task.assignedTo.length - 1}</span>
                                            )}
                                          </div>
                                        )
                                      })()}
                                    </td>

                                    {/* Priority Dropdown */}
                                    <td className="py-3 px-3 whitespace-nowrap">
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button
                                            type="button"
                                            disabled={taskStatusUpdating === task._id}
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${currentPriorityCfg.cls} hover:opacity-90 transition-opacity cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 select-none`}
                                          >
                                            {currentPriorityCfg.icon}
                                            <span>{currentPriorityCfg.label}</span>
                                            <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                          align="start"
                                          side={isNearBottom ? 'top' : 'bottom'}
                                          sideOffset={4}
                                          collisionPadding={12}
                                          onCloseAutoFocus={(e) => e.preventDefault()}
                                          className="z-[10050] w-36 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-1.5 shadow-xl text-xs [&_*]:text-xs outline-none"
                                        >
                                          {(['critical', 'high', 'medium', 'low'] as const).map(priKey => {
                                            const cfg = priorityConfig[priKey]
                                            const isPriSelected = p === priKey
                                            return (
                                              <DropdownMenuItem
                                                key={priKey}
                                                onClick={() => handleTaskPriorityChange(task._id, priKey)}
                                                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left cursor-pointer rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors ${
                                                  isPriSelected ? 'font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20' : 'text-gray-700 dark:text-gray-300'
                                                }`}
                                              >
                                                <span className="flex items-center gap-2">
                                                  {cfg.icon}
                                                  <span>{cfg.label}</span>
                                                </span>
                                                {isPriSelected && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                                              </DropdownMenuItem>
                                            )
                                          })}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </td>

                                    {/* Status Dropdown */}
                                    <td className="py-3 px-3 whitespace-nowrap">
                                      <DropdownMenu
                                        open={activeStatusMenuTaskId === task._id}
                                        onOpenChange={(open) => setActiveStatusMenuTaskId(open ? task._id : null)}
                                      >
                                        <DropdownMenuTrigger asChild>
                                          <button
                                            type="button"
                                            disabled={taskStatusUpdating === task._id || task.archived}
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getTaskStatusBadgeClass(task.status)} hover:opacity-90 transition-opacity cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 select-none`}
                                          >
                                            <span>{formatTaskStatusLabel(task.status)}</span>
                                            <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                          align="start"
                                          side={isNearBottom ? 'top' : 'bottom'}
                                          sideOffset={4}
                                          collisionPadding={12}
                                          onCloseAutoFocus={(e) => e.preventDefault()}
                                          className="z-[10050] w-48 max-h-80 overflow-y-auto thin-scrollbar rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-1.5 shadow-xl text-xs [&_*]:text-xs outline-none"
                                        >
                                          {projectStatusOptions.map(option => {
                                            const isStatSelected = task.status === option.value
                                            const isCustomStatus = Boolean(option.value) && !DEFAULT_TASK_STATUS_KEYS.includes(option.value as any)
                                            return (
                                              <DropdownMenuItem
                                                key={option.value}
                                                onSelect={() => {
                                                  setActiveStatusMenuTaskId(null)
                                                  handleTaskStatusChange(task._id, option.value)
                                                }}
                                                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left cursor-pointer rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors group ${
                                                  isStatSelected ? 'font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20' : 'text-gray-700 dark:text-gray-300'
                                                }`}
                                              >
                                                <div className="flex items-center gap-2 min-w-0 mr-1.5">
                                                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                                                    option.value === 'done' || option.value === 'completed'
                                                      ? 'bg-emerald-500'
                                                      : option.value === 'in_progress'
                                                      ? 'bg-amber-500'
                                                      : option.value === 'testing'
                                                      ? 'bg-purple-500'
                                                      : option.value === 'review'
                                                      ? 'bg-indigo-500'
                                                      : 'bg-blue-500'
                                                  }`} />
                                                  <span className="truncate">{option.label}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                  {isStatSelected && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                                                  {isCustomStatus && (
                                                    <button
                                                      type="button"
                                                      data-action="delete-status"
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        e.preventDefault()
                                                        setActiveStatusMenuTaskId(null)
                                                        setTimeout(() => {
                                                          setStatusToDelete({ value: option.value, label: option.label })
                                                        }, 50)
                                                      }}
                                                      className="p-1 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                                                      title={`Delete status "${option.label}"`}
                                                    >
                                                      <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                  )}
                                                </div>
                                              </DropdownMenuItem>
                                            )
                                          })}
                                          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                                          <DropdownMenuItem
                                            onSelect={() => {
                                              setActiveStatusMenuTaskId(null)
                                              setTargetTaskIdForNewStatus(task._id)
                                              setTimeout(() => {
                                                setIsAddStatusModalOpen(true)
                                              }, 50)
                                            }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left cursor-pointer rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/80 text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 focus:text-blue-600 dark:focus:text-blue-400 data-[highlighted]:text-blue-600 dark:data-[highlighted]:text-blue-400 font-medium transition-colors group"
                                          >
                                            <Plus className="w-3.5 h-3.5 shrink-0 transition-colors" />
                                            <span>Add new status</span>
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </td>

                                    {/* Start Date */}
                                    <td className="py-3 px-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                      {formatShortDate(task.startDate || task.createdAt)}
                                    </td>

                                    {/* Due Date */}
                                    <td className="py-3 px-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                      {formatShortDate(task.dueDate)}
                                    </td>

                                    {/* Estimated Hours */}
                                    <td className="py-3 px-3 whitespace-nowrap text-xs font-apple-mono text-gray-600 dark:text-gray-400">
                                      {task.estimatedHours ? `${task.estimatedHours}h` : '—'}
                                    </td>

                                    {/* Actual Hours */}
                                    <td className="py-3 px-3 whitespace-nowrap text-xs font-apple-mono text-gray-600 dark:text-gray-400">
                                      {task.actualHours ? `${task.actualHours}h` : (task.loggedHours ? `${task.loggedHours}h` : '—')}
                                    </td>

                                    {/* Edit Action Button */}
                                    <td className="py-3 pr-4 pl-2 text-right whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditTask(task)}
                                        className={`p-1.5 rounded-lg transition-colors cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${
                                          isEditingThisTask
                                            ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-500/30'
                                            : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                                        }`}
                                        title="Edit task"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      /* Grid View: Cards */
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                        {paginatedSprintTasks.map(task => {
                          const isTaskSelected = tableSelectedTasks.has(task._id)
                          const isEditingThisTask = editingTask?._id === task._id
                          return (
                            <div
                              key={task._id}
                              onClick={() => handleOpenEditTask(task)}
                              className={`rounded-2xl border bg-white dark:bg-gray-900 p-4 space-y-3 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all relative ${
                                isEditingThisTask
                                  ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-md'
                                  : isTaskSelected
                                  ? 'border-blue-400 ring-2 ring-blue-500/20 shadow-xs'
                                  : 'border-gray-200 dark:border-gray-800'
                              } ${task.archived ? 'border-dashed opacity-90' : ''}`}
                            >
                              <div className="flex items-start gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={isTaskSelected}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={() => {
                                    setTableSelectedTasks(prev => {
                                      const next = new Set(prev)
                                      if (next.has(task._id)) next.delete(task._id)
                                      else next.add(task._id)
                                      return next
                                    })
                                  }}
                                  className="mt-1 rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {task?.displayId && (
                                        <span className="font-apple-mono text-[11px] font-semibold px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 shrink-0">
                                          #{task.displayId}
                                        </span>
                                      )}
                                      <h4 className="text-[14px] font-semibold text-gray-900 dark:text-white truncate" title={task.title}>
                                        {task?.title || 'Untitled Task'}
                                      </h4>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleOpenEditTask(task)
                                      }}
                                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
                                      title="Edit task"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <p className="text-[12px] text-gray-500 dark:text-gray-400">
                                    {(() => {
                                      if (!task?.assignedTo || !Array.isArray(task.assignedTo) || task.assignedTo.length === 0) {
                                        return 'Unassigned'
                                      }
                                      if (task.assignedTo.length === 1) {
                                        const assignee = task.assignedTo[0]
                                        if (typeof assignee === 'string') {
                                          return `Assigned to 1 person`
                                        } else {
                                          const firstName = assignee?.user?.firstName || assignee?.firstName || ''
                                          const lastName = assignee?.user?.lastName || assignee?.lastName || ''
                                          const displayName = `${firstName} ${lastName}`.trim()
                                          return displayName || 'Unknown User'
                                        }
                                      } else {
                                        return `Assigned to ${task.assignedTo.length} people`
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
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-[12px] font-medium text-gray-600 dark:text-gray-300 uppercase">
                                  {formatToTitleCase(task.priority)}
                                </span>
                                {task.archived && (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-[12px] font-medium text-gray-600 dark:text-gray-400 uppercase">
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
                                  <Label className="text-[12px] text-gray-600 dark:text-gray-400">Status</Label>
                                  <Select
                                    value={task.status}
                                    onValueChange={(value) => handleTaskStatusChange(task._id, value)}
                                    disabled={taskStatusUpdating === task._id || task.archived}
                                  >
                                    <SelectTrigger className="text-[13px] rounded-lg border-gray-200 dark:border-gray-800">
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
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Pagination Controls */}
                    {filteredSprintTasks.length > 0 && (
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                        <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                          <span>Items per page:</span>
                          <Select
                            value={String(sprintTasksPageSize)}
                            onValueChange={(val) => {
                              setSprintTasksPageSize(parseInt(val))
                              setSprintTasksCurrentPage(1)
                            }}
                          >
                            <SelectTrigger className="h-8 w-[72px] px-2.5 rounded-lg border-gray-200 dark:border-gray-800 text-xs bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[10050] min-w-[4.5rem]">
                              {['5', '10', '20', '50', '100'].map(sz => (
                                <SelectItem key={sz} value={sz}>{sz}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span>
                            Showing {((sprintTasksCurrentPage - 1) * sprintTasksPageSize) + 1} to {Math.min(sprintTasksCurrentPage * sprintTasksPageSize, filteredSprintTasks.length)} of {filteredSprintTasks.length}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSprintTasksCurrentPage(sprintTasksCurrentPage - 1)}
                            disabled={sprintTasksCurrentPage === 1}
                            className="h-8 px-3 rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                          >
                            Previous
                          </button>
                          <span className="text-xs font-mono text-gray-600 dark:text-gray-400 px-2">
                            {sprintTasksCurrentPage}/{sprintTasksTotalPages || 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSprintTasksCurrentPage(sprintTasksCurrentPage + 1)}
                            disabled={sprintTasksCurrentPage >= sprintTasksTotalPages}
                            className="h-8 px-3 rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Side Card Edit */}
                  {editingTask && (
                    <div className="w-full lg:w-[380px] xl:w-[420px] shrink-0 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm space-y-4 animate-in fade-in slide-in-from-right-2 duration-150 sticky top-4">
                      {/* Side Card Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {editingTask.displayId ? `#${editingTask.displayId}` : `#${editingTask._id.slice(-4)}`}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                            editFormData.type === 'story'
                              ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                              : editFormData.type === 'bug'
                              ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                              : 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800'
                          }`}>
                            {formatToTitleCase(editFormData.type || 'task')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => window.open(`/tasks/${editingTask._id}`, '_blank')}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                            title="Open full task in new tab"
                          >
                            <Link2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTask(null)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                            title="Close"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Form Fields */}
                      <div className="space-y-4 text-xs">
                        {/* Module */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            Module <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={editFormData.module}
                            onChange={(e) => setEditFormData(prev => ({ ...prev, module: e.target.value }))}
                            placeholder="e.g. Search functionality"
                            className="w-full h-11 px-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          />
                        </div>

                        {/* Task Title */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            Task <span className="text-rose-500">*</span>
                          </label>
                          <textarea
                            rows={2}
                            value={editFormData.title}
                            onChange={(e) => setEditFormData(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="Task title"
                            className="w-full p-3.5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          />
                        </div>

                        {/* Type & Priority side by side */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Type</label>
                            <Select
                              value={editFormData.type}
                              onValueChange={(val) => setEditFormData(prev => ({ ...prev, type: val }))}
                            >
                              <SelectTrigger className="h-10 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500/20">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent className="z-[10050]">
                                <SelectItem value="story">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                                    <span>Story</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="task">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                                    <span>Task</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="bug">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                                    <span>Bug</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="improvement">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                    <span>Improvement</span>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Priority</label>
                            <Select
                              value={editFormData.priority}
                              onValueChange={(val) => setEditFormData(prev => ({ ...prev, priority: val }))}
                            >
                              <SelectTrigger className="h-10 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500/20">
                                <SelectValue placeholder="Select priority" />
                              </SelectTrigger>
                              <SelectContent className="z-[10050]">
                                {(['critical', 'high', 'medium', 'low'] as const).map(priKey => {
                                  const cfg = PRIORITY_CONFIG[priKey]
                                  return (
                                    <SelectItem key={priKey} value={priKey}>
                                      <div className="flex items-center gap-2">
                                        {cfg.icon}
                                        <span>{cfg.label}</span>
                                      </div>
                                    </SelectItem>
                                  )
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Status */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Status</label>
                          <Select
                            value={editFormData.status}
                            onValueChange={(val) => setEditFormData(prev => ({ ...prev, status: val }))}
                          >
                            <SelectTrigger className="h-10 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500/20">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent className="z-[10050] max-h-60 overflow-y-auto thin-scrollbar">
                              {projectStatusOptions.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                                      option.value === 'done' || option.value === 'completed'
                                        ? 'bg-emerald-500'
                                        : option.value === 'in_progress'
                                        ? 'bg-amber-500'
                                        : option.value === 'testing'
                                        ? 'bg-purple-500'
                                        : option.value === 'review'
                                        ? 'bg-indigo-500'
                                        : 'bg-blue-500'
                                    }`} />
                                    <span>{option.label}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Assignee */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Assignee</label>
                          <Select
                            value={editFormData.assigneeId || 'unassigned'}
                            onValueChange={(val) => setEditFormData(prev => ({ ...prev, assigneeId: val === 'unassigned' ? '' : val }))}
                          >
                            <SelectTrigger className="h-10 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500/20">
                              <SelectValue placeholder="Select assignee" />
                            </SelectTrigger>
                            <SelectContent className="z-[10050] max-h-60 overflow-y-auto thin-scrollbar">
                              <SelectItem value="unassigned">
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 shrink-0">
                                    <User className="w-3 h-3" />
                                  </div>
                                  <span>Unassigned</span>
                                </div>
                              </SelectItem>
                              {assignableMembers.map(member => {
                                const initial = member.name ? member.name.charAt(0).toUpperCase() : 'U'
                                return (
                                  <SelectItem key={member.id} value={member.id}>
                                    <div className="flex items-center gap-2">
                                      <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-[10px] font-semibold shrink-0">
                                        {initial}
                                      </div>
                                      <span className="truncate">{member.name}</span>
                                    </div>
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Estimated Hours & Actual Hours side by side */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Estimated Hours</label>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={editFormData.estimatedHours}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, estimatedHours: e.target.value }))}
                              placeholder="0"
                              className="w-full h-10 px-3.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Actual Hours</label>
                            <input
                              type="text"
                              value={editFormData.actualHours}
                              disabled={true}
                              readOnly={true}
                              title="Actual hours cannot be edited directly"
                              className="w-full h-10 px-3.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800 text-xs font-mono text-gray-500 dark:text-gray-400 cursor-not-allowed select-none opacity-80"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Side Card Footer */}
                      <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800">
                        <button
                          type="button"
                          onClick={() => {
                            setTaskToDeleteId(editingTask._id)
                            setShowDeleteTaskConfirm(true)
                          }}
                          className="p-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-colors cursor-pointer"
                          title="Delete task"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingTask(null)}
                            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveTaskEdit}
                            disabled={!hasEditFormChanges || !editFormData.title.trim() || savingTaskEdit}
                            className="px-5 py-2 rounded-xl bg-[#0059e0] hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#0059e0] transition-all duration-150 cursor-pointer flex items-center gap-1.5"
                          >
                            {savingTaskEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Save Changes
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}
        {/* Add Custom Status Modal */}
        <AddCustomStatusModal
          isOpen={isAddStatusModalOpen}
          onClose={() => {
            setIsAddStatusModalOpen(false)
            setTargetTaskIdForNewStatus(null)
          }}
          projectId={sprint?.project?._id}
          sprintName={sprint?.name}
          onStatusCreated={handleStatusCreated}
        />

        {/* Create Task Modal */}
        {showCreateTaskModal && sprint?.project?._id && (
          <CreateTaskModal
            isOpen={showCreateTaskModal}
            onClose={() => setShowCreateTaskModal(false)}
            projectId={sprint.project._id}
            sprintId={sprintId}
            defaultStatus="todo"
            stayOnCurrentPage={true}
            onTaskCreated={() => {
              setShowCreateTaskModal(false)
              fetchSprint()
            }}
          />
        )}
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

        {/* Delete Task Confirmation Modal */}
        <ConfirmationModal
          isOpen={showDeleteTaskConfirm}
          onClose={() => {
            setShowDeleteTaskConfirm(false)
            setTaskToDeleteId(null)
          }}
          onConfirm={handleDeleteTaskFromSideCard}
          title="Delete Task"
          description="Are you sure you want to delete this task? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          variant="destructive"
          isLoading={deletingTask}
        />

        {/* Delete Custom Status Confirmation Modal */}
        <DeleteCustomStatusModal
          isOpen={!!statusToDelete}
          onClose={() => setStatusToDelete(null)}
          onConfirm={handleDeleteCustomStatus}
          statusName={statusToDelete?.label || ''}
          isLoading={isDeletingStatus}
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
