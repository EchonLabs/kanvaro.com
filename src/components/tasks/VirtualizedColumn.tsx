'use client'

import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Target, Plus } from 'lucide-react'
import SortableTask from './SortableTask'
import { ITask } from '@/models/Task'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'

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

const CARD_VERTICAL_GAP = 28

interface VirtualizedColumnProps {
  column: Column
  tasks: PopulatedTask[]
  onCreateTask: (status?: string) => void
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
  const { hasPermission } = usePermissions()
  
  // Add droppable functionality for empty columns
  const { setNodeRef, isOver } = useDroppable({
    id: column.key,
  })
  
  const rowVirtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 220,
    overscan: 6,
    measureElement: (element) => element?.getBoundingClientRect().height || 0,
  })

  const setDroppableRef = (node: HTMLDivElement | null) => {
    setNodeRef(node)
    parentRef.current = node
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-[320px] sm:min-w-0 w-full sm:w-auto">
      <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3 shadow-sm">
        <div className="flex items-center space-x-2 min-w-0">
          <Badge className={`${column.color} text-xs sm:text-sm truncate px-2 py-1`}>
            {column.title}
          </Badge>
          <span className="text-xs sm:text-sm text-muted-foreground flex-shrink-0">
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission(Permission.TASK_CREATE) && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => onCreateTask(column.key)}
              className="flex items-center gap-1 h-8 px-3 text-xs"
            >
              <Plus className="h-3 w-3" />
              <span className="hidden sm:inline">Add Task</span>
            </Button>
          )}
        </div>
      </div>
      
        <SortableContext
          items={tasks.map(task => task._id.toString())}
          strategy={verticalListSortingStrategy}
        >
        <div 
          ref={setDroppableRef}
          className={`h-[360px] sm:h-[460px] md:h-[560px] overflow-auto overflow-x-hidden border border-dashed rounded-2xl transition-colors bg-background/80 px-4 py-4 shadow-sm space-y-3 ${
            isOver 
              ? 'border-primary bg-primary/5' 
              : 'border-border/40 hover:border-border/70'
          }`}
        >
          {tasks.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              <div className="text-center space-y-1">
                <Target className="h-9 w-9 mx-auto opacity-50" />
                <p className="text-sm">Drop tasks here</p>
              </div>
            </div>
          ) : (
            <div
              className="h-full relative"
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const task = tasks[virtualRow.index]
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                      padding: `0 0.35rem 0 0.35rem`,
                      marginBottom: `${CARD_VERTICAL_GAP}px`,
                    }}
                  >
                    <SortableTask
                      task={task}
                      onClick={() => onTaskClick?.(task)}
                      getPriorityColor={getPriorityColor}
                      getTypeColor={getTypeColor}
                      onEdit={task => onEditTask?.(task as unknown as PopulatedTask)}
                      onDelete={task => onDeleteTask?.(task)}
                      isDraggable={canDragTask ? canDragTask(task) : true}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}