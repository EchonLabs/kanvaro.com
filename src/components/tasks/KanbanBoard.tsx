'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { formatToTitleCase } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Target,
  Play,
  AlertTriangle,
  CheckCircle,
  XCircle,
  User,
  Calendar,
  Clock,
  Loader2,
  Plus,
  BookOpen,
  Zap,
  GripVertical,
  MoreHorizontal,
  BarChart3,
  Settings,
  ChevronDown,
  Search,
  X,
  RotateCcw,
} from 'lucide-react'
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
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import dynamic from 'next/dynamic'
import VirtualizedColumn from './VirtualizedColumn'
import SortableTask from './SortableTask'
import { ITask } from '@/models/Task'
import { useRouter } from 'next/navigation'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions'
import { PermissionGate } from '@/lib/permissions/permission-components'
import {
  PRIORITY_BADGE,
  TYPE_BADGE,
  DEFAULT_KANBAN_COLUMNS,
} from '@/lib/kanban-tokens'

interface PopulatedTask extends Omit<ITask, 'assignedTo' | 'project'> {
  project?: {
    _id: string
    name: string
  }
  assignedTo?: Array<{
    firstName: string
    lastName: string
    email: string
    hourlyRate?: number
  }>
}

// Dynamically import heavy modals
const CreateTaskModal = dynamic(() => import('./CreateTaskModal'), { ssr: false })
const ColumnSettingsModal = dynamic(() => import('./ColumnSettingsModal'), { ssr: false })

interface Project {
  _id: string
  name: string
  description: string
  status: string
  startDate?: string
  endDate?: string
  budget?: number
  teamMembers: any[]
  createdBy: any
  client?: any
  isDraft: boolean
  createdAt: string
  updatedAt: string
  settings?: {
    kanbanStatuses?: Array<{
      key: string
      title: string
      color?: string
      order: number
    }>
  }
}

export interface KanbanFilters {
  search?: string
  status?: string
  priority?: string
  type?: string
  assignedTo?: string
  createdBy?: string
  createdAtFrom?: string
  createdAtTo?: string
}

export interface KanbanBoardProps {
  projectId: string
  filters?: KanbanFilters
  onProjectChange?: (projectId: string) => void
  onCreateTask: () => void
  onEditTask?: (task: PopulatedTask) => void
  onDeleteTask?: (taskId: string) => void
}

const defaultColumns = DEFAULT_KANBAN_COLUMNS

