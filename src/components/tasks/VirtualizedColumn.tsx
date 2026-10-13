'use client'

import { useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Badge } from '@/components/ui/Badge'
import { Target, AlertTriangle } from 'lucide-react'
import SortableTask from './SortableTask'
import { ITask } from '@/models/Task'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { getColumnAccentColor } from '@/lib/kanban-tokens'

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

interface Column {
  key: string
  title: string
  color: string
}

interface VirtualizedColumnProps {
  column: Column
  tasks: PopulatedTask[]
  onCreateTask?: (status?: string) => void
  getPriorityColor: (priority: string) => string
  getTypeColor: (type: string) => string
  onTaskClick?: (task: PopulatedTask) => void
  onEditTask?: (task: PopulatedTask) => void
  onDeleteTask?: (taskId: string) => void
  canDragTask?: (task: PopulatedTask) => boolean
}

export default function VirtualizedColumn({
  column,
  tasks,
  onCreateTask,
  getPriorityColor,
  getTypeColor,
  onTaskClick,
  onEditTask,
  onDeleteTask,
  canDragTask
}: VirtualizedColumnProps) {
   const parentRef = useRef<HTMLDivElement | null>(null)
   const scrollRef = useRef<HTMLDivElement | null>(null)
   const { hasPermission, permissions } = usePermissions()
   const isAdmin = typeof permissions?.userRole === 'string' && ['admin', 'super_admin', 'superadmin'].includes(permissions.userRole.toLowerCase())
   
   const overdueCount = useMemo(() => {
     return tasks.filter(task => {
       if (!task.dueDate) return false
       const d = new Date(task.dueDate)
       if (isNaN(d.getTime())) return false
       const today = new Date()
       today.setHours(0, 0, 0, 0)
       return d < today
     }).length
   }, [tasks])
  
  // Add droppable functionality for empty columns
  const { setNodeRef, isOver } = useDroppable({
    id: column.key,
  })
  
  const rowVirtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 180,
    overscan: 5,
    gap: 12,
  })

  const setDroppableRef = (node: HTMLDivElement | null) => {
    setNodeRef(node)
    parentRef.current = node
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-[320px] sm:min-w-0 w-full sm:w-auto">
      <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3 shadow-sm border border-[var(--apple-separator)]">
        <div className="flex items-center space-x-2 min-w-0">
          <Badge className={`text-xs sm:text-sm truncate px-2 py-1 font-medium`}   style={{
              color: getColumnAccentColor(column.key),
              borderColor: getColumnAccentColor(column.key),
            }}>
              {column.title}
            </Badge>
           <span className="text-xs sm:text-sm text-muted-foreground flex-shrink-0">
             {tasks.length}
           </span>
           {overdueCount > 0 && (
             <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 flex items-center gap-1 whitespace-nowrap flex-shrink-0">
               <AlertTriangle className="h-2.5 w-2.5" />
               {overdueCount} overdue
             </Badge>
           )}
         </div>
       </div>
       
        <SortableContext
          items={tasks.map(task => task._id.toString())}
          strategy={verticalListSortingStrategy}
        >
          <div
            ref={setDroppableRef}
            className={`relative h-[360px] sm:h-[460px] md:h-[560px] border border-dashed rounded-2xl transition-all duration-200 bg-background/50 shadow-sm ${
              isOver
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                : 'border-border/40 hover:border-border/60'
            }`}
          >
           {/* Accent strip at top */}
            <div
              className="absolute top-0 left-0 right-0 h-1 rounded-t-xl z-10"
              style={{ background: getColumnAccentColor(column.key) }} />
            <div
              ref={scrollRef}
              className="h-full overflow-auto overflow-x-hidden px-4 py-4 pt-5"
            >
              {tasks.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  <div className="text-center space-y-2">
                    <Target className="h-9 w-9 mx-auto opacity-50" />
                    <p className="text-sm font-medium">No tasks here</p>
                 <p className="text-xs opacity-70">Drag tasks to this column</p>
                  </div>
                </div>
              ) : (
                <div
                  className="relative w-full"
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const task = tasks[virtualRow.index]
                    if (!task) return null
                    return (
                      <div
                        key={task._id?.toString() || virtualRow.key}
                        ref={rowVirtualizer.measureElement}
                        data-index={virtualRow.index}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                          padding: '0 0.35rem',
                        }}
                      >
                        <SortableTask
                          task={task}
                          onClick={() => onTaskClick?.(task)}
                          getPriorityColor={getPriorityColor}
                          getTypeColor={getTypeColor}
                      onEdit={task => onEditTask?.(task as unknown as PopulatedTask)}
                          onDelete={task => onDeleteTask?.(task)}
                          canDelete={isAdmin}
                      isDraggable={canDragTask ? canDragTask(task) : true}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </SortableContext>
    </div>
  )
}