'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { formatToTitleCase } from '@/lib/utils'
import { Calendar, User, ArrowRight, CheckSquare } from 'lucide-react'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface RecentTasksProps {
  tasks?: any[]
  isLoading?: boolean
  onTaskUpdate?: () => void
}

/* Apple HIG semantic status styles */
const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  todo:        { bg: 'bg-[var(--apple-system-gray)]/12',    text: 'text-[var(--apple-system-gray)]' },
  in_progress: { bg: 'bg-[var(--apple-system-blue)]/12',   text: 'text-[var(--apple-system-blue)]' },
  review:      { bg: 'bg-[var(--apple-system-yellow)]/15', text: 'text-[var(--apple-system-yellow)]' },
  testing:     { bg: 'bg-[var(--apple-system-purple)]/12', text: 'text-[var(--apple-system-purple)]' },
  done:        { bg: 'bg-[var(--apple-system-green)]/12',  text: 'text-[var(--apple-system-green)]' },
  cancelled:   { bg: 'bg-[var(--apple-system-red)]/12',    text: 'text-[var(--apple-system-red)]' },
}

const PRIORITY_STYLES: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-[var(--apple-system-red)]/12',    text: 'text-[var(--apple-system-red)]' },
  high:     { bg: 'bg-[var(--apple-system-orange)]/12', text: 'text-[var(--apple-system-orange)]' },
  medium:   { bg: 'bg-[var(--apple-system-yellow)]/15', text: 'text-[var(--apple-system-yellow)]' },
  low:      { bg: 'bg-[var(--apple-system-green)]/12',  text: 'text-[var(--apple-system-green)]' },
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.todo
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-[var(--apple-radius-pill)] text-xs font-medium whitespace-nowrap',
      style.bg, style.text
    )}>
      {formatToTitleCase(status)}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const style = PRIORITY_STYLES[priority] || PRIORITY_STYLES.medium
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-[var(--apple-radius-pill)] text-xs font-medium whitespace-nowrap',
      style.bg, style.text
    )}>
      {formatToTitleCase(priority)}
    </span>
  )
}

export function RecentTasks({ tasks, isLoading, onTaskUpdate }: RecentTasksProps) {
  const router = useRouter()
  const { formatDate } = useDateTime()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="h-4 w-28 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
            <div className="h-4 w-16 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <div className="h-4 w-40 bg-[var(--apple-tertiary-fill)] rounded animate-pulse flex-1" />
                <div className="h-5 w-16 bg-[var(--apple-tertiary-fill)] rounded-full animate-pulse" />
                <div className="h-5 w-14 bg-[var(--apple-tertiary-fill)] rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!tasks || tasks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Tasks</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => router.push('/tasks')}>
              View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-10">
            <CheckSquare className="h-8 w-8 text-[var(--apple-tertiary-label)] mx-auto mb-3" />
            <p className="text-sm text-[var(--apple-secondary-label)] mb-4">No tasks found</p>
            <Button variant="default" size="sm" onClick={() => router.push('/tasks/create-new-task')}>
              Create Your First Task
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-x-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Tasks</CardTitle>
          <button
            onClick={() => router.push('/tasks')}
            className="text-[15px] text-[var(--apple-system-blue)] hover:opacity-80 apple-transition flex items-center gap-1"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-0 -mx-1 px-1">
          {tasks.map((task) => (
            <div
              key={task._id}
              className="flex items-start sm:items-center gap-3 px-3 py-2.5 rounded-[var(--apple-radius-md)] hover:bg-[var(--apple-quaternary-fill)] apple-transition cursor-pointer overflow-x-hidden"
              onClick={() => router.push(`/tasks/${task._id}`)}
            >
              <div className="flex-1 min-w-0">
                {/* Task title + badges row */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 min-w-0">
                  <h4
                    className={cn(
                      'text-[15px] font-medium truncate min-w-0',
                      task.status === 'done'
                        ? 'line-through text-[var(--apple-tertiary-label)]'
                        : 'text-[var(--apple-label)]'
                    )}
                    title={task.title}
                  >
                    {task.title}
                  </h4>
                  <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                    <StatusBadge status={task.status} />
                    <PriorityBadge priority={task.priority} />
                  </div>
                </div>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-2 mt-1 text-[13px] text-[var(--apple-secondary-label)]">
                  <span className="font-medium truncate" title={task.project?.name}>
                    {task.project?.name || 'No Project'}
                  </span>
                  {task.assignedTo && (
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <User className="h-3 w-3 flex-shrink-0" />
                      <span>{task.assignedTo.firstName} {task.assignedTo.lastName}</span>
                    </div>
                  )}
                  {task.dueDate && (
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <Calendar className="h-3 w-3 flex-shrink-0" />
                      <span>{formatDate(task.dueDate)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
