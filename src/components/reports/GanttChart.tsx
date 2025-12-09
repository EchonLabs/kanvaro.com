'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { 
  ZoomIn, 
  ZoomOut, 
  Move, 
  Calendar,
  User,
  Clock,
  AlertTriangle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GanttTask } from '@/lib/gantt'

interface GanttChartProps {
  tasks: GanttTask[]
  startDate: Date
  endDate: Date
  onTaskClick?: (task: GanttTask) => void
  className?: string
}

export function GanttChart({
  tasks,
  startDate,
  endDate,
  onTaskClick,
  className
}: GanttChartProps) {
  const [zoom, setZoom] = useState(1)
  const [scrollX, setScrollX] = useState(0)
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Ensure dates are Date objects
  const safeStartDate = startDate instanceof Date ? startDate : new Date(startDate)
  const safeEndDate = endDate instanceof Date ? endDate : new Date(endDate)

  const totalDays = Math.ceil((safeEndDate.getTime() - safeStartDate.getTime()) / (1000 * 60 * 60 * 24))
  const dayWidth = 30 * zoom
  const totalWidth = totalDays * dayWidth

  const getTaskPosition = (task: GanttTask) => {
    // Ensure task dates are Date objects
    const taskStart = task.start instanceof Date ? task.start : new Date(task.start)
    const taskEnd = task.end instanceof Date ? task.end : new Date(task.end)
    
    const daysFromStart = Math.floor((taskStart.getTime() - safeStartDate.getTime()) / (1000 * 60 * 60 * 24))
    const taskDuration = Math.ceil((taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24))
    
    return {
      left: daysFromStart * dayWidth,
      width: Math.max(taskDuration * dayWidth, 60), // Minimum width
      height: 40
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return 'bg-green-500'
      case 'in_progress': return 'bg-blue-500'
      case 'review': return 'bg-yellow-500'
      case 'testing': return 'bg-purple-500'
      case 'cancelled': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'border-red-500'
      case 'high': return 'border-orange-500'
      case 'medium': return 'border-yellow-500'
      case 'low': return 'border-green-500'
      default: return 'border-gray-500'
    }
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    })
  }

  const generateTimeline = () => {
    const timeline = []
    const currentDate = new Date(safeStartDate)
    
    while (currentDate <= safeEndDate) {
      timeline.push(new Date(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return timeline
  }

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.2, 3))
  }

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.2, 0.5))
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollX(e.currentTarget.scrollLeft)
  }

  return (
    <div className={cn('w-full', className)}>
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Gantt Chart
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomIn}
                disabled={zoom >= 3}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="relative">
            {/* Timeline Header */}
            <div className="sticky top-0 bg-background border-b z-10">
              <div className="flex">
                <div className="w-64 p-4 border-r bg-muted/50">
                  <span className="font-medium">Tasks</span>
                </div>
                <div 
                  className="flex-1 overflow-hidden"
                  style={{ width: totalWidth }}
                >
                  <div className="flex">
                    {generateTimeline().map((date, index) => (
                      <div
                        key={index}
                        className="border-r p-2 text-xs text-center"
                        style={{ width: dayWidth }}
                      >
                        {formatDate(date)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Chart Content */}
            <div 
              ref={containerRef}
              className="overflow-auto max-h-96"
              onScroll={handleScroll}
            >
              <div className="flex">
                {/* Task List */}
                <div className="w-64 border-r bg-muted/20">
                  {tasks.map((task, index) => (
                    <div
                      key={task.id}
                      className={cn(
                        'p-3 border-b hover:bg-muted/50 cursor-pointer transition-colors',
                        selectedTask === task.id && 'bg-primary/10'
                      )}
                      onClick={() => {
                        setSelectedTask(task.id)
                        onTaskClick?.(task)
                      }}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {task.title}
                          </span>
                          <Badge 
                            variant="outline" 
                            className={cn('text-xs', getPriorityColor(task.priority))}
                          >
                            {task.priority}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {task.assignee && (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {task.assignee}
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {(() => {
                              const taskStart = task.start instanceof Date ? task.start : new Date(task.start)
                              const taskEnd = task.end instanceof Date ? task.end : new Date(task.end)
                              return Math.ceil((taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24))
                            })()}d
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Gantt Bars */}
                <div 
                  className="relative"
                  style={{ width: totalWidth }}
                >
                  {tasks.map((task, index) => {
                    const position = getTaskPosition(task)
                    const isOverdue = task.end < new Date() && task.status !== 'done'
                    
                    return (
                      <div
                        key={task.id}
                        className="absolute top-0 h-10 flex items-center"
                        style={{
                          left: position.left,
                          width: position.width,
                          top: index * 50 + 5
                        }}
                      >
                        <div
                          className={cn(
                            'relative h-8 rounded-md border-2 cursor-pointer transition-all hover:shadow-md',
                            getStatusColor(task.status),
                            getPriorityColor(task.priority),
                            isOverdue && 'ring-2 ring-red-500'
                          )}
                          onClick={() => {
                            setSelectedTask(task.id)
                            onTaskClick?.(task)
                          }}
                        >
                          {/* Progress Bar */}
                          <div
                            className="absolute inset-0 bg-white/20 rounded-md"
                            style={{ width: `${task.progress}%` }}
                          />
                          
                          {/* Task Label */}
                          <div className="absolute inset-0 flex items-center px-2">
                            <span className="text-xs font-medium text-white truncate">
                              {task.title}
                            </span>
                          </div>

                          {/* Overdue Indicator */}
                          {isOverdue && (
                            <div className="absolute -top-1 -right-1">
                              <AlertTriangle className="h-3 w-3 text-red-500" />
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
