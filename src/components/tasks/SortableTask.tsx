'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { 
  GripVertical, 
  MoreHorizontal, 
  Target, 
  Calendar, 
  BarChart3, 
  Clock 
} from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { ITask } from '@/models/Task'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

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
  assignees?: Array<{
    firstName: string
    lastName: string
    email: string
  }>
}

interface SortableTaskProps {
  task: PopulatedTask
  onClick: () => void
  getPriorityColor: (priority: string) => string
  getTypeColor: (type: string) => string
  isDragOverlay?: boolean
  onEdit?: (task: PopulatedTask) => void
  onDelete?: (taskId: string) => void
}

export default function SortableTask({ 
  task, 
  onClick, 
  getPriorityColor, 
  getTypeColor, 
  isDragOverlay = false,
  onEdit,
  onDelete
}: SortableTaskProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id as string })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <Card 
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-50' : ''
      } ${isDragOverlay ? 'shadow-lg' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-2 sm:p-3">
      <div className="space-y-2 sm:space-y-3 min-w-0">

      <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="flex-1 min-w-0">
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <h4 className="font-medium text-foreground text-xs sm:text-sm line-clamp-2 truncate">
                      {task.title}
                    </h4>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="start" className="max-w-xs break-words">
                    {task.title}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center space-x-1 flex-shrink-0">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 sm:h-6 sm:w-6 p-0 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 cursor-grab active:cursor-grabbing"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-8 w-8 sm:h-6 sm:w-6 p-0 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3 w-3 sm:h-4 sm:w-4" />
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
                          onDelete(task._id as string)
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
          
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            <Badge className={`${getPriorityColor(task.priority)} text-xs`}>
              {formatToTitleCase(task.priority)}
            </Badge>
            <Badge className={`${getTypeColor(task.type)} text-xs`}>
              {formatToTitleCase(task.type)}
            </Badge>
            {task.displayId && (
              <span className="text-[11px] text-muted-foreground font-medium">
                #{task.displayId}
              </span>
            )}
          </div>
         
          
          <div className="text-xs text-muted-foreground space-y-1 min-w-0">
            {task.project && (
              <div className="flex items-center space-x-1 min-w-0">
                <Target className="h-3 w-3 flex-shrink-0" />
                <span 
                  className="truncate"
                  title={task.project.name && task.project.name.length > 10 ? task.project.name : undefined}
                >
                  {task.project.name && task.project.name.length > 10 ? `${task.project.name.slice(0, 10)}…` : task.project.name}
                </span>
              </div>
            )}
            {task.dueDate && (
              <div className="flex items-center space-x-1">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <span className="whitespace-nowrap">Due {new Date(task.dueDate).toLocaleDateString()}</span>
              </div>
            )}
            {task.storyPoints && (
              <div className="flex items-center space-x-1">
                <BarChart3 className="h-3 w-3 flex-shrink-0" />
                <span>{task.storyPoints} pts</span>
              </div>
            )}
            {task.estimatedHours && (
              <div className="flex items-center space-x-1">
                <Clock className="h-3 w-3 flex-shrink-0" />
                <span>{task.estimatedHours}h</span>
              </div>
            )}
          </div>
          
          {((task.assignees && task.assignees.length > 0) || task.assignedTo) && (
            <div className="flex items-center flex-wrap gap-1 min-w-0">
              {task.assignees && task.assignees.length > 0 ? (
                task.assignees.slice(0, 3).map((assignee, idx) => (
                  <div key={idx} className="flex items-center space-x-1 min-w-0" title={`${assignee.firstName} ${assignee.lastName} (${assignee.email})`}>
                    <div className="w-5 h-5 sm:w-6 sm:h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-medium flex-shrink-0">
                      {assignee.firstName[0]}{assignee.lastName[0]}
                    </div>
                    <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                      {assignee.firstName} {assignee.lastName}
                    </span>
                  </div>
                ))
              ) : task.assignedTo ? (
                <div className="flex items-center space-x-1 min-w-0" title={`${task.assignedTo.firstName} ${task.assignedTo.lastName} (${task.assignedTo.email})`}>
                  <div className="w-5 h-5 sm:w-6 sm:h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-medium flex-shrink-0">
                    {task.assignedTo.firstName[0]}{task.assignedTo.lastName[0]}
                  </div>
                  <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                    {task.assignedTo.firstName} {task.assignedTo.lastName}
                  </span>
                </div>
              ) : null}
              {task.assignees && task.assignees.length > 3 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                  +{task.assignees.length - 3}
                </Badge>
              )}
            </div>
          )}

          {task.labels && task.labels.length > 0 && (
            <div className="flex items-center gap-1 overflow-hidden flex-nowrap">
              {task.labels.slice(0, 2).map((label, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="text-xs truncate max-w-[85px] whitespace-nowrap flex-shrink-0"
                  title={label}
                >
                  {label}
                </Badge>
              ))}
              {task.labels.length > 2 && (
                <Badge
                  variant="outline"
                  className="text-xs flex-shrink-0"
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
