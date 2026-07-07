
'use client'

import { useState, useEffect, useCallback, useRef, useMemo, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { formatToTitleCase, cn, truncateText } from '@/lib/utils'
import { useTaskSync, useTaskState } from '@/hooks/useTaskSync'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { Calendar as DateRangeCalendar } from '@/components/ui/calendar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus,
  Search,
  MoreHorizontal,
  Calendar,
  Clock,
  Loader2,
  Target,
  BarChart3,
  GripVertical,
  X,
  RotateCcw,
  Columns,
} from 'lucide-react'
import CreateTaskModal from '@/components/tasks/CreateTaskModal'
import EditTaskModal from '@/components/tasks/EditTaskModal'
import ViewTaskModal from '@/components/tasks/ViewTaskModal'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu'
import { DateRange } from 'react-day-picker'
import { format } from 'date-fns'
import { useNotify } from '@/lib/notify'
import { validateAndCorrectDateRange } from '@/lib/dateRangeValidation'
import { useAuthContext } from '@/contexts/AuthContext'

const TRUNCATION_LENGTH = 40
const TASK_FILTER_DROPDOWN_WIDTH = 'w-full'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Task {
  _id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled' | 'backlog'
  priority: 'low' | 'medium' | 'high' | 'critical'
  type: 'bug' | 'feature' | 'improvement' | 'task' | 'subtask'
  project: { _id: string; name: string }
  assignedTo?: { _id?: string; firstName: string; lastName: string; email: string }
  createdBy: { _id?: string; firstName: string; lastName: string; email: string }
  taskNumber?: string | number
  displayId?: string
  storyPoints?: number
  dueDate?: string
  estimatedHours?: number
  actualHours?: number
  labels: string[]
  position?: number
  createdAt: string
  updatedAt: string
}

interface Project {
  settings?: {
    kanbanStatuses?: Array<{ key: string; title: string; color?: string; order: number }>
    allowTimeTracking?: boolean
    allowManualTimeSubmission?: boolean
    allowExpenseTracking?: boolean
    requireApproval?: boolean
    notifications?: { taskUpdates?: boolean; budgetAlerts?: boolean; deadlineReminders?: boolean }
  }
  _id: string
  name: string
}

interface PersonOption { id: string; name: string; email?: string }
interface TaskOption { id: string; label: string; fullLabel: string }

// ─── Design Tokens ────────────────────────────────────────────────────────────

const PRIORITY_ACCENT: Record<string, string> = {
  low:      '#8E8E93',
  medium:   '#007AFF',
  high:     '#FF9500',
  critical: '#FF453A',
}

const PRIORITY_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  low:      { bg: 'bg-gray-50 dark:bg-gray-900/40',      text: 'text-gray-500 dark:text-gray-400',     border: 'border-gray-200 dark:border-gray-700' },
  medium:   { bg: 'bg-blue-50 dark:bg-blue-950/30',      text: 'text-blue-600 dark:text-blue-400',     border: 'border-blue-200 dark:border-blue-800' },
  high:     { bg: 'bg-orange-50 dark:bg-orange-950/30',  text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800' },
  critical: { bg: 'bg-red-50 dark:bg-red-950/30',        text: 'text-red-600 dark:text-red-400',       border: 'border-red-200 dark:border-red-800' },
}

const TYPE_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  bug:         { bg: 'bg-red-50 dark:bg-red-950/30',        text: 'text-red-600 dark:text-red-400',        border: 'border-red-200 dark:border-red-800' },
  feature:     { bg: 'bg-emerald-50 dark:bg-emerald-950/30',text: 'text-emerald-600 dark:text-emerald-400',border: 'border-emerald-200 dark:border-emerald-800' },
  improvement: { bg: 'bg-blue-50 dark:bg-blue-950/30',      text: 'text-blue-600 dark:text-blue-400',      border: 'border-blue-200 dark:border-blue-800' },
  task:        { bg: 'bg-gray-50 dark:bg-gray-900/40',       text: 'text-gray-500 dark:text-gray-400',      border: 'border-gray-200 dark:border-gray-700' },
  subtask:     { bg: 'bg-purple-50 dark:bg-purple-950/30',   text: 'text-purple-600 dark:text-purple-400',  border: 'border-purple-200 dark:border-purple-800' },
}

const COLUMN_ACCENT: Record<string, string> = {
  backlog:     '#8E8E93',
  todo:        '#007AFF',
  in_progress: '#FF9500',
  review:      '#BF5AF2',
  testing:     '#30B0C7',
  done:        '#34C759',
  cancelled:   '#FF453A',
}

function getColumnAccent(id: string) {
  return COLUMN_ACCENT[id] ?? '#007AFF'
}

const defaultColumns = [
  { id: 'backlog',     title: 'Backlog' },
  { id: 'todo',        title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'review',      title: 'Review' },
  { id: 'testing',     title: 'Testing' },
  { id: 'done',        title: 'Done' },
]

// ─── Micro-badge atom ─────────────────────────────────────────────────────────

function MicroBadge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap',
      className,
    )}>
      {children}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_BADGE[priority] ?? PRIORITY_BADGE.low
  return <MicroBadge className={cn(cfg.bg, cfg.text, cfg.border)}>{formatToTitleCase(priority)}</MicroBadge>
}

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_BADGE[type] ?? TYPE_BADGE.task
  return <MicroBadge className={cn(cfg.bg, cfg.text, cfg.border)}>{formatToTitleCase(type)}</MicroBadge>
}

// ─── Column ───────────────────────────────────────────────────────────────────

