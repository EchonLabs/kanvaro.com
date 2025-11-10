'use client'

import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
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
  AlertCircle
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
console.log('task', task);

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
      case 'done': return 'default'
      case 'in_progress': return 'default'
      case 'review': return 'secondary'
      case 'testing': return 'secondary'
      case 'todo': return 'outline'
      default: return 'outline'
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not set'
    return new Date(dateString).toLocaleDateString()
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
                  {task.status?.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Priority</label>
              <div className="mt-1">
                <Badge variant={getPriorityColor(task.priority)}>
                  {task.priority?.toUpperCase()}
                </Badge>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Type</label>
              <div className="mt-1">
                <Badge variant="outline">
                  {task.type?.toUpperCase()}
                </Badge>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Assigned To</label>
              <div className="mt-1 flex items-center space-x-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>
                  {task.assignedTo ? 
                    `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : 
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
                  <span>{formatDate(task.dueDate)}</span>
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
                  <div key={index} className="p-3 border rounded-lg">
                    <div className="flex items-start space-x-3">
                      <div className="mt-1">
                        {subtask.isCompleted ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className={`font-medium ${subtask.isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                            {subtask.title}
                          </span>
                          <Badge variant={getStatusColor(subtask.status)} className="text-xs">
                            {subtask.status?.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </div>
                        {subtask.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {subtask.description}
                          </p>
                        )}
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
              <div>Created: {formatDate(task.createdAt)}</div>
              <div>Updated: {formatDate(task.updatedAt)}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
