'use client'

import { useState, useEffect, useCallback, useRef, useMemo, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { formatToTitleCase, cn } from '@/lib/utils'
import { useTaskSync, useTaskState } from '@/hooks/useTaskSync'
import { useNotify } from '@/lib/notify'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { Calendar as DateRangeCalendar } from '@/components/ui/calendar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
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
  arrayMove,
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  Users,
  TrendingUp,
  Calendar as CalendarIcon,
  Star,
  Layers,
  GripVertical,
  Eye,
  Edit,
  Trash2,
  X,
  RotateCcw
} from 'lucide-react'
import CreateTaskModal from '@/components/tasks/CreateTaskModal'
import EditTaskModal from '@/components/tasks/EditTaskModal'
import ViewTaskModal from '@/components/tasks/ViewTaskModal'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { DateRange } from 'react-day-picker'
import { format } from 'date-fns'

interface Task {
  _id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'|'backlog'
  priority: 'low' | 'medium' | 'high' | 'critical'
  type: 'bug' | 'feature' | 'improvement' | 'task' | 'subtask'
  project: {
    _id: string
    name: string
  }
  assignedTo?: {
    _id?: string
    firstName: string
    lastName: string
    email: string
  }
  createdBy: {
    _id?: string
    firstName: string
    lastName: string
    email: string
  }
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
    kanbanStatuses?: Array<{
      key: string
      title: string
      color?: string
      order: number
    }>
    allowTimeTracking?: boolean
    allowManualTimeSubmission?: boolean
    allowExpenseTracking?: boolean
    requireApproval?: boolean
    notifications?: {
      taskUpdates?: boolean
      budgetAlerts?: boolean
      deadlineReminders?: boolean
    }
  }
  _id: string
  name: string
}

interface PersonOption {
  id: string
  name: string
  email?: string
}

interface TaskOption {
  id: string
  label: string
}