function ColumnDropZone({
  column, tasks, onCreateTask, onEditTask, onDeleteTask, pendingUpdates, canCreateTask, canDragTask,
}: {
  column: any
  tasks: Task[]
  onCreateTask?: (status?: string) => void
  onEditTask?: (task: Task) => void
  onDeleteTask?: (taskId: string) => void
  pendingUpdates?: Set<string>
  canCreateTask?: boolean
  canDragTask?: (task: Task) => boolean
}) {
  const router = useRouter()
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const accent = getColumnAccent(column.id)

  return (
    <div className={cn(
      'flex flex-col rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden',
      'shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none apple-transition',
      isOver && 'ring-2 ring-[var(--apple-system-blue)] ring-offset-2 ring-offset-background shadow-[0_4px_16px_rgba(0,122,255,0.12)]',
    )}>
      {/* Colour accent strip */}
      <div className="h-[3px] w-full flex-shrink-0" style={{ background: accent }} />

      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--apple-separator)]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--apple-label)]">{column.title}</span>
          <span
            className="inline-flex items-center justify-center h-4.5 min-w-[18px] px-1.5 rounded-full text-[10px] font-bold text-white font-apple-mono tabular-nums"
            style={{ background: accent }}
          >
            {tasks.length}
          </span>
        </div>
        {canCreateTask && (
          <button
            onClick={() => onCreateTask?.(column.id)}
            className="h-6 w-6 flex items-center justify-center rounded-md text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition"
            aria-label={`Add task to ${column.title}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Drop zone */}
      <SortableContext items={tasks.map(t => t._id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className="flex-1 space-y-2 p-3 min-h-[400px] max-h-[600px] overflow-y-auto overflow-x-hidden scrollbar-hide"
        >
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-center select-none">
              <div className="h-9 w-9 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] flex items-center justify-center">
                <Target className="h-4 w-4 text-[var(--apple-tertiary-label)]" />
              </div>
              <p className="text-[12px] text-[var(--apple-tertiary-label)]">Drop tasks here</p>
            </div>
          ) : (
            tasks.map((task) => (
              <SortableTask
                key={`${task._id}-${task.status}-${task.position}`}
                task={task}
                onClick={() => router.push(`/tasks/${task._id}`)}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
                isUpdating={pendingUpdates?.has(task._id)}
                isDraggable={canDragTask ? canDragTask(task) : true}
              />
            ))
          )}
        </div>
      </SortableContext>

      {/* Add task footer (shown when column has cards) */}
      {canCreateTask && tasks.length > 0 && (
        <button
          onClick={() => onCreateTask?.(column.id)}
          className="flex items-center gap-1.5 w-full px-4 py-2.5 text-[13px] text-[var(--apple-tertiary-label)] hover:text-[var(--apple-secondary-label)] border-t border-[var(--apple-separator)] hover:bg-[var(--apple-quaternary-fill)] apple-transition"
        >
          <Plus className="h-3.5 w-3.5" />
          Add task
        </button>
      )}
    </div>
  )
}

// ─── Kanban Board Skeleton ────────────────────────────────────────────────────

function KanbanSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-44 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
          <div className="h-4 w-60 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
        </div>
        <div className="h-9 w-28 bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-md)] animate-pulse" />
      </div>
      <div className="h-10 w-full bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-md)] animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden">
            <div className="h-[3px] bg-[var(--apple-tertiary-fill)]" />
            <div className="px-3 py-2.5 border-b border-[var(--apple-separator)] flex items-center gap-2">
              <div className="h-4 w-20 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
              <div className="h-4 w-5 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
            </div>
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((j) => (
                <div key={j} className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-card p-3 space-y-2">
                  <div className="h-4 w-3/4 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
                  <div className="h-3 w-1/2 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
                  <div className="flex gap-1.5">
                    <div className="h-4 w-14 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
                    <div className="h-4 w-12 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KanbanPage() {
  const router = useRouter()
  const { formatDate } = useDateTime()
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [userRole, setUserRole] = useState<string | null>(null)
  const { success: notifySuccess, error: notifyError } = useNotify()
  const permissions = usePermissions()
  const canCreateTask = permissions?.hasPermission(Permission.TASK_CREATE) || false
  const [searchQuery, setSearchQuery] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
  const [showEditTaskModal, setShowEditTaskModal] = useState(false)
  const [showViewTaskModal, setShowViewTaskModal] = useState(false)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [createTaskStatus, setCreateTaskStatus] = useState<string | undefined>(undefined)
  const [assignedToFilter, setAssignedToFilter] = useState('all')
  const [assignedByFilter, setAssignedByFilter] = useState('all')
  const [assignedToOptions, setAssignedToOptions] = useState<PersonOption[]>([])
  const [assignedByOptions, setAssignedByOptions] = useState<PersonOption[]>([])
  const [assignedToFilterQuery, setAssignedToFilterQuery] = useState('')
  const [assignedByFilterQuery, setAssignedByFilterQuery] = useState('')
  const [projectFilterQuery, setProjectFilterQuery] = useState('')
  const [priorityFilterQuery, setPriorityFilterQuery] = useState('')
  const [typeFilterQuery, setTypeFilterQuery] = useState('')
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRange | undefined>()
  const [taskNumberFilter, setTaskNumberFilter] = useState('all')
  const [taskNumberFilterQuery, setTaskNumberFilterQuery] = useState('')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [pendingUpdates, setPendingUpdates] = useState<Set<string>>(new Set())

  const focusSearchInput = (el: HTMLInputElement | null) => {
    if (!el || el.disabled) return
    const doFocus = () => {
      el.focus({ preventScroll: true })
      try { el.select?.() } catch { /* ignore */ }
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(doFocus)
    } else {
      setTimeout(doFocus, 0)
    }
  }

  const projectFilterInputRef = useRef<HTMLInputElement | null>(null)
  const assignedToFilterInputRef = useRef<HTMLInputElement | null>(null)
  const assignedByFilterInputRef = useRef<HTMLInputElement | null>(null)
  const priorityFilterInputRef = useRef<HTMLInputElement | null>(null)
  const typeFilterInputRef = useRef<HTMLInputElement | null>(null)
  const taskNumberFilterInputRef = useRef<HTMLInputElement | null>(null)
  const hasFetchedProjects = useRef(false)

  const isAdmin = userRole === 'admin'

  const hasActiveFilters =
    projectFilter !== 'all' || priorityFilter !== 'all' || typeFilter !== 'all' ||
    assignedToFilter !== 'all' || assignedByFilter !== 'all' ||
    taskNumberFilter !== 'all' || dateRangeFilter !== undefined

  const resetFilters = () => {
    setProjectFilter('all'); setPriorityFilter('all'); setTypeFilter('all')
    setAssignedToFilter('all'); setAssignedByFilter('all'); setTaskNumberFilter('all')
    setDateRangeFilter(undefined); setProjectFilterQuery(''); setPriorityFilterQuery('')
    setTypeFilterQuery(''); setAssignedToFilterQuery(''); setAssignedByFilterQuery('')
    setTaskNumberFilterQuery('')
  }

  const handleDateRangeChange = useCallback((range: DateRange | undefined) => {
    if (!range) { setDateRangeFilter(undefined); return }
    const correctedRange = validateAndCorrectDateRange(range.from, range.to)
    setDateRangeFilter(correctedRange as DateRange | undefined)
  }, [])

  const {
    tasks, setTasks, isLoading: taskLoading, error: taskError,
    updateTask, handleTaskUpdate, handleTaskCreate, handleTaskDelete,
  } = useTaskState([])

  const { isConnected, startPolling, stopPolling, updateTaskOptimistically } = useTaskSync({
    onTaskUpdate: handleTaskUpdate,
    onTaskCreate: handleTaskCreate,
    onTaskDelete: handleTaskDelete,
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/tasks')
      const data = await response.json()
      if (data.success) setTasks(data.data)
      else notifyError({ title: 'Failed to Load Tasks', message: data.error || 'Failed to fetch tasks' })
    } catch {
      notifyError({ title: 'Failed to Load Tasks', message: 'Failed to fetch tasks' })
    } finally {
      setLoading(false)
    }
  }, [setTasks])

  const fetchProjects = useCallback(async (force = false) => {
    if (hasFetchedProjects.current && !force) return
    let fetchSucceeded = false
    hasFetchedProjects.current = true
    try {
      const response = await fetch('/api/projects')
      const data = await response.json()
      if (data.success && Array.isArray(data.data)) setProjects(data.data)
      else setProjects([])
      fetchSucceeded = true
    } catch (err) {
      console.error('Failed to fetch projects:', err)
      setProjects([])
    } finally {
      if (!fetchSucceeded) hasFetchedProjects.current = false
    }
  }, [])

  const fetchSelectedProject = useCallback(async (projectId: string) => {
    if (projectId === 'all') { setSelectedProject(null); return }
    try {
      const response = await fetch(`/api/projects/${projectId}`)
      const data = await response.json()
      if (data.success) setSelectedProject(data.data)
      else setSelectedProject(null)
    } catch (err) {
      console.error('Failed to fetch project:', err)
      setSelectedProject(null)
    }
  }, [])

  const getColumns = useCallback(() => {
    if (selectedProject?.settings?.kanbanStatuses && selectedProject.settings.kanbanStatuses.length > 0) {
      return selectedProject.settings.kanbanStatuses
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(col => ({ id: col.key, title: col.title }))
    }
    if (projectFilter === 'all' && projects.length > 0) {
      const statusSet = new Set<string>()
      const statusMap = new Map<string, { title: string }>()
      projects.forEach(project => {
        project.settings?.kanbanStatuses?.forEach(col => {
          if (!statusSet.has(col.key)) { statusSet.add(col.key); statusMap.set(col.key, { title: col.title }) }
        })
      })
      if (statusMap.size > 0) return Array.from(statusMap.entries()).map(([key, val]) => ({ id: key, title: val.title }))
    }
    return defaultColumns
  }, [selectedProject, projectFilter, projects])

  useEffect(() => {
    const assignedToMap = new Map<string, PersonOption>()
    const assignedByMap = new Map<string, PersonOption>()
    tasks.forEach((task) => {
      if (task.assignedTo && Array.isArray(task.assignedTo)) {
        (task.assignedTo as any[]).forEach((assignee: any) => {
          if (assignee.user) {
            const id = assignee.user._id
            if (id) assignedToMap.set(id, { id, name: `${assignee.user.firstName} ${assignee.user.lastName}`.trim(), email: assignee.user.email })
          }
        })
      }
      if (task.createdBy) {
        const id = task.createdBy._id || task.createdBy.email || `${task.createdBy.firstName}-${task.createdBy.lastName}`
        if (id) assignedByMap.set(id, { id, name: `${task.createdBy.firstName} ${task.createdBy.lastName}`.trim(), email: task.createdBy.email })
      }
    })
    setAssignedToOptions(Array.from(assignedToMap.values()).sort((a, b) => a.name.localeCompare(b.name)))
    setAssignedByOptions(Array.from(assignedByMap.values()).sort((a, b) => a.name.localeCompare(b.name)))
  }, [tasks])

  useEffect(() => {
    if (assignedToFilter !== 'all' && !assignedToOptions.some(o => o.id === assignedToFilter)) setAssignedToFilter('all')
    if (assignedByFilter !== 'all' && !assignedByOptions.some(o => o.id === assignedByFilter)) setAssignedByFilter('all')
    if (taskNumberFilter !== 'all' && !tasks.some(t => t._id === taskNumberFilter || String(t.taskNumber ?? '') === taskNumberFilter)) setTaskNumberFilter('all')
  }, [assignedToOptions, assignedByOptions, assignedToFilter, assignedByFilter, taskNumberFilter, tasks])

  useEffect(() => {
    fetchSelectedProject(projectFilter)
    if (projectFilter !== 'all') fetchProjects(true)
  }, [projectFilter, fetchSelectedProject, fetchProjects])

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      if (response.ok) {
        try { const me = await response.json(); setUserRole(me?.role ?? null) } catch { setUserRole(null) }
        setAuthError('')
        await Promise.all([fetchTasks(), fetchProjects()])
        startPolling()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', { method: 'POST' })
        if (refreshResponse.ok) {
          try {
            const meResponse = await fetch('/api/auth/me')
            if (meResponse.ok) { const me = await meResponse.json(); setUserRole(me?.role ?? null) }
            else setUserRole(null)
          } catch { setUserRole(null) }
          setAuthError('')
          await Promise.all([fetchTasks(), fetchProjects()])
          startPolling()
        } else {
          setAuthError('Session expired'); setUserRole(null); stopPolling()
          setTimeout(() => router.push('/login'), 2000)
        }
      } else {
        setUserRole(null); stopPolling(); router.push('/login')
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setAuthError('Authentication failed'); setUserRole(null); stopPolling()
      setTimeout(() => router.push('/login'), 2000)
    }
  }, [router, startPolling, stopPolling, fetchTasks, fetchProjects])

  useEffect(() => { checkAuth() }, [checkAuth])
  useEffect(() => { if (taskError) notifyError({ title: 'Task Synchronization Error', message: taskError }) }, [taskError, notifyError])

  const startDateBoundary = useMemo(() => {
    if (!dateRangeFilter?.from) return null
    const d = new Date(dateRangeFilter.from); d.setHours(0, 0, 0, 0); return d
  }, [dateRangeFilter])

  const endDateBoundary = useMemo(() => {
    if (!dateRangeFilter?.to) return null
    const d = new Date(dateRangeFilter.to); d.setHours(23, 59, 59, 999); return d
  }, [dateRangeFilter])

  const filteredAssignedToOptions = useMemo(() => {
    if (!assignedToFilterQuery.trim()) return assignedToOptions
    const q = assignedToFilterQuery.toLowerCase()
    return assignedToOptions.filter(o => o.name.toLowerCase().includes(q) || (o.email?.toLowerCase().includes(q) ?? false))
  }, [assignedToOptions, assignedToFilterQuery])

  const filteredAssignedByOptions = useMemo(() => {
    if (!assignedByFilterQuery.trim()) return assignedByOptions
    const q = assignedByFilterQuery.toLowerCase()
    return assignedByOptions.filter(o => o.name.toLowerCase().includes(q) || (o.email?.toLowerCase().includes(q) ?? false))
  }, [assignedByOptions, assignedByFilterQuery])

  const taskNumberOptions = useMemo<TaskOption[]>(() => {
    const map = new Map<string, TaskOption>()
    tasks.forEach(task => {
      const id = task._id
      const identifier = task.displayId || (task.taskNumber ? String(task.taskNumber) : null)
      const fullLabel = identifier ? `#${identifier} - ${task.title}` : task.title
      const { truncated } = truncateText(fullLabel, TRUNCATION_LENGTH)
      map.set(id, { id, label: truncated, fullLabel })
    })
    return Array.from(map.values()).sort((a, b) => a.fullLabel.localeCompare(b.fullLabel))
  }, [tasks])

  const filteredTaskNumberOptions = useMemo(() => {
    if (!taskNumberFilterQuery.trim()) return taskNumberOptions
    const q = taskNumberFilterQuery.toLowerCase()
    return taskNumberOptions.filter(o => o.fullLabel.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
  }, [taskNumberOptions, taskNumberFilterQuery])

  const filteredProjectOptions = useMemo(() => {
    const q = projectFilterQuery.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(p => p.name.toLowerCase().includes(q))
  }, [projects, projectFilterQuery])

  const priorityOptions = [
    { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' },
  ]
  const filteredPriorityOptions = useMemo(() => {
    const q = priorityFilterQuery.trim().toLowerCase()
    if (!q) return priorityOptions
    return priorityOptions.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  }, [priorityFilterQuery])

  const typeOptions = [
    { value: 'bug', label: 'Bug' }, { value: 'feature', label: 'Feature' },
    { value: 'improvement', label: 'Improvement' }, { value: 'task', label: 'Task' },
    { value: 'subtask', label: 'Subtask' },
  ]
  const filteredTypeOptions = useMemo(() => {
    const q = typeFilterQuery.trim().toLowerCase()
    if (!q) return typeOptions
    return typeOptions.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  }, [typeFilterQuery])

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = !normalizedSearchQuery ||
      task.title.toLowerCase().includes(normalizedSearchQuery) ||
      (task.description || '').toLowerCase().includes(normalizedSearchQuery) ||
      (task.project?.name || '').toLowerCase().includes(normalizedSearchQuery) ||
      (task.displayId || '').toLowerCase().includes(normalizedSearchQuery) ||
      (task._id || '').toLowerCase().includes(normalizedSearchQuery)
    const matchesProject = projectFilter === 'all' || (task.project?._id && task.project._id === projectFilter)
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter
    const matchesType = typeFilter === 'all' || task.type === typeFilter
    const matchesAssignedTo = assignedToFilter === 'all' ||
      (Array.isArray(task.assignedTo) && (task.assignedTo as any[]).some((a: any) => a.user?._id === assignedToFilter))
    const createdById = task.createdBy?._id || task.createdBy?.email || `${task.createdBy?.firstName ?? ''}-${task.createdBy?.lastName ?? ''}`
    const matchesAssignedBy = assignedByFilter === 'all' || (createdById && createdById === assignedByFilter)
    const taskIdMatches = taskNumberFilter === 'all' ||
      task._id === taskNumberFilter ||
      (task.displayId && task.displayId === taskNumberFilter) ||
      (task.taskNumber && String(task.taskNumber) === taskNumberFilter)
    const dueDate = task.dueDate ? new Date(task.dueDate) : null
    const matchesStartDate = !startDateBoundary || (dueDate && dueDate >= startDateBoundary)
    const matchesEndDate = !endDateBoundary || (dueDate && dueDate <= endDateBoundary)
    return matchesSearch && matchesProject && matchesPriority && matchesType &&
      matchesAssignedTo && matchesAssignedBy && taskIdMatches && matchesStartDate && matchesEndDate
  })

  const getTasksByStatus = (status: string) => filteredTasks.filter(t => t.status === status)

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find(t => t._id === event.active.id)
    setActiveTask(task || null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)
    if (!over) return
    const activeId = active.id as string
    const overId = over.id
    if (activeId === overId) return

    const activeTaskItem = tasks.find(t => t._id === activeId)
    if (!activeTaskItem) return

    const columns = getColumns()
    let newStatus = activeTaskItem.status
    let shouldReorder = false
    let newPosition = activeTaskItem.position || 0

    if (typeof overId === 'string' && columns.some(col => col.id === overId)) {
      newStatus = overId as any
      newPosition = tasks.filter(t => t.status === newStatus).length
    } else if (typeof overId === 'string') {
      const overTask = tasks.find(t => t._id === overId)
      if (overTask) {
        newStatus = overTask.status
        const columnTasks = tasks.filter(t => t.status === newStatus)
        const overIndex = columnTasks.findIndex(t => t._id === overId)
        if (newStatus === activeTaskItem.status) {
          shouldReorder = true
          newPosition = overIndex
        } else {
          newPosition = columnTasks.length
        }
      }
    }

    const originalTask = { ...activeTaskItem }
    if (newStatus !== activeTaskItem.status || shouldReorder) {
      setPendingUpdates(prev => new Set(prev).add(activeId))
      setTasks(prevTasks => {
        const updatedTasks = [...prevTasks]
        const taskIndex = updatedTasks.findIndex(t => t._id === activeId)
        if (taskIndex !== -1) {
          updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], status: newStatus, position: newPosition }
          if (shouldReorder && newStatus === activeTaskItem.status) {
            const colTasks = updatedTasks.filter(t => t.status === newStatus)
            const otherTasks = updatedTasks.filter(t => t.status !== newStatus)
            const moved = colTasks.find(t => t._id === activeId)
            const remaining = colTasks.filter(t => t._id !== activeId)
            remaining.splice(newPosition, 0, moved!)
            return [...otherTasks, ...remaining]
          }
        }
        return updatedTasks
      })

      try {
        if (shouldReorder) {
          const columnTasks = tasks.filter(t => t.status === newStatus)
          const orderedTaskIds = columnTasks
            .filter(t => t._id !== activeId).slice(0, newPosition)
            .concat([activeId])
            .concat(columnTasks.filter(t => t._id !== activeId).slice(newPosition))
            .map(t => t._id)
          await fetch('/api/tasks/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: projectFilter === 'all' ? null : projectFilter, status: newStatus, orderedTaskIds }),
          })
        } else {
          const response = await fetch(`/api/tasks/${activeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus, position: newPosition }),
          })
          if (!response.ok) throw new Error('Failed to update task')
        }
        setPendingUpdates(prev => { const s = new Set(prev); s.delete(activeId); return s })
      } catch (error) {
        console.error('Failed to sync task update:', error)
        setTasks(prevTasks => {
          const updated = [...prevTasks]
          const idx = updated.findIndex(t => t._id === activeId)
          if (idx !== -1) updated[idx] = originalTask
          return updated
        })
        setPendingUpdates(prev => { const s = new Set(prev); s.delete(activeId); return s })
        notifyError({ title: 'Update Failed', message: 'Failed to update task. Changes have been reverted.' })
      }
    }
  }

  const handleCreateTask = (status?: string) => { setCreateTaskStatus(status); setShowCreateTaskModal(true) }
  const handleEditTask = (task: Task) => { setSelectedTask(task); setShowEditTaskModal(true) }
  const handleViewTask = (task: Task) => { setSelectedTask(task); setShowViewTaskModal(true) }
  const handleDeleteTask = (taskId: string) => {
    const task = tasks.find(t => t._id === taskId)
    if (task) { setSelectedTask(task); setShowDeleteConfirmModal(true) }
  }
  const clearDateFilters = () => setDateRangeFilter(undefined)
  const confirmDeleteTask = async () => {
    if (selectedTask) {
      try {
        await handleTaskDelete(selectedTask._id)
        setShowDeleteConfirmModal(false)
        setSelectedTask(null)
      } catch (error) {
        console.error('Failed to delete task:', error)
        notifyError({ title: 'Failed to Delete Task', message: 'Failed to delete task. Please try again.' })
      }
    }
  }

  if (loading || taskLoading) {
    return <MainLayout><div className="p-6"><KanbanSkeleton /></div></MainLayout>
  }

  // ─── Searchable dropdown shared pattern ───────────────────────────────────

  const SearchableSelect = ({
    value, onValueChange, placeholder, inputRef, filterQuery, setFilterQuery,
    options, allLabel, onOpenChange,
  }: {
    value: string
    onValueChange: (v: string) => void
    placeholder: string
    inputRef: React.MutableRefObject<HTMLInputElement | null>
    filterQuery: string
    setFilterQuery: (q: string) => void
    options: Array<{ value: string; label: string }>
    allLabel: string
    onOpenChange?: (open: boolean) => void
  }) => (
    <Select value={value} onValueChange={onValueChange} onOpenChange={(open) => {
      if (open) focusSearchInput(inputRef.current)
      onOpenChange?.(open)
    }}>
      <SelectTrigger className="w-full h-9 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="z-[10050] p-0">
        <div className="p-2">
          <div className="relative mb-2">
            <Input
              ref={inputRef}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={`Search ${placeholder.toLowerCase()}...`}
              className="pr-8 h-8 text-sm"
              onKeyDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
            {filterQuery && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFilterQuery(''); onValueChange('all') }}
                className="absolute inset-y-0 right-0 flex items-center px-2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="max-h-52 overflow-y-auto">
            <SelectItem value="all">{allLabel}</SelectItem>
            {options.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-[var(--apple-tertiary-label)]">No results</div>
            ) : (
              options.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)
            )}
          </div>
        </div>
      </SelectContent>
    </Select>
  )

  return (
    <MainLayout>
      <TooltipProvider delayDuration={200}>
        <div className="space-y-6 p-6">

          {/* ─── Header ────────────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <Columns className="h-8 w-8 flex-shrink-0" strokeWidth={1.5} style={{ color: 'var(--apple-card-gradient)' }} />
                <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight leading-tight text-[var(--apple-label)]">
                  Kanban Board
                </h1>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        'h-2 w-2 rounded-full flex-shrink-0',
                        isConnected ? 'bg-[var(--apple-system-green)]' : 'bg-[var(--apple-system-red)]',
                      )}
                      style={isConnected ? { animation: 'status-pulse 2s ease-in-out infinite' } : {}}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isConnected ? 'Real-time sync active' : 'Real-time sync inactive'}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} across {getColumns().length} column{getColumns().length !== 1 ? 's' : ''}
              </p>
            </div>
            {canCreateTask && (
              <Button onClick={() => handleCreateTask()} className="w-full sm:w-auto apple-transition">
                <Plus className="h-4 w-4 mr-1.5" />
                New Task
              </Button>
            )}
          </div>

          {/* ─── Filters ───────────────────────────────────────────────────── */}
          <div className="space-y-2.5">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--apple-tertiary-label)] pointer-events-none" />
              <input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  'w-full pl-9 pr-4 h-10 rounded-[var(--apple-radius-md)]',
                  'bg-[var(--apple-tertiary-fill)] border border-transparent',
                  'text-[15px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)]',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)] focus:ring-offset-0',
                  'apple-transition',
                )}
              />
            </div>

            {/* Filter grid: row 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Project */}
              <Select value={projectFilter} onValueChange={setProjectFilter} onOpenChange={(open) => { if (open) focusSearchInput(projectFilterInputRef.current) }}>
                <SelectTrigger className="w-full h-9 text-sm"><SelectValue placeholder="Project" /></SelectTrigger>
                <SelectContent className="z-[10050] p-0">
                  <div className="p-2">
                    <div className="relative mb-2">
                      <Input ref={projectFilterInputRef} value={projectFilterQuery} onChange={(e) => setProjectFilterQuery(e.target.value)} placeholder="Search projects" className="pr-8 h-8 text-sm" onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} />
                      {projectFilterQuery && <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setProjectFilterQuery(''); setProjectFilter('all') }} className="absolute inset-y-0 right-0 flex items-center px-2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)]"><X className="h-3.5 w-3.5" /></button>}
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      <SelectItem value="all">All Projects</SelectItem>
                      {filteredProjectOptions.length === 0 ? <div className="px-2 py-1.5 text-xs text-[var(--apple-tertiary-label)]">No matching projects</div> : filteredProjectOptions.map(p => <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>)}
                    </div>
                  </div>
                </SelectContent>
              </Select>

              {/* Priority */}
              <Select value={priorityFilter} onValueChange={setPriorityFilter} onOpenChange={(open) => { if (open) focusSearchInput(priorityFilterInputRef.current) }}>
                <SelectTrigger className="w-full h-9 text-sm"><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent className="z-[10050] p-0">
                  <div className="p-2">
                    <div className="relative mb-2">
                      <Input ref={priorityFilterInputRef} value={priorityFilterQuery} onChange={(e) => setPriorityFilterQuery(e.target.value)} placeholder="Search priority" className="pr-8 h-8 text-sm" onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} />
                      {priorityFilterQuery && <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPriorityFilterQuery(''); setPriorityFilter('all') }} className="absolute inset-y-0 right-0 flex items-center px-2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)]"><X className="h-3.5 w-3.5" /></button>}
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      <SelectItem value="all">All Priority</SelectItem>
                      {filteredPriorityOptions.length === 0 ? <div className="px-2 py-1.5 text-xs text-[var(--apple-tertiary-label)]">No results</div> : filteredPriorityOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </div>
                  </div>
                </SelectContent>
              </Select>

              {/* Type */}
              <Select value={typeFilter} onValueChange={setTypeFilter} onOpenChange={(open) => { if (open) focusSearchInput(typeFilterInputRef.current) }}>
                <SelectTrigger className="w-full h-9 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent className="z-[10050] p-0">
                  <div className="p-2">
                    <div className="relative mb-2">
                      <Input ref={typeFilterInputRef} value={typeFilterQuery} onChange={(e) => setTypeFilterQuery(e.target.value)} placeholder="Search type" className="pr-8 h-8 text-sm" onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} />
                      {typeFilterQuery && <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTypeFilterQuery(''); setTypeFilter('all') }} className="absolute inset-y-0 right-0 flex items-center px-2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)]"><X className="h-3.5 w-3.5" /></button>}
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      <SelectItem value="all">All Types</SelectItem>
                      {filteredTypeOptions.length === 0 ? <div className="px-2 py-1.5 text-xs text-[var(--apple-tertiary-label)]">No results</div> : filteredTypeOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </div>
                  </div>
                </SelectContent>
              </Select>
            </div>

            {/* Filter grid: row 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Assigned To */}
              <Select value={assignedToFilter} onValueChange={setAssignedToFilter} onOpenChange={(open) => { if (open) focusSearchInput(assignedToFilterInputRef.current) }}>
                <SelectTrigger className="w-full h-9 text-sm"><SelectValue placeholder="Assigned To" /></SelectTrigger>
                <SelectContent className="z-[10050] p-0">
                  <div className="p-2">
                    <div className="relative mb-2">
                      <Input ref={assignedToFilterInputRef} value={assignedToFilterQuery} onChange={(e) => setAssignedToFilterQuery(e.target.value)} placeholder="Search assignees" className="pr-8 h-8 text-sm" onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} />
                      {assignedToFilterQuery && <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAssignedToFilterQuery(''); setAssignedToFilter('all') }} className="absolute inset-y-0 right-0 flex items-center px-2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)]"><X className="h-3.5 w-3.5" /></button>}
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      <SelectItem value="all">All Assignees</SelectItem>
                      {filteredAssignedToOptions.length === 0 ? <div className="px-2 py-1.5 text-xs text-[var(--apple-tertiary-label)]">No matching assignees</div> : filteredAssignedToOptions.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                    </div>
                  </div>
                </SelectContent>
              </Select>

              {/* Assigned By */}
              <Select value={assignedByFilter} onValueChange={setAssignedByFilter} onOpenChange={(open) => { if (open) focusSearchInput(assignedByFilterInputRef.current) }}>
                <SelectTrigger className="w-full h-9 text-sm"><SelectValue placeholder="Assigned By" /></SelectTrigger>
                <SelectContent className="z-[10050] p-0">
                  <div className="p-2">
                    <div className="relative mb-2">
                      <Input ref={assignedByFilterInputRef} value={assignedByFilterQuery} onChange={(e) => setAssignedByFilterQuery(e.target.value)} placeholder="Search creators" className="pr-8 h-8 text-sm" onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} />
                      {assignedByFilterQuery && <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAssignedByFilterQuery(''); setAssignedByFilter('all') }} className="absolute inset-y-0 right-0 flex items-center px-2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)]"><X className="h-3.5 w-3.5" /></button>}
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      <SelectItem value="all">All Creators</SelectItem>
                      {filteredAssignedByOptions.length === 0 ? <div className="px-2 py-1.5 text-xs text-[var(--apple-tertiary-label)]">No matching creators</div> : filteredAssignedByOptions.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                    </div>
                  </div>
                </SelectContent>
              </Select>

              {/* Task Number */}
              <Select value={taskNumberFilter} onValueChange={setTaskNumberFilter} onOpenChange={(open) => { if (open) focusSearchInput(taskNumberFilterInputRef.current) }}>
                <SelectTrigger className="w-full h-9 text-sm"><SelectValue placeholder="Task Number" /></SelectTrigger>
                <SelectContent className={`z-[10050] p-0 w-full ${TASK_FILTER_DROPDOWN_WIDTH}`} align="end">
                  <div className="p-2 w-full overflow-x-hidden">
                    <div className="relative mb-2">
                      <Input ref={taskNumberFilterInputRef} value={taskNumberFilterQuery} onChange={(e) => setTaskNumberFilterQuery(e.target.value)} placeholder="Search tasks" className="pr-8 h-8 text-sm" onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} />
                      {taskNumberFilterQuery && <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTaskNumberFilterQuery(''); setTaskNumberFilter('all') }} className="absolute inset-y-0 right-0 flex items-center px-2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)]"><X className="h-3.5 w-3.5" /></button>}
                    </div>
                    <div className="max-h-40 overflow-y-auto [&::-webkit-scrollbar]:hidden">
                      <SelectItem value="all">All Tasks</SelectItem>
                      {filteredTaskNumberOptions.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-[var(--apple-tertiary-label)]">No matching tasks</div>
                      ) : (
                        filteredTaskNumberOptions.map((option) => {
                          const match = option.fullLabel.match(/^#(.+?)\s-\s(.+)$/)
                          const displayId = match ? match[1] : null
                          const title = match ? match[2] : option.fullLabel
                          const { truncated: truncatedTitle, isTruncated } = truncateText(title, TRUNCATION_LENGTH)
                          return (
                            <SelectItem key={option.id} value={option.id}>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-2 min-w-0">
                                      {displayId && (
                                        <span className="text-xs font-apple-mono bg-[var(--apple-tertiary-fill)] px-1.5 py-0.5 rounded flex-shrink-0">
                                          #{displayId}
                                        </span>
                                      )}
                                      <span className="truncate">{truncatedTitle}</span>
                                    </div>
                                  </TooltipTrigger>
                                  {isTruncated && (
                                    <TooltipContent side="left" align="center" className="max-w-sm break-words">
                                      <p className="whitespace-normal">{title}</p>
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </TooltipProvider>
                            </SelectItem>
                          )
                        })
                      )}
                    </div>
                  </div>
                </SelectContent>
              </Select>
            </div>

            {/* Date range */}
            <div className="flex justify-end">
              <div className="w-full sm:w-72">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal h-9 text-sm',
                        !dateRangeFilter?.from && !dateRangeFilter?.to && 'text-[var(--apple-tertiary-label)]',
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateRangeFilter?.from ? (
                        dateRangeFilter.to
                          ? `${format(dateRangeFilter.from, 'LLL dd, y')} – ${format(dateRangeFilter.to, 'LLL dd, y')}`
                          : `${format(dateRangeFilter.from, 'LLL dd, y')} – …`
                      ) : 'Date Range'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <DateRangeCalendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRangeFilter?.from}
                      selected={dateRangeFilter}
                      onSelect={handleDateRangeChange}
                      numberOfMonths={2}
                    />
                    <div className="p-3 border-t border-[var(--apple-separator)]">
                      <Button variant="ghost" size="sm" onClick={clearDateFilters} disabled={!dateRangeFilter?.from && !dateRangeFilter?.to} className="w-full">
                        Clear dates
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Count + reset */}
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-[var(--apple-secondary-label)]">
                <span className="font-apple-mono font-semibold tabular-nums">{filteredTasks.length}</span>
                {' '}task{filteredTasks.length !== 1 ? 's' : ''} found
              </p>
              {hasActiveFilters && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={resetFilters} className="text-xs h-7 gap-1.5" aria-label="Reset all filters">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Reset all filters</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>

          {/* ─── Kanban Board ───────────────────────────────────────────────── */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={() => {}}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {getColumns().map((column) => (
                <ColumnDropZone
                  key={column.id}
                  column={column}
                  tasks={getTasksByStatus(column.id)}
                  onCreateTask={handleCreateTask}
                  onEditTask={handleEditTask}
                  onDeleteTask={isAdmin ? handleDeleteTask : undefined}
                  pendingUpdates={pendingUpdates}
                  canCreateTask={canCreateTask}
                  canDragTask={(task) => task.status !== 'backlog'}
                />
              ))}
            </div>

            <DragOverlay>
              {activeTask ? (
                <SortableTask
                  task={activeTask}
                  onClick={() => {}}
                  isDragOverlay
                  onEdit={handleEditTask}
                  onDelete={isAdmin ? handleDeleteTask : undefined}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </TooltipProvider>

      {/* ─── Modals ─────────────────────────────────────────────────────────── */}
      <CreateTaskModal
        isOpen={showCreateTaskModal}
        onClose={() => { setShowCreateTaskModal(false); setCreateTaskStatus(undefined) }}
        projectId={projectFilter === 'all' ? '' : projectFilter}
        defaultStatus={createTaskStatus}
        stayOnCurrentPage
        onTaskCreated={() => { setShowCreateTaskModal(false); setCreateTaskStatus(undefined); fetchTasks() }}
      />
      {selectedTask && (
        <EditTaskModal
          isOpen={showEditTaskModal}
          onClose={() => { setShowEditTaskModal(false); setSelectedTask(null) }}
          task={selectedTask}
          onTaskUpdated={() => { setShowEditTaskModal(false); setSelectedTask(null); fetchTasks() }}
        />
      )}
      {selectedTask && (
        <ViewTaskModal
          isOpen={showViewTaskModal}
          onClose={() => { setShowViewTaskModal(false); setSelectedTask(null) }}
          task={selectedTask}
          onEdit={() => { setShowViewTaskModal(false); setShowEditTaskModal(true) }}
          canDelete={isAdmin}
          hideDeleteWhenDisabled
          onDelete={isAdmin ? () => { setShowViewTaskModal(false); handleDeleteTask(selectedTask._id) } : undefined}
        />
      )}
      <ConfirmationModal
        isOpen={showDeleteConfirmModal}
        onClose={() => { setShowDeleteConfirmModal(false); setSelectedTask(null) }}
        onConfirm={confirmDeleteTask}
        title="Delete Task"
        description={`Are you sure you want to delete "${selectedTask?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </MainLayout>
  )
}

