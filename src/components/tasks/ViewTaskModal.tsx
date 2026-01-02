'use client'

import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { 
  X, 
  Calendar, 
  User, 
  Target, 
  Clock,
  Edit,
  Trash2,
  CheckCircle,
  Circle,
  AlertCircle,
  Play,
  AlertTriangle,
  Zap,
  XCircle,
  Layers
} from 'lucide-react'

interface ViewTaskModalProps {
  isOpen: boolean
  onClose: () => void
  task: any
  onEdit: () => void
  onDelete: () => void
}

export default function ViewTaskModal({ isOpen, onClose, task, onEdit, onDelete }: ViewTaskModalProps) {
  if (!isOpen || !task) return null

  const { formatDate, formatTime } = useDateTime()

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'destructive'
      case 'high': return 'destructive'
      case 'medium': return 'default'
      case 'low': return 'secondary'
      default: return 'default'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'backlog':
      case 'todo':
        return 'outline'
      case 'in_progress':
      case 'review':
      case 'testing':
        return 'secondary'
      case 'done':
        return 'default'
      case 'cancelled':
        return 'destructive'
      default:
        return 'outline'
    }
  }

  const formatDateModal = (dateString: string) => {
    if (!dateString) return 'Not set'
    return formatDate(dateString)
  }

  const formatDateTimeModal = (dateString?: string) => {
    if (!dateString) return 'Not set'
    return `${formatDate(dateString)} ${formatTime(dateString)}`
  }

  const getSubtaskBadgeClass = (status: string) => {
    switch (status) {
      case 'backlog': return 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800'
      case 'todo': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
      case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800'
      case 'review': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-800'
      case 'testing': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-200 dark:hover:bg-purple-800'
      case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-800'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
    }
  }

  const getSubtaskStatusIcon = (status: string) => {
    switch (status) {
      case 'backlog': return <Layers className="h-4 w-4" />
      case 'todo': return <Target className="h-4 w-4" />
      case 'in_progress': return <Play className="h-4 w-4" />
      case 'review': return <AlertTriangle className="h-4 w-4" />
      case 'testing': return <Zap className="h-4 w-4" />
      case 'done': return <CheckCircle className="h-4 w-4" />
      case 'cancelled': return <XCircle className="h-4 w-4" />
      default: return <Target className="h-4 w-4" />
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col m-4 sm:m-6">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <Target className="h-5 w-5" />
                <span>{task.title} {task.displayId}</span>
              </CardTitle>
              <CardDescription>Task Details</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button variant="destructive" size="sm" onClick={onDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-6">
          {/* Basic Information */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Status</label>
              <div className="mt-1">
                <Badge variant={getStatusColor(task.status)}>
                  {formatToTitleCase(task.status)}
                </Badge>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Priority</label>
              <div className="mt-1">
                <Badge variant={getPriorityColor(task.priority)}>
                  {formatToTitleCase(task.priority)}
                </Badge>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Type</label>
              <div className="mt-1">
                <Badge variant="outline">
                  {formatToTitleCase(task.type)}
                </Badge>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Assigned To</label>
              <div className="mt-1 flex items-center space-x-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>
                  {task.assignedTo && Array.isArray(task.assignedTo) && task.assignedTo.length > 0 ?
                    (() => {
                      const firstAssignee = task.assignedTo[0];
                      const userData = firstAssignee.user || firstAssignee;
                      return `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Unknown User';
                    })() :
                    'Unassigned'
                  }
                </span>
              </div>
            </div>

            {task.storyPoints && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Story Points</label>
                <div className="mt-1">
                  <Badge variant="outline">{task.storyPoints}</Badge>
                </div>
              </div>
            )}

            {task.estimatedHours && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Estimated Hours</label>
                <div className="mt-1 flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{task.estimatedHours}h</span>
                </div>
              </div>
            )}

            {task.dueDate && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Due Date</label>
                <div className="mt-1 flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{formatDateModal(task.dueDate)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          {task.description && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Description</label>
              <div className="mt-1 p-3 bg-muted rounded-lg">
                <p className="text-sm">{task.description}</p>
              </div>
            </div>
          )}

          {/* Labels */}
          {task.labels && task.labels.length > 0 && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Labels</label>
              <div className="mt-1 flex flex-wrap gap-1">
                {task.labels.map((label: string, index: number) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {label}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Subtasks */}
          {task.subtasks && task.subtasks.length > 0 && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Subtasks</label>
              <div className="mt-1 space-y-2">
                {task.subtasks.map((subtask: any, index: number) => (
                  <div key={subtask._id || index} className="p-3 border rounded-lg">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="mt-1">
                            {subtask.isCompleted ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`font-medium ${subtask.isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                                {subtask.title}
                              </span>
                              <Badge className={`${getSubtaskBadgeClass(subtask.status)} text-xs flex items-center gap-1`}>
                                {getSubtaskStatusIcon(subtask.status)}
                                <span>{subtask.status?.replace('_', ' ')}</span>
                              </Badge>
                            </div>
                            {subtask.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {subtask.description}
                              </p>
                            )}
                          </div>
                        </div>
                        {subtask.isCompleted && (
                          <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50">
                            Completed
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>Created {formatDateTimeModal(subtask.createdAt)}</span>
                        <span>Updated {formatDateTimeModal(subtask.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Created/Updated Info */}
          <div className="pt-4 border-t">
            <div className="grid gap-2 text-sm text-muted-foreground">
              <div>Created: {formatDateModal(task.createdAt)}</div>
              <div>Updated: {formatDateModal(task.updatedAt)}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