export default function KanbanBoard({ projectId, filters, onProjectChange, onCreateTask, onEditTask, onDeleteTask }: KanbanBoardProps) {
  const [project, setProject] = useState<Project | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(projectId)
  const [tasks, setTasks] = useState<PopulatedTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTask, setActiveTask] = useState<PopulatedTask | null>(null)
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
  const [showColumnSettings, setShowColumnSettings] = useState(false)
  const [createTaskStatus, setCreateTaskStatus] = useState<string | undefined>(undefined)
  const [projectSearchQuery, setProjectSearchQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [priorityFilterQuery, setPriorityFilterQuery] = useState('')
  const [typeFilterQuery, setTypeFilterQuery] = useState('')
  const [assigneeFilterQuery, setAssigneeFilterQuery] = useState('')

  const router = useRouter()
  const { hasPermission, permissions } = usePermissions()
  const isAdmin = typeof permissions?.userRole === 'string' && ['admin', 'super_admin', 'superadmin'].includes(permissions.userRole.toLowerCase())

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  useEffect(() => {
    setSelectedProjectId(projectId || 'all')
  }, [projectId])

  const filteredProjects = useMemo(() => {
    const query = projectSearchQuery.trim().toLowerCase()
    const result = projects.filter((project) => project.name.toLowerCase().includes(query))
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [projects, projectSearchQuery])

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email?: string }>()
    tasks.forEach((task) => {
      if (task.assignedTo && Array.isArray(task.assignedTo)) {
        task.assignedTo.forEach((assignee) => {
          const data = (assignee as any).user && typeof (assignee as any).user === 'object'
            ? (assignee as any).user
            : assignee
          const id = data?._id || data?.email || ''
          if (!id) return
          if (!map.has(id)) {
            map.set(id, {
              id,
              name: `${data?.firstName || ''} ${data?.lastName || ''}`.trim() || 'Unknown User',
              email: data?.email,
            })
          }
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [tasks])

  // Apply client-side filters on top of server-side fetch
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch = !normalizedSearchQuery ||
        task.title?.toLowerCase().includes(normalizedSearchQuery) ||
        (task.description || '').toLowerCase().includes(normalizedSearchQuery) ||
        (task.displayId || '').toLowerCase().includes(normalizedSearchQuery) ||
        String(task.taskNumber ?? '').toLowerCase().includes(normalizedSearchQuery)
      const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter
      const matchesType = typeFilter === 'all' || task.type === typeFilter
      const matchesAssignee = assigneeFilter === 'all' ||
        (Array.isArray(task.assignedTo) && task.assignedTo.some((a: any) => {
          const data = a?.user && typeof a.user === 'object' ? a.user : a
          return data?._id === assigneeFilter || data?.email === assigneeFilter
        }))
      return matchesSearch && matchesPriority && matchesType && matchesAssignee
    })
  }, [tasks, normalizedSearchQuery, priorityFilter, typeFilter, assigneeFilter])

  const filteredAssigneeOptions = useMemo(() => {
    const q = assigneeFilterQuery.trim().toLowerCase()
    if (!q) return assigneeOptions
    return assigneeOptions.filter(o =>
      o.name.toLowerCase().includes(q) || (o.email?.toLowerCase().includes(q) ?? false)
    )
  }, [assigneeOptions, assigneeFilterQuery])

  const priorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' },
  ]
  const filteredPriorityOptions = useMemo(() => {
    const q = priorityFilterQuery.trim().toLowerCase()
    if (!q) return priorityOptions
    return priorityOptions.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  }, [priorityFilterQuery])

  const typeOptions = [
    { value: 'bug', label: 'Bug' },
    { value: 'feature', label: 'Feature' },
    { value: 'improvement', label: 'Improvement' },
    { value: 'task', label: 'Task' },
    { value: 'subtask', label: 'Subtask' },
  ]
  const filteredTypeOptions = useMemo(() => {
    const q = typeFilterQuery.trim().toLowerCase()
    if (!q) return typeOptions
    return typeOptions.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  }, [typeFilterQuery])

  const hasActiveFilters = searchQuery.trim() !== '' || priorityFilter !== 'all' || typeFilter !== 'all' || assigneeFilter !== 'all'

  const resetFilters = () => {
    setSearchQuery('')
    setPriorityFilter('all')
    setTypeFilter('all')
    setAssigneeFilter('all')
    setPriorityFilterQuery('')
    setTypeFilterQuery('')
    setAssigneeFilterQuery('')
  }

  const fetchProject = useCallback(async () => {
    // Don't fetch a specific project if "All Projects" is selected
    if (selectedProjectId === 'all') {
      setProject(null)
      return
    }

    try {
      const response = await fetch(`/api/projects/${selectedProjectId}`)
      const data = await response.json()

      if (data.success) {
        setProject(data.data)
      } else {
        setError(data.error || 'Failed to fetch project')
      }
    } catch (error) {
      console.error('Error fetching project:', error)
      setError('Failed to fetch project')
    }
  }, [selectedProjectId])

  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/projects')
      const data = await response.json()

      if (data.success) {
        setProjects(data.data)
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
    }
  }, [])

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true)

      const params = new URLSearchParams()
      params.set('limit', '1000')

      if (filters?.search) params.set('search', filters.search)
      if (filters?.status && filters.status !== 'all') params.set('status', filters.status)
      if (filters?.priority && filters.priority !== 'all') params.set('priority', filters.priority)
      if (filters?.type && filters.type !== 'all') params.set('type', filters.type)
      if (filters?.assignedTo) params.set('assignedTo', filters.assignedTo)
      if (filters?.createdBy) params.set('createdBy', filters.createdBy)
      if (filters?.createdAtFrom) params.set('createdAtFrom', filters.createdAtFrom)
      if (filters?.createdAtTo) params.set('createdAtTo', filters.createdAtTo)
      if (selectedProjectId && selectedProjectId !== 'all') {
        params.set('project', selectedProjectId)
      }

      let apiUrl = '/api/tasks'
      const queryString = params.toString()
      if (queryString) {
        apiUrl += `?${queryString}`
      }

      const response = await fetch(apiUrl)
      const data = await response.json()

      if (data.success) {
        setTasks(data.data)
      } else {
        setError(data.error || 'Failed to fetch tasks')
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
      setError('Failed to fetch tasks')
    } finally {
      setLoading(false)
    }
  }, [filters, selectedProjectId])

  useEffect(() => {
    fetchProject()
    fetchProjects()
  }, [fetchProject, fetchProjects])

  useEffect(() => {
    fetchTasks()
  }, [selectedProjectId, fetchTasks])

  const getColumns = () => {
    // Use custom columns from project settings if available, otherwise use defaults
    if (project?.settings?.kanbanStatuses && project.settings.kanbanStatuses.length > 0) {
      // Sort by order to ensure correct display order
      return [...project.settings.kanbanStatuses].sort((a, b) => (a.order || 0) - (b.order || 0))
    }
    // Fall back to default columns if no custom columns are set
    return defaultColumns
  }

  const getTasksByStatus = (status: string) => {
    return filteredTasks.filter(task => task.status === status)
  }

  const getPriorityColor = (priority: string) => {
    const cfg = PRIORITY_BADGE[priority] ?? PRIORITY_BADGE.medium
    return `${cfg.bg} ${cfg.text}`
  }

  const getTypeColor = (type: string) => {
    const cfg = TYPE_BADGE[type] ?? TYPE_BADGE.task
    return `${cfg.bg} ${cfg.text}`
  }

  const handleProjectChange = (newProjectId: string) => {
    setSelectedProjectId(newProjectId)
    setProjectSearchQuery('')
    setError(null)
    if (onProjectChange) {
      onProjectChange(newProjectId)
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const task = tasks.find(t => t._id?.toString() === active.id)
    setActiveTask(task || null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)

    if (!over) return

    const activeId = active.id
    const overId = over.id

    if (activeId === overId) return

    // Find the task being dragged
    const activeTask = tasks.find(task => task._id?.toString() === activeId)
    if (!activeTask) return

    // Determine the new status based on the drop target
    let newStatus = activeTask.status
    const columns = getColumns()

    // Check if dropped directly on a column (empty column drop)
    if (typeof overId === 'string' && columns.some(col => col.key === overId)) {
      newStatus = overId as any
    } else {
      // If dropped on another task, get the status of that task
      const overTask = tasks.find(task => task._id?.toString() === overId)
      if (overTask) {
        newStatus = overTask.status
      } else {
        // If we can't find the task, check if overId is a column key
        // This handles cases where the drop target might be the column container
        const columnMatch = columns.find(col => col.key === overId)
        if (columnMatch) {
          newStatus = columnMatch.key as any
        }
      }
    }

    // Handle same-column reordering
    if (newStatus === activeTask.status) {
      const columnTasks = getTasksByStatus(newStatus)
      const oldIndex = columnTasks.findIndex(task => task._id?.toString() === activeId)
      const newIndex = columnTasks.findIndex(task => task._id?.toString() === overId)

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reorderedTasks = arrayMove(columnTasks, oldIndex, newIndex)
        const orderedTaskIds = reorderedTasks.map(task => task._id)

        // Optimistic update - update UI immediately
        setTasks(prevTasks => {
          const updatedTasks = [...prevTasks]
          reorderedTasks.forEach((task, index) => {
            const taskIndex = updatedTasks.findIndex(t => t._id?.toString() === task._id?.toString())
            if (taskIndex !== -1) {
              updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], position: index } as PopulatedTask
            }
          })
          return updatedTasks
        })

        // Background API call
        try {
          const response = await fetch('/api/tasks/reorder', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectId,
              status: newStatus,
              orderedTaskIds
            })
          })

          const data = await response.json()
          if (!data.success) {
            // Revert optimistic update on failure
            console.error('Failed to reorder tasks:', data.error)
            // Refetch to get correct state
            fetchTasks()
          }
        } catch (error) {
          console.error('Failed to reorder tasks:', error)
          // Revert optimistic update on network failure
          fetchTasks() // Refetch to get correct state
        }
      }
    } else {
      // Handle cross-column moves
      const originalStatus = activeTask.status

      // Optimistic update - update UI immediately
      setTasks(tasks.map(task =>
        task._id?.toString() === activeId ? { ...task, status: newStatus } as PopulatedTask : task
      ))

      // Background API call
      try {
        const response = await fetch(`/api/tasks/${activeId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: newStatus })
        })

        const data = await response.json()

        if (!data.success) {
          // Revert optimistic update on failure
          console.error('Failed to update task status:', data.error)
          setTasks(tasks.map(task =>
            task._id?.toString() === activeId ? { ...task, status: originalStatus } as PopulatedTask : task
          ))
        }
      } catch (error) {
        console.error('Failed to update task status:', error)
        // Revert optimistic update on network failure
        setTasks(tasks.map(task =>
          task._id?.toString() === activeId ? { ...task, status: originalStatus } as PopulatedTask : task
        ))
      }
    }
  }

  const handleCreateTask = (status?: string) => {
    setCreateTaskStatus(status)
    setShowCreateTaskModal(true)
  }

  const handleTaskCreated = () => {
    fetchTasks()
    setShowCreateTaskModal(false)
    setCreateTaskStatus(undefined)
  }

  const handleColumnsUpdated = async () => {
    // Refetch project to get updated columns, then refresh tasks
    await fetchProject()
    await fetchTasks()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-foreground truncate">
              Kanban Board {selectedProjectId === 'all' ? '- All Projects' : project ? `- ${project.name}` : ''}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Drag and drop tasks between columns to update their status. Stories, sprints, and epics will auto-complete when all their tasks are done.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-8 px-2"
                title="Reset all filters"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline text-xs">Reset</span>
              </Button>
            )}
            <PermissionGate 
              permission={Permission.TASK_EDIT_ALL}
              projectId={selectedProjectId !== 'all' ? selectedProjectId : undefined}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowColumnSettings(true)}
                disabled={selectedProjectId === 'all'}
                title={selectedProjectId === 'all' ? 'Please select a specific project to manage columns' : 'Manage Kanban columns'}
                className="h-8"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline text-xs ml-1">Columns</span>
              </Button>
            </PermissionGate>
            {hasPermission(Permission.TASK_CREATE) && selectedProjectId !== 'all' && (
              <Button
                onClick={() => handleCreateTask()}
                size="sm"
                className="h-8"
                title="Add a new task"
              >
                <Plus className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">New Task</span>
              </Button>
            )}
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row items-stretch gap-2 sm:gap-3">
          {/* Project Selector */}
          <Select value={selectedProjectId} onValueChange={handleProjectChange}>
            <SelectTrigger className="w-full sm:w-[200px] h-9 text-sm">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent className="z-[10010] p-0">
              <div className="p-2">
                <Input
                  value={projectSearchQuery}
                  onChange={(e) => setProjectSearchQuery(e.target.value)}
                  placeholder="Search projects"
                  className="h-7 text-xs mb-1"
                  onKeyDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                <div className="max-h-56 overflow-y-auto">
                  <SelectItem value="all">All Projects</SelectItem>
                  {filteredProjects.length === 0 ? (
                    <div className="px-2 py-1 text-xs text-muted-foreground">No matching projects</div>
                  ) : (
                    filteredProjects.map((project) => (
                      <SelectItem key={project._id} value={project._id}>
                        {project.name}
                      </SelectItem>
                    ))
                  )}
                </div>
              </div>
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks, IDs..."
              className="h-9 pl-9 pr-3 text-sm"
              onKeyDown={(e) => e.stopPropagation()}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Priority Filter */}
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-full sm:w-[130px] h-9 text-sm">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent className="z-[10003] p-0">
              <div className="p-1">
                <SelectItem value="all">All Priorities</SelectItem>
                {filteredPriorityOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </div>
            </SelectContent>
          </Select>

          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[130px] h-9 text-sm">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="z-[10002] p-0">
              <div className="p-1">
                <SelectItem value="all">All Types</SelectItem>
                {filteredTypeOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </div>
            </SelectContent>
          </Select>

          {/* Assignee Filter */}
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-full sm:w-[140px] h-9 text-sm">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent className="z-[10001] p-0">
              <div className="p-1">
                <div className="relative mb-1">
                  <Input
                    value={assigneeFilterQuery}
                    onChange={(e) => setAssigneeFilterQuery(e.target.value)}
                    placeholder="Search..."
                    className="h-7 text-xs"
                    onKeyDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                </div>
                <SelectItem value="all">All Assignees</SelectItem>
                {filteredAssigneeOptions.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">No matching assignees</div>
                ) : (
                  filteredAssigneeOptions.map(opt => (
                    <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
                  ))
                )}
              </div>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-2 [scrollbar-width:thin] [scrollbar-color:var(--apple-separator)_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[var(--apple-separator)] [&::-webkit-scrollbar-thumb]:rounded-full">
          <div
            className="grid gap-3 sm:gap-4 min-w-max sm:min-w-0"
            style={{
              gridTemplateColumns: `repeat(${getColumns().length}, minmax(280px, 1fr))`,
            }}
          >
            {getColumns().map((column) => {
              const columnTasks = getTasksByStatus(column.key)

              return (
                 <VirtualizedColumn
                   key={column.key}
                   column={{
                     key: column.key,
                     title: column.title,
                     color: column.color || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                   }}
                   tasks={columnTasks}
                   onCreateTask={handleCreateTask}
                   getPriorityColor={getPriorityColor}
                   getTypeColor={getTypeColor}
                   onTaskClick={(task) => {
                     // Navigate to task detail page
                     router.push(`/tasks/${task._id}`)
                   }}
                   onEditTask={onEditTask}
                   onDeleteTask={onDeleteTask}
                   canDragTask={(task) => {
                     // Allow dragging if task is not in backlog, or if it is in backlog but assigned to a sprint
                     return task.status !== 'backlog' || !!task.sprint
                   }}
                 />
              )
            })}
          </div>
        </div>

        <DragOverlay>
          {activeTask ? (
            <SortableTask
              task={activeTask}
              onClick={() => { }}
              getPriorityColor={getPriorityColor}
              getTypeColor={getTypeColor}
              isDragOverlay
              canDelete={isAdmin}
            //  onEdit={onEditTask}
              onDelete={onDeleteTask}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <CreateTaskModal
        isOpen={showCreateTaskModal}
        onClose={() => {
          setShowCreateTaskModal(false)
          setCreateTaskStatus(undefined)
        }}
        projectId={selectedProjectId === 'all' ? '' : selectedProjectId}
        onTaskCreated={handleTaskCreated}
        defaultStatus={createTaskStatus}
        availableStatuses={getColumns().map(col => ({ key: col.key, title: col.title }))}
      />

      <ColumnSettingsModal
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        projectId={selectedProjectId === 'all' ? '' : selectedProjectId}
        currentColumns={getColumns().map((col, index) => {
          const order = 'order' in col ? (col.order !== undefined ? col.order : index) : index
          return {
            key: col.key,
            title: col.title,
            color: col.color || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
            order
          }
        })}
        onColumnsUpdated={handleColumnsUpdated}
      />
    </div>
  )
}