const defaultColumns = [
  { id: 'backlog', title: 'backlog', color: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200' },
  { id: 'todo', title: 'To Do', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { id: 'review', title: 'Review', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  { id: 'testing', title: 'Testing', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  { id: 'done', title: 'Done', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' }
]

// Column Drop Zone Component
function ColumnDropZone({
  column,
  tasks,
  onCreateTask,
  onEditTask,
  onDeleteTask,
  pendingUpdates
}: {
  column: any,
  tasks: Task[],
  onCreateTask?: (status?: string) => void,
  onEditTask?: (task: Task) => void,
  onDeleteTask?: (taskId: string) => void,
  pendingUpdates?: Set<string>
}) {
  const router = useRouter()
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  })

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'medium': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900'
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'bug': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      case 'feature': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      case 'improvement': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'task': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'subtask': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  return (
    <div className="h-full flex flex-col border border-dashed border-border/40 dark:border-border/60 hover:border-border/70 dark:hover:border-border rounded-lg bg-background/80 shadow-sm p-3 transition-colors">
      <div className="space-y-4 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Badge className={`${column.color} ${(() => {
              if (column.color.includes('bg-slate-100')) return 'hover:bg-slate-100 dark:hover:bg-slate-900'
              if (column.color.includes('bg-gray-100')) return 'hover:bg-gray-100 dark:hover:bg-gray-900'
              if (column.color.includes('bg-blue-100')) return 'hover:bg-blue-100 dark:hover:bg-blue-900'
              if (column.color.includes('bg-yellow-100')) return 'hover:bg-yellow-100 dark:hover:bg-yellow-900'
              if (column.color.includes('bg-purple-100')) return 'hover:bg-purple-100 dark:hover:bg-purple-900'
              if (column.color.includes('bg-green-100')) return 'hover:bg-green-100 dark:hover:bg-green-900'
              return ''
            })()}`}>
              {column.title}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {tasks.length}
            </span>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => onCreateTask?.(column.id)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        
        <SortableContext 
          items={tasks.map(task => task._id)}
          strategy={verticalListSortingStrategy}
        >
          <div 
            ref={setNodeRef}
            className={`space-y-3 min-h-[400px] max-h-[600px] overflow-y-auto overflow-x-hidden border-2 border-dashed rounded-lg transition-colors p-2 flex-1 ${
              isOver 
                ? 'border-primary bg-primary/5' 
                : 'border-border/30 dark:border-border/50 hover:border-border/50 dark:hover:border-border/70'
            }`}
          >
          {tasks.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
             <div className="text-center">
                <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Drop tasks here</p>
              </div>
            </div>
          ) : (
            tasks.map((task) => (
              <SortableTask
                key={`${task._id}-${task.status}-${task.position}`}
                task={task}
                onClick={() => router.push(`/tasks/${task._id}`)}
                getPriorityColor={getPriorityColor}
                getTypeColor={getTypeColor}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
                isUpdating={pendingUpdates?.has(task._id)}
              />
            ))
          )}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

export default function KanbanPage() {
  const router = useRouter()
  const { formatDate } = useDateTime()
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const { success: notifySuccess, error: notifyError } = useNotify()
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
  const hasFetchedProjects = useRef(false)

  // Check if any filters are active
  const hasActiveFilters = projectFilter !== 'all' ||
                          priorityFilter !== 'all' ||
                          typeFilter !== 'all' ||
                          assignedToFilter !== 'all' ||
                          assignedByFilter !== 'all' ||
                          taskNumberFilter !== 'all' ||
                          dateRangeFilter !== undefined

  // Reset all filters
  const resetFilters = () => {
    setProjectFilter('all')
    setPriorityFilter('all')
    setTypeFilter('all')
    setAssignedToFilter('all')
    setAssignedByFilter('all')
    setTaskNumberFilter('all')
    setDateRangeFilter(undefined)
    setProjectFilterQuery('')
    setPriorityFilterQuery('')
    setTypeFilterQuery('')
    setAssignedToFilterQuery('')
    setAssignedByFilterQuery('')
    setTaskNumberFilterQuery('')
  }

  // Use the task state management hook
  const {
    tasks,
    setTasks,
    isLoading: taskLoading,
    error: taskError,
    updateTask,
    handleTaskUpdate,
    handleTaskCreate,
    handleTaskDelete
  } = useTaskState([])
  // Use the notification hook

  // Use the task synchronization hook
  const {
    isConnected,
    startPolling,
    stopPolling,
    updateTaskOptimistically
  } = useTaskSync({
    onTaskUpdate: handleTaskUpdate,
    onTaskCreate: handleTaskCreate,
    onTaskDelete: handleTaskDelete
  })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/tasks')
      const data = await response.json()

      if (data.success) {
        setTasks(data.data)
      } else {
        notifyError({ title: 'Failed to Load Tasks', message: data.error || 'Failed to fetch tasks' })
      }
    } catch (err) {
      notifyError({ title: 'Failed to Load Tasks', message: 'Failed to fetch tasks' })
    } finally {
      setLoading(false)
    }
  }, [setTasks])

  const fetchProjects = useCallback(async (force = false) => {
    if (hasFetchedProjects.current && !force) {
      return
    }

    let fetchSucceeded = false
    hasFetchedProjects.current = true

    try {
      const response = await fetch('/api/projects')
      const data = await response.json()

      if (data.success && Array.isArray(data.data)) {
        setProjects(data.data)
      } else {
        setProjects([])
      }
      fetchSucceeded = true
    } catch (err) {
      console.error('Failed to fetch projects:', err)
      setProjects([])
    } finally {
      if (!fetchSucceeded) {
        hasFetchedProjects.current = false
      }
    }
  }, [])

  const fetchSelectedProject = useCallback(async (projectId: string) => {
    if (projectId === 'all') {
      setSelectedProject(null)
      return
    }

    try {
      const response = await fetch(`/api/projects/${projectId}`)
      const data = await response.json()

      if (data.success) {
        setSelectedProject(data.data)
      } else {
        setSelectedProject(null)
      }
    } catch (err) {
      console.error('Failed to fetch project:', err)
      setSelectedProject(null)
    }
  }, [])

  const getColumns = useCallback(() => {
    // If a specific project is selected and has custom columns, use them
    if (selectedProject?.settings?.kanbanStatuses && selectedProject.settings.kanbanStatuses.length > 0) {
      // Sort by order and map to the expected format
      return selectedProject.settings.kanbanStatuses
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(col => ({
          id: col.key,
          title: col.title,
          color: col.color || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
        }))
    }
    
    // When "all" is selected or no custom columns, collect unique statuses from all projects
    if (projectFilter === 'all' && projects.length > 0) {
      const statusSet = new Set<string>()
      const statusMap = new Map<string, { title: string; color: string }>()
      
      // Collect all unique statuses from all projects
      projects.forEach(project => {
        if (project.settings?.kanbanStatuses) {
          project.settings.kanbanStatuses.forEach(col => {
            if (!statusSet.has(col.key)) {
              statusSet.add(col.key)
              statusMap.set(col.key, {
                title: col.title,
                color: col.color || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
              })
            }
          })
        }
      })
      
      // If we found custom statuses, use them; otherwise use defaults
      if (statusMap.size > 0) {
        return Array.from(statusMap.entries()).map(([key, value]) => ({
          id: key,
          title: value.title,
          color: value.color
        }))
      }
    }
    
    // Fall back to default columns
    return defaultColumns
  }, [selectedProject, projectFilter, projects])

  useEffect(() => {
    const assignedToMap = new Map<string, PersonOption>()
    const assignedByMap = new Map<string, PersonOption>()

    tasks.forEach((task) => {
      if (task.assignedTo && Array.isArray(task.assignedTo)) {
        task.assignedTo.forEach((assignee: any) => {
          if (assignee.user) {
            const id = assignee.user._id
            if (id) {
              const name = `${assignee.user.firstName} ${assignee.user.lastName}`.trim()
              assignedToMap.set(id, {
                id,
                name,
                email: assignee.user.email
              })
            }
          }
        })
      }

      if (task.createdBy) {
        const id = task.createdBy._id || task.createdBy.email || `${task.createdBy.firstName}-${task.createdBy.lastName}`
        if (id) {
          const name = `${task.createdBy.firstName} ${task.createdBy.lastName}`.trim()
          assignedByMap.set(id, {
            id,
            name,
            email: task.createdBy.email
          })
        }
      }
    })

    setAssignedToOptions(Array.from(assignedToMap.values()).sort((a, b) => a.name.localeCompare(b.name)))
    setAssignedByOptions(Array.from(assignedByMap.values()).sort((a, b) => a.name.localeCompare(b.name)))
  }, [tasks])

  useEffect(() => {
    if (assignedToFilter !== 'all' && !assignedToOptions.some(option => option.id === assignedToFilter)) {
      setAssignedToFilter('all')
    }
    if (assignedByFilter !== 'all' && !assignedByOptions.some(option => option.id === assignedByFilter)) {
      setAssignedByFilter('all')
    }
    if (taskNumberFilter !== 'all' && !tasks.some(task => task._id === taskNumberFilter || String(task.taskNumber ?? '') === taskNumberFilter)) {
      setTaskNumberFilter('all')
    }
  }, [assignedToOptions, assignedByOptions, assignedToFilter, assignedByFilter, taskNumberFilter, tasks])

  // Fetch selected project when project filter changes
  useEffect(() => {
    fetchSelectedProject(projectFilter)
    // Also refresh projects list to get updated column settings
    if (projectFilter !== 'all') {
      fetchProjects(true)
    }
  }, [projectFilter, fetchSelectedProject, fetchProjects])

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await Promise.all([fetchTasks(), fetchProjects()])
        // Start real-time synchronization after successful auth
        startPolling()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          await Promise.all([fetchTasks(), fetchProjects()])
          // Start real-time synchronization after successful refresh
          startPolling()
        } else {
          setAuthError('Session expired')
          stopPolling()
          setTimeout(() => {
            router.push('/login')
          }, 2000)
        }
      } else {
        stopPolling()
        router.push('/login')
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setAuthError('Authentication failed')
      stopPolling()
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    }
  }, [router, startPolling, stopPolling, fetchTasks, fetchProjects])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Handle task errors from the task state hook
  useEffect(() => {
    if (taskError) {
      notifyError({ title: 'Task Synchronization Error', message: taskError })
    }
  }, [taskError, notifyError])

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'medium': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900'
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'bug': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
      case 'feature': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
      case 'improvement': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
      case 'task': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
      case 'subtask': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    }
  }

  const startDateBoundary = useMemo(() => {
    if (!dateRangeFilter?.from) return null
    const date = new Date(dateRangeFilter.from)
    date.setHours(0, 0, 0, 0)
    return date
  }, [dateRangeFilter])

  const endDateBoundary = useMemo(() => {
    if (!dateRangeFilter?.to) return null
    const date = new Date(dateRangeFilter.to)
    date.setHours(23, 59, 59, 999)
    return date
  }, [dateRangeFilter])

  const filteredAssignedToOptions = useMemo(() => {
    if (!assignedToFilterQuery.trim()) return assignedToOptions
    const query = assignedToFilterQuery.toLowerCase()
    return assignedToOptions.filter(option =>
      option.name.toLowerCase().includes(query) ||
      (option.email?.toLowerCase().includes(query) ?? false)
    )
  }, [assignedToOptions, assignedToFilterQuery])

  const filteredAssignedByOptions = useMemo(() => {
    if (!assignedByFilterQuery.trim()) return assignedByOptions
    const query = assignedByFilterQuery.toLowerCase()
    return assignedByOptions.filter(option =>
      option.name.toLowerCase().includes(query) ||
      (option.email?.toLowerCase().includes(query) ?? false)
    )
  }, [assignedByOptions, assignedByFilterQuery])

  const taskNumberOptions = useMemo<TaskOption[]>(() => {
    const map = new Map<string, TaskOption>()
    tasks.forEach(task => {
      const id = task._id
      // Use displayId if available, otherwise fall back to taskNumber, otherwise just title
      const identifier = task.displayId || (task.taskNumber ? String(task.taskNumber) : null)
      const label = identifier
        ? `#${identifier} - ${task.title}`
        : task.title
      map.set(id, { id, label })
    })
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [tasks])

  const filteredTaskNumberOptions = useMemo(() => {
    if (!taskNumberFilterQuery.trim()) return taskNumberOptions
    const query = taskNumberFilterQuery.toLowerCase()
    return taskNumberOptions.filter(option =>
      option.label.toLowerCase().includes(query) ||
      option.id.toLowerCase().includes(query)
    )
  }, [taskNumberOptions, taskNumberFilterQuery])

  const filteredProjectOptions = useMemo(() => {
    const query = projectFilterQuery.trim().toLowerCase()
    if (!query) return projects
    return projects.filter((project) => project.name.toLowerCase().includes(query))
  }, [projects, projectFilterQuery])

  const priorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' }
  ]

  const filteredPriorityOptions = useMemo(() => {
    const query = priorityFilterQuery.trim().toLowerCase()
    if (!query) return priorityOptions
    return priorityOptions.filter((option) =>
      option.label.toLowerCase().includes(query) ||
      option.value.toLowerCase().includes(query)
    )
  }, [priorityFilterQuery])

  const typeOptions = [
    { value: 'bug', label: 'Bug' },
    { value: 'feature', label: 'Feature' },
    { value: 'improvement', label: 'Improvement' },
    { value: 'task', label: 'Task' },
    { value: 'subtask', label: 'Subtask' }
  ]

  const filteredTypeOptions = useMemo(() => {
    const query = typeFilterQuery.trim().toLowerCase()
    if (!query) return typeOptions
    return typeOptions.filter((option) =>
      option.label.toLowerCase().includes(query) ||
      option.value.toLowerCase().includes(query)
    )
  }, [typeFilterQuery])

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()

  const filteredTasks = tasks.filter(task => {
    const matchesSearch =
      !normalizedSearchQuery ||
      task.title.toLowerCase().includes(normalizedSearchQuery) ||
      (task.description || '').toLowerCase().includes(normalizedSearchQuery) ||
      (task.project?.name || '').toLowerCase().includes(normalizedSearchQuery) ||
      (task.displayId || '').toLowerCase().includes(normalizedSearchQuery) ||
      (task._id || '').toLowerCase().includes(normalizedSearchQuery)
    
    const matchesProject = projectFilter === 'all' || (task.project?._id && task.project._id === projectFilter)
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter
    const matchesType = typeFilter === 'all' || task.type === typeFilter

    // Check if the selected user is in the assignedTo array
    const matchesAssignedTo = assignedToFilter === 'all' ||
      (Array.isArray(task.assignedTo) &&
       task.assignedTo.some((assignee: any) => assignee.user?._id === assignedToFilter))

    const createdById = task.createdBy?._id || task.createdBy?.email || `${task.createdBy?.firstName ?? ''}-${task.createdBy?.lastName ?? ''}`
    const matchesAssignedBy = assignedByFilter === 'all' || (createdById && createdById === assignedByFilter)
    const taskIdMatches = taskNumberFilter === 'all' ||
      task._id === taskNumberFilter ||
      (task.displayId && task.displayId === taskNumberFilter) ||
      (task.taskNumber && String(task.taskNumber) === taskNumberFilter)
    const dueDate = task.dueDate ? new Date(task.dueDate) : null
    const matchesStartDate = !startDateBoundary || (dueDate && dueDate >= startDateBoundary)
    const matchesEndDate = !endDateBoundary || (dueDate && dueDate <= endDateBoundary)

    return (
      matchesSearch &&
      matchesProject &&
      matchesPriority &&
      matchesType &&
      matchesAssignedTo &&
      matchesAssignedBy &&
      taskIdMatches &&
      matchesStartDate &&
      matchesEndDate
    )
  })

  const getTasksByStatus = (status: string) => {
    return filteredTasks.filter(task => task.status === status)
  }

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const task = tasks.find(t => t._id === active.id)
    setActiveTask(task || null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id

    if (activeId === overId) return

    // Find the task being dragged
    const activeTask = tasks.find(task => task._id === activeId)
    if (!activeTask) return

    const columns = getColumns()
    let newStatus = activeTask.status
    let shouldReorder = false
    let newPosition = activeTask.position || 0

    // Determine the drop target type and new status
    if (typeof overId === 'string' && columns.some(col => col.id === overId)) {
      // Dropped directly on a column (empty column)
      newStatus = overId as any
      // Set position to end of the column
      const columnTasks = tasks.filter(t => t.status === newStatus)
      newPosition = columnTasks.length
    } else if (typeof overId === 'string') {
      // Dropped on another task - get its status
      const overTask = tasks.find(task => task._id === overId)
      if (overTask) {
        newStatus = overTask.status
        // Calculate new position based on drop location
        const columnTasks = tasks.filter(t => t.status === newStatus)
        const overIndex = columnTasks.findIndex(t => t._id === overId)

        if (newStatus === activeTask.status) {
          // Same column reordering
          shouldReorder = true
          const activeIndex = columnTasks.findIndex(t => t._id === activeId)
          if (activeIndex < overIndex) {
            newPosition = overIndex
          } else {
            newPosition = overIndex
          }
        } else {
          // Cross-column move - place at end
          newPosition = columnTasks.length
        }
      }
    }

    // Optimistic update - update UI immediately
    const originalTask = { ...activeTask }

    if (newStatus !== activeTask.status || shouldReorder) {
      // Mark task as having pending update
      setPendingUpdates(prev => new Set(prev).add(activeId))

      // Update local state immediately for instant visual feedback
      setTasks(prevTasks => {
        const updatedTasks = [...prevTasks]
        const taskIndex = updatedTasks.findIndex(t => t._id === activeId)

        if (taskIndex !== -1) {
          // Update the task
          updatedTasks[taskIndex] = {
            ...updatedTasks[taskIndex],
            status: newStatus,
            position: newPosition
          }

          // If reordering within same column, reorder the array
          if (shouldReorder && newStatus === activeTask.status) {
            const columnTasks = updatedTasks.filter(t => t.status === newStatus)
            const otherTasks = updatedTasks.filter(t => t.status !== newStatus)

            // Remove the moved task and reinsert at new position
            const movedTask = columnTasks.find(t => t._id === activeId)
            const remainingTasks = columnTasks.filter(t => t._id !== activeId)

            remainingTasks.splice(newPosition, 0, movedTask!)

            return [...otherTasks, ...remainingTasks]
          }
        }

        return updatedTasks
      })

      // Background sync with server
      try {
        if (shouldReorder) {
          // Handle reordering
          const columnTasks = tasks.filter(t => t.status === newStatus)
          const orderedTaskIds = columnTasks
            .filter(t => t._id !== activeId)
            .slice(0, newPosition)
            .concat([activeId])
            .concat(columnTasks.filter(t => t._id !== activeId).slice(newPosition))
            .map(t => t._id)

          await fetch('/api/tasks/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: projectFilter === 'all' ? null : projectFilter,
              status: newStatus,
              orderedTaskIds
            })
          })
        } else {
          // Handle status change
          const response = await fetch(`/api/tasks/${activeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: newStatus,
              position: newPosition
            })
          })

          if (!response.ok) {
            throw new Error('Failed to update task')
          }
        }

        // Success - remove from pending updates
        setPendingUpdates(prev => {
          const newSet = new Set(prev)
          newSet.delete(activeId)
          return newSet
        })
      } catch (error) {
        console.error('Failed to sync task update:', error)

        // Revert optimistic update on failure
        setTasks(prevTasks => {
          const updatedTasks = [...prevTasks]
          const taskIndex = updatedTasks.findIndex(t => t._id === activeId)

          if (taskIndex !== -1) {
            // Restore original task data
            updatedTasks[taskIndex] = originalTask
          }

          return updatedTasks
        })

        // Remove from pending updates
        setPendingUpdates(prev => {
          const newSet = new Set(prev)
          newSet.delete(activeId)
          return newSet
        })

        notifyError({
          title: 'Update Failed',
          message: 'Failed to update task. Changes have been reverted.'
        })
      }
    }
  }

  // Modal handlers
  const handleCreateTask = (status?: string) => {
    setCreateTaskStatus(status)
    setShowCreateTaskModal(true)
  }

  const handleEditTask = (task: Task) => {
    setSelectedTask(task)
    setShowEditTaskModal(true)
  }

  const handleViewTask = (task: Task) => {
    setSelectedTask(task)
    setShowViewTaskModal(true)
  }

  const handleDeleteTask = (taskId: string) => {
    const task = tasks.find(t => t._id === taskId)
    if (task) {
      setSelectedTask(task)
      setShowDeleteConfirmModal(true)
    }
  }

  const clearDateFilters = () => {
    setDateRangeFilter(undefined)
  }

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
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading Kanban board...</p>
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
      <TooltipProvider delayDuration={200}>
      <div className="space-y-8 sm:space-y-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Kanban Board</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Visual task management with drag and drop</p>
          </div>
          <Button onClick={() => handleCreateTask()} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            New Task
          </Button>
        </div>


        {/* Real-time connection status */}
        {isConnected && (
          <Alert className="mb-4">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
              <span className="text-sm">Real-time sync active</span>
            </div>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Task Board</CardTitle>
                  <CardDescription>
                    {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} found
                  </CardDescription>
                </div>
              </div>
              {/* Search bar - full width on its own line */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-full"
                />
              </div>
              {/* Filter options - on the next line */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2 flex-wrap">
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Project" />
                  </SelectTrigger>
                  <SelectContent className="z-[10050] p-0">
                    <div className="p-2">
                      <div className="relative mb-2">
                        <Input
                          value={projectFilterQuery}
                          onChange={(e) => setProjectFilterQuery(e.target.value)}
                          placeholder="Search projects"
                          className="pr-10"
                          onKeyDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        />
                        {projectFilterQuery && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setProjectFilterQuery('')
                              setProjectFilter('all')
                            }}
                            className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground hover:text-foreground"
                            aria-label="Clear project filter"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
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
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent className="z-[10050] p-0">
                    <div className="p-2">
                      <div className="relative mb-2">
                        <Input
                          value={priorityFilterQuery}
                          onChange={(e) => setPriorityFilterQuery(e.target.value)}
                          placeholder="Search priority"
                          className="pr-10"
                          onKeyDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        />
                        {priorityFilterQuery && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setPriorityFilterQuery('')
                              setPriorityFilter('all')
                            }}
                            className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground hover:text-foreground"
                            aria-label="Clear priority filter"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        <SelectItem value="all">All Priority</SelectItem>
                        {filteredPriorityOptions.length === 0 ? (
                          <div className="px-2 py-1 text-xs text-muted-foreground">No matching priorities</div>
                        ) : (
                          filteredPriorityOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))
                        )}
                      </div>
                    </div>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className="z-[10050] p-0">
                    <div className="p-2">
                      <div className="relative mb-2">
                        <Input
                          value={typeFilterQuery}
                          onChange={(e) => setTypeFilterQuery(e.target.value)}
                          placeholder="Search type"
                          className="pr-10"
                          onKeyDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        />
                        {typeFilterQuery && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setTypeFilterQuery('')
                              setTypeFilter('all')
                            }}
                            className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground hover:text-foreground"
                            aria-label="Clear type filter"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        <SelectItem value="all">All Types</SelectItem>
                        {filteredTypeOptions.length === 0 ? (
                          <div className="px-2 py-1 text-xs text-muted-foreground">No matching types</div>
                        ) : (
                          filteredTypeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))
                        )}
                      </div>
                    </div>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
                <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Assigned To" />
                  </SelectTrigger>
                  <SelectContent className="z-[10050] p-0">
                    <div className="p-2">
                      <div className="relative mb-2">
                        <Input
                          value={assignedToFilterQuery}
                          onChange={(e) => setAssignedToFilterQuery(e.target.value)}
                          placeholder="Search assignees"
                          className="pr-10"
                          onKeyDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        />
                        {assignedToFilterQuery && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setAssignedToFilterQuery('')
                              setAssignedToFilter('all')
                            }}
                            className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground hover:text-foreground"
                            aria-label="Clear assignee filter"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        <SelectItem value="all">All Assignees</SelectItem>
                        {filteredAssignedToOptions.length === 0 ? (
                          <div className="px-2 py-1 text-xs text-muted-foreground">No matching assignees</div>
                        ) : (
                          filteredAssignedToOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name}
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
                      <div className="relative mb-2">
                        <Input
                          value={assignedByFilterQuery}
                          onChange={(e) => setAssignedByFilterQuery(e.target.value)}
                          placeholder="Search creators"
                          className="pr-10"
                          onKeyDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        />
                        {assignedByFilterQuery && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setAssignedByFilterQuery('')
                              setAssignedByFilter('all')
                            }}
                            className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground hover:text-foreground"
                            aria-label="Clear creator filter"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        <SelectItem value="all">All Creators</SelectItem>
                        {filteredAssignedByOptions.length === 0 ? (
                          <div className="px-2 py-1 text-xs text-muted-foreground">No matching creators</div>
                        ) : (
                          filteredAssignedByOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name}
                            </SelectItem>
                          ))
                        )}
                      </div>
                    </div>
                  </SelectContent>
                </Select>

                <Select value={taskNumberFilter} onValueChange={setTaskNumberFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Task Number" />
                  </SelectTrigger>
                  <SelectContent className="z-[10050] p-0">
                    <div className="p-2">
                      <div className="relative mb-2">
                        <Input
                          value={taskNumberFilterQuery}
                          onChange={(e) => setTaskNumberFilterQuery(e.target.value)}
                          placeholder="Search tasks"
                          className="pr-10"
                          onKeyDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        />
                        {taskNumberFilterQuery && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setTaskNumberFilterQuery('')
                              setTaskNumberFilter('all')
                            }}
                            className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground hover:text-foreground"
                            aria-label="Clear task filter"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        <SelectItem value="all">All Tasks</SelectItem>
                        {filteredTaskNumberOptions.length === 0 ? (
                          <div className="px-2 py-1 text-xs text-muted-foreground">No matching tasks</div>
                        ) : (
                          filteredTaskNumberOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))
                        )}
                      </div>
                    </div>
                  </SelectContent>
                </Select>

                <div className="border border-dashed border-border/40 dark:border-border/60 hover:border-border/70 dark:hover:border-border rounded-lg bg-background/80 shadow-sm p-0.5 transition-colors">
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
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRangeFilter?.from ? (
                          dateRangeFilter.to ? (
                            `${format(dateRangeFilter.from, 'LLL dd, y')} - ${format(dateRangeFilter.to, 'LLL dd, y')}`
                          ) : (
                            `${format(dateRangeFilter.from, 'LLL dd, y')} - …`
                          )
                        ) : (
                          'Select due date range'
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
              </div>
              {hasActiveFilters && (
                <div className="flex justify-start mt-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={resetFilters}
                          className="text-xs"
                          aria-label="Reset all filters"
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Reset Filters
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Reset filters</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={(event) => {
                // Optional: Add visual feedback during drag
                const { over } = event
                if (over) {
                  // Could add hover effects here if needed
                }
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                {getColumns().map((column) => {
                  const columnTasks = getTasksByStatus(column.id)
                  
                  return (
                    <ColumnDropZone
                      key={column.id}
                      column={column}
                      tasks={columnTasks}
                      onCreateTask={handleCreateTask}
                      onEditTask={handleEditTask}
                      onDeleteTask={handleDeleteTask}
                      pendingUpdates={pendingUpdates}
                    />
                  )
                })}
              </div>
              
              <DragOverlay>
                {activeTask ? (
                  <SortableTask 
                    task={activeTask}
                    onClick={() => {}}
                    isDragOverlay
                    getPriorityColor={getPriorityColor}
                    getTypeColor={getTypeColor}
                    onEdit={handleEditTask}
                    onDelete={handleDeleteTask}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </CardContent>
        </Card>
      </div>
      </TooltipProvider>
      {/* Modals */}
      <CreateTaskModal
        isOpen={showCreateTaskModal}
        onClose={() => {
          setShowCreateTaskModal(false)
          setCreateTaskStatus(undefined)
        }}
        projectId={projectFilter === 'all' ? '' : projectFilter}
        defaultStatus={createTaskStatus}
        stayOnCurrentPage={true}
        onTaskCreated={() => {
          setShowCreateTaskModal(false)
          setCreateTaskStatus(undefined)
          // Refresh tasks after creation
          fetchTasks()
        }}
      />

      {selectedTask && (
        <EditTaskModal
          isOpen={showEditTaskModal}
          onClose={() => {
            setShowEditTaskModal(false)
            setSelectedTask(null)
          }}
          task={selectedTask}
          onTaskUpdated={() => {
            setShowEditTaskModal(false)
            setSelectedTask(null)
            // Refresh tasks after update
            fetchTasks()
          }}
        />
      )}

      {selectedTask && (
        <ViewTaskModal
          isOpen={showViewTaskModal}
          onClose={() => {
            setShowViewTaskModal(false)
            setSelectedTask(null)
          }}
          task={selectedTask}
          onEdit={() => {
            setShowViewTaskModal(false)
            setShowEditTaskModal(true)
          }}
          onDelete={() => {
            setShowViewTaskModal(false)
            handleDeleteTask(selectedTask._id)
          }}
        />
      )}

      <ConfirmationModal
        isOpen={showDeleteConfirmModal}
        onClose={() => {
          setShowDeleteConfirmModal(false)
          setSelectedTask(null)
        }}
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

interface SortableTaskProps {
  task: Task
  onClick: () => void
  getPriorityColor: (priority: string) => string
  getTypeColor: (type: string) => string
  isDragOverlay?: boolean
  isUpdating?: boolean
  onEdit?: (task: Task) => void
  onDelete?: (taskId: string) => void
}

function SortableTask({ task, onClick, getPriorityColor, getTypeColor, isDragOverlay = false, isUpdating = false, onEdit, onDelete }: SortableTaskProps) {
  const { formatDate } = useDateTime()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`hover:shadow-md transition-shadow cursor-pointer relative ${
        isDragging ? 'opacity-50' : ''
      } ${isDragOverlay ? 'rotate-3 shadow-lg' : ''} ${
        isUpdating ? 'ring-2 ring-blue-500/50 ring-offset-1' : ''
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        {isUpdating && (
          <div className="absolute top-2 right-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          </div>
        )}
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <TruncateTooltip text={task.title}>
              <h4 className="font-medium text-foreground text-sm line-clamp-2">
                {task.title}
              </h4>
            </TruncateTooltip>
            <div className="flex items-center space-x-1">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0 cursor-grab active:cursor-grabbing"
                {...attributes}
                {...listeners}
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="h-3 w-3" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation()
                    onClick()
                  }}>
                    View Details
                  </DropdownMenuItem>
                  {onEdit && (
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation()
                      onEdit(task)
                    }}>
                      Edit Task
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(task._id)
                        }}
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
          
          <div className="flex items-center space-x-2">
            <Badge className={getPriorityColor(task.priority)}>
              {formatToTitleCase(task?.priority)}
            </Badge>
            <Badge className={getTypeColor(task.type)}>
              {formatToTitleCase(task?.type)}
            </Badge>
          </div>
          {task.displayId && (
            <p className="text-xs text-muted-foreground font-medium mt-1">
              #{task.displayId}
            </p>
          )}
          
          <div className="text-xs text-muted-foreground">
            <div className="flex items-center space-x-1 mb-1">
              <Target className="h-3 w-3" />
              <TruncateTooltip text={task?.project?.name}>
                <span className="text-foreground text-sm line-clamp-2">{task?.project?.name}</span>
              </TruncateTooltip>
            </div>
            {task.dueDate && (
              <div className="flex items-center space-x-1 mb-1">
                <Calendar className="h-3 w-3" />
                <span>Due {formatDate(task.dueDate)}</span>
              </div>
            )}
            {task.storyPoints && (
              <div className="flex items-center space-x-1 mb-1">
                <BarChart3 className="h-3 w-3" />
                <span>{task?.storyPoints} points</span>
              </div>
            )}
            {task.estimatedHours && (
              <div className="flex items-center space-x-1">
                <Clock className="h-3 w-3" />
                <span>{task?.estimatedHours}h</span>
              </div>
            )}
          </div>
          
          <div className="text-xs text-muted-foreground">
            {task.assignedTo ? (
              <TruncateTooltip text={`${task?.assignedTo?.firstName} ${task?.assignedTo?.lastName}`}>
                <span>{task?.assignedTo?.firstName} {task?.assignedTo?.lastName}</span>
              </TruncateTooltip>
            ) : (
              <span>Not assigned</span>
            )}
          </div>
          
          {task?.labels?.length > 0 && (
            <div className="flex items-center gap-1 overflow-hidden flex-nowrap">
              {task.labels.slice(0, 2).map((label, index) => (
                <TruncateTooltip key={`${label}-${index}`} text={label}>
                  <Badge
                    variant="outline"
                    className="text-xs truncate max-w-[85px] whitespace-nowrap flex-shrink-0 hover:bg-transparent dark:hover:bg-transparent"
                  >
                    {label}
                  </Badge>
                </TruncateTooltip>
              ))}
              {task.labels.length > 2 && (
                <Badge
                  variant="outline"
                  className="text-xs flex-shrink-0 hover:bg-transparent dark:hover:bg-transparent"
                  title={task.labels.slice(2).join(', ')}
                >
                  +{task.labels.length - 2}
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface TruncateTooltipProps {
  text?: string | number | null
  children: ReactElement
}

function TruncateTooltip({ text, children }: TruncateTooltipProps) {
  const displayText = text === undefined || text === null ? '' : String(text)
  if (!displayText.trim()) {
    return children
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        <p className="max-w-sm break-words">{displayText}</p>
      </TooltipContent>
    </Tooltip>
  )
}
