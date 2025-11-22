'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
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
  ChevronDown
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

interface PopulatedTask extends Omit<ITask, 'assignedTo' | 'project'> {
  project?: {
    _id: string
    name: string
  }
  assignedTo?: {
    firstName: string
    lastName: string
    email: string
  }
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

interface KanbanBoardProps {
  projectId: string
  onCreateTask: () => void
  onEditTask?: (task: PopulatedTask) => void
  onDeleteTask?: (taskId: string) => void
}

const defaultColumns = [
  { key: 'backlog', title: 'Backlog', color: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200' },
  { key: 'todo', title: 'To Do', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200' },
  { key: 'in_progress', title: 'In Progress', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { key: 'review', title: 'Review', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  { key: 'testing', title: 'Testing', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  { key: 'done', title: 'Done', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' }
]

export default function KanbanBoard({ projectId, onCreateTask, onEditTask, onDeleteTask }: KanbanBoardProps) {
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

  const router = useRouter()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

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
      
      // Build the API URL based on selected project
      let apiUrl = '/api/tasks'
      if (selectedProjectId && selectedProjectId !== 'all') {
        apiUrl += `?project=${selectedProjectId}`
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
  }, [selectedProjectId])

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
    return tasks.filter(task => task.status === status)
  }

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'bug':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'feature':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'task':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'story':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const handleProjectChange = (newProjectId: string) => {
    setSelectedProjectId(newProjectId)
    setError(null)
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

    const activeId = active.id
    const overId = over.id

    if (activeId === overId) return

    // Find the task being dragged
    const activeTask = tasks.find(task => task._id === activeId)
    if (!activeTask) return

    // Determine the new status based on the drop target
    let newStatus = activeTask.status
    const columns = getColumns()
    
    // Check if dropped directly on a column (empty column drop)
    if (typeof overId === 'string' && columns.some(col => col.key === overId)) {
      newStatus = overId as any
    } else {
      // If dropped on another task, get the status of that task
      const overTask = tasks.find(task => task._id === overId)
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
      const oldIndex = columnTasks.findIndex(task => task._id === activeId)
      const newIndex = columnTasks.findIndex(task => task._id === overId)
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reorderedTasks = arrayMove(columnTasks, oldIndex, newIndex)
        const orderedTaskIds = reorderedTasks.map(task => task._id)
        
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
          if (data.success) {
            // Update local state
            setTasks(prevTasks => {
              const updatedTasks = [...prevTasks]
              reorderedTasks.forEach((task, index) => {
                const taskIndex = updatedTasks.findIndex(t => t._id === task._id)
                if (taskIndex !== -1) {
                  updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], position: index } as PopulatedTask
                }
              })
              return updatedTasks
            })
          }
        } catch (error) {
          console.error('Failed to reorder tasks:', error)
        }
      }
    } else {
      // Handle cross-column moves
      try {
        const response = await fetch(`/api/tasks/${activeId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: newStatus })
        })

        const data = await response.json()
        
        if (data.success) {
          setTasks(tasks.map(task => 
            task._id === activeId ? { ...task, status: newStatus } as PopulatedTask : task
          ))
        }
      } catch (error) {
        console.error('Failed to update task status:', error)
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-foreground truncate">
              Kanban Board {selectedProjectId === 'all' ? '- All Projects' : project ? `- ${project.name}` : ''}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Drag and drop tasks between columns to update their status. Stories, sprints, and epics will auto-complete when all their tasks are done.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2 flex-wrap">
          <Select value={selectedProjectId} onValueChange={handleProjectChange}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project._id} value={project._id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:ml-auto">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowColumnSettings(true)}
              disabled={selectedProjectId === 'all'}
              title={selectedProjectId === 'all' ? 'Please select a specific project to manage columns' : 'Manage Kanban columns'}
              className="w-full sm:w-auto"
            >
              <Settings className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Manage Columns</span>
              <span className="sm:hidden">Columns</span>
            </Button>
            <Button 
              onClick={() => handleCreateTask()}
              disabled={selectedProjectId === 'all'}
              title={selectedProjectId === 'all' ? 'Please select a specific project to create tasks' : 'Add a new task'}
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </div>
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
        <div className="overflow-x-auto overflow-y-hidden -mx-4 px-4 sm:mx-0 sm:px-0">
          <div 
            className="grid gap-4 sm:gap-6 min-w-max sm:min-w-0"
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
              />
            )
          })}
          </div>
        </div>
        
        <DragOverlay>
          {activeTask ? (
            <SortableTask 
              task={activeTask}
              onClick={() => {}}
              getPriorityColor={getPriorityColor}
              getTypeColor={getTypeColor}
              isDragOverlay
              onEdit={onEditTask}
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