// ─── Sortable Task Card ───────────────────────────────────────────────────────

interface SortableTaskProps {
  task: Task
  onClick: () => void
  isDragOverlay?: boolean
  isUpdating?: boolean
  isDraggable?: boolean
  onEdit?: (task: Task) => void
  onDelete?: (taskId: string) => void
}

function SortableTask({
  task, onClick, isDragOverlay = false, isUpdating = false, isDraggable = true, onEdit, onDelete,
}: SortableTaskProps) {
  const { formatDate } = useDateTime()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task._id })

  const style = { transform: CSS.Transform.toString(transform), transition }
  const accent = PRIORITY_ACCENT[task.priority] ?? '#8E8E93'

  const assignee = task.assignedTo && !Array.isArray(task.assignedTo) ? task.assignedTo : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-card overflow-hidden',
        'shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-none apple-transition',
        isDraggable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
        isDragging && 'opacity-40 scale-[0.97]',
        isDragOverlay && 'shadow-[0_16px_40px_rgba(0,0,0,0.20)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.55)] rotate-[1.5deg] scale-[1.03]',
        isUpdating && 'ring-2 ring-[var(--apple-system-blue)]/40 ring-offset-1',
      )}
      onClick={onClick}
    >
      {/* Priority left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} />

      <div className="pl-4 pr-2.5 py-3">
        {/* Header: title + controls */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <TruncateTooltip text={task.title}>
            <h4 className="text-[14px] font-semibold text-[var(--apple-label)] leading-snug line-clamp-2 flex-1">
              {task.title}
            </h4>
          </TruncateTooltip>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {isUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--apple-system-blue)]" />}
            {isDraggable && (
              <button
                className="h-6 w-6 flex items-center justify-center rounded text-[var(--apple-quaternary-label)] hover:text-[var(--apple-secondary-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition cursor-grab active:cursor-grabbing"
                {...attributes}
                {...listeners}
                onClick={(e) => e.stopPropagation()}
                aria-label="Drag to reorder"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-6 w-6 flex items-center justify-center rounded text-[var(--apple-quaternary-label)] hover:text-[var(--apple-secondary-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick() }}>
                  View Details
                </DropdownMenuItem>
                {onEdit && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(task) }}>
                    Edit Task
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); onDelete(task._id) }}
                      className="text-destructive focus:text-destructive"
                    >
                      Delete Task
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          <TypeBadge type={task.type} />
          <PriorityBadge priority={task.priority} />
        </div>

        {/* Meta */}
        <div className="space-y-1">
          {task.project?.name && (
            <div className="flex items-center gap-1.5">
              <Target className="h-3 w-3 flex-shrink-0 text-[var(--apple-tertiary-label)]" />
              <TruncateTooltip text={task.project.name}>
                <span className="text-[12px] text-[var(--apple-tertiary-label)] truncate">{task.project.name}</span>
              </TruncateTooltip>
            </div>
          )}
          {task.displayId && (
            <span className="text-[11px] font-apple-mono text-[var(--apple-tertiary-label)]">
              #{task.displayId}
            </span>
          )}
          {task.dueDate && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 flex-shrink-0 text-[var(--apple-tertiary-label)]" />
              <span className="text-[12px] text-[var(--apple-tertiary-label)]">Due {formatDate(task.dueDate)}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        {(task.storyPoints || task.estimatedHours || assignee || (task.labels?.length > 0)) && (
          <div className="mt-2.5 pt-2.5 border-t border-[var(--apple-separator)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 text-[12px] text-[var(--apple-tertiary-label)]">
              {task.storyPoints && (
                <span className="flex items-center gap-1 font-apple-mono tabular-nums">
                  <BarChart3 className="h-3 w-3" />{task.storyPoints}sp
                </span>
              )}
              {task.estimatedHours && (
                <span className="flex items-center gap-1 font-apple-mono tabular-nums">
                  <Clock className="h-3 w-3" />{task.estimatedHours}h
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {task.labels?.length > 0 && (
                <div className="flex items-center gap-1">
                  {task.labels.slice(0, 1).map((lbl, i) => (
                    <span key={i} className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)] font-medium">
                      {lbl}
                    </span>
                  ))}
                  {task.labels.length > 1 && (
                    <span className="text-[11px] text-[var(--apple-tertiary-label)]">+{task.labels.length - 1}</span>
                  )}
                </div>
              )}
              {assignee && (
                <TruncateTooltip text={`${assignee.firstName} ${assignee.lastName}`}>
                  <div className="h-5 w-5 rounded-full bg-[var(--apple-system-blue)] flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 select-none">
                    {assignee.firstName?.[0]?.toUpperCase() ?? '?'}
                  </div>
                </TruncateTooltip>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tooltip helper ───────────────────────────────────────────────────────────

interface TruncateTooltipProps {
  text?: string | number | null
  children: ReactElement
}

function TruncateTooltip({ text, children }: TruncateTooltipProps) {
  const displayText = text === undefined || text === null ? '' : String(text)
  if (!displayText.trim()) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" align="start">
        <p className="max-w-sm break-words">{displayText}</p>
      </TooltipContent>
    </Tooltip>
  )
}
