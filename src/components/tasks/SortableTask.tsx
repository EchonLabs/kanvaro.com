'use client'

import React, { useState, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import {
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
  assignedTo?: Array<{
    _id?: string
    firstName?: string
    lastName?: string
    email?: string
    hourlyRate?: number
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
  const [userData, setUserData] = useState<Record<string, any>>({})
  const [loadingUsers, setLoadingUsers] = useState(false)

  // Fetch user data for assignees that are ObjectIds
  useEffect(() => {
    const fetchUserData = async () => {
      if (!task.assignedTo || !Array.isArray(task.assignedTo)) return

      const userIdsToFetch = task.assignedTo
        .map(assignee => typeof assignee === 'string' ? assignee : assignee._id || assignee)
        .filter(userId => userId && !userData[userId.toString()]) // Only fetch users we don't already have

      if (userIdsToFetch.length === 0) return

      setLoadingUsers(true)
      try {
        // Use batch API to fetch all users at once
        const idsParam = userIdsToFetch.join(',')
        const response = await fetch(`/api/users?ids=${idsParam}`, {
          cache: 'force-cache',
        })

        if (response.ok) {
          const userMap = await response.json()
          setUserData(prev => ({ ...prev, ...userMap }))
        } else {
          console.warn('Failed to fetch user data batch:', response.status)
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error)
      } finally {
        setLoadingUsers(false)
      }
    }

    fetchUserData()
  }, [task.assignedTo])

  // Helper function to get assignee data
  const getAssigneeData = (assignee: any) => {
    if (typeof assignee === 'object' && assignee.firstName) {
      // Already populated
      return assignee
    }

    // Need to look up from fetched user data
    const userId = typeof assignee === 'string' ? assignee : assignee._id || assignee
    const userInfo = userData[userId]

    if (userInfo) {
      return {
        firstName: userInfo.firstName || '',
        lastName: userInfo.lastName || '',
        email: userInfo.email || ''
      }
    }

    // Fallback
    return {
      firstName: '',
      lastName: '',
      email: ''
    }
  }
  const { formatDate } = useDateTime()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id.toString() })

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
      className={`hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing select-none hover:bg-muted/20 ${
        isDragging ? 'opacity-50 shadow-lg scale-105' : ''
      } ${isDragOverlay ? 'shadow-2xl scale-105' : ''}`}
      onClick={(e) => {
        // Only trigger click if not dragging and not clicking on interactive elements
        if (!isDragging && e.target === e.currentTarget) {
          onClick()
        }
      }}
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
                          onDelete(task._id.toString())
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
            {task.dueDate &&  (
              <div className="flex items-center space-x-1">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <span className="whitespace-nowrap">Due { new Date(task.dueDate).toLocaleDateString()}</span>   
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

          {task.assignedTo && Array.isArray(task.assignedTo) && task.assignedTo.length > 0 && (
            <div className="flex items-center gap-1 min-w-0">
              {/* Show first assignee */}
              {(() => {
                const firstAssignee = task.assignedTo[0];
                const assigneeData = getAssigneeData(firstAssignee);
                const firstName = assigneeData.firstName || '';
                const lastName = assigneeData.lastName || '';
                const email = assigneeData.email || '';
                const displayName = `${firstName} ${lastName}`.trim() || 'Unknown User';
                const initials = displayName !== 'Unknown User'
                  ? `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
                  : '?';

                return (
                  <div className="flex items-center space-x-1 min-w-0" title={`${displayName} (${email})`}>
                    <div className="w-5 h-5 sm:w-6 sm:h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-medium flex-shrink-0">
                      {initials}
                    </div>
                    <span className="text-xs text-muted-foreground truncate hidden sm:inline max-w-[80px]">
                      {displayName}
                    </span>
                  </div>
                );
              })()}

              {/* Show count of remaining assignees with tooltip */}
              {task.assignedTo.length > 1 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={`text-xs px-2 py-1 cursor-help hover:bg-muted transition-colors border-dashed ${
                          loadingUsers ? 'animate-pulse' : ''
                        }`}
                      >
                        {loadingUsers ? '...' : `+${task.assignedTo.length - 1} more`}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="p-0 shadow-lg border z-[1000]"
                      align="center"
                      avoidCollisions={true}
                    >
                      <div className="bg-background border rounded-lg shadow-lg p-2">
                        {task.assignedTo.map((assignee, idx) => {
                          const assigneeData = getAssigneeData(assignee);
                          const firstName = assigneeData.firstName || '';
                          const lastName = assigneeData.lastName || '';
                          const displayName = `${firstName} ${lastName}`.trim() || 'Unknown User';

                          return (
                            <div
                              key={typeof assignee === 'string' ? assignee : assignee._id || idx}
                              className="text-xs text-foreground py-1"
                            >
                              {displayName}
                            </div>
                          );
                        })}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
