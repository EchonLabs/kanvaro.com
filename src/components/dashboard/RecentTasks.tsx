'use client'

import { useEffect, useState } from 'react'
import { formatToTitleCase } from '@/lib/utils'
import { ArrowRight, Calendar, CheckSquare, User } from 'lucide-react'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface RecentTasksProps {
  tasks?: any[]
  isLoading?: boolean
  onTaskUpdate?: () => void
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; dot: string }> = {
  todo:        { color: 'var(--apple-system-gray)',   bg: 'rgba(142,142,147,0.13)', dot: '#8E8E93' },
  in_progress: { color: 'var(--apple-chart-to)',      bg: 'color-mix(in srgb, var(--apple-chart-to) 13%, transparent)', dot: 'var(--apple-chart-to)' },
  review:      { color: 'var(--apple-system-yellow)', bg: 'rgba(255,204,0,0.13)',   dot: '#FFCC00' },
  testing:     { color: 'var(--apple-system-purple)', bg: 'rgba(175,82,222,0.13)',  dot: '#AF52DE' },
  done:        { color: 'var(--apple-system-green)',  bg: 'rgba(52,199,89,0.13)',   dot: '#34C759' },
  cancelled:   { color: 'var(--apple-system-red)',    bg: 'rgba(255,59,48,0.13)',   dot: '#FF3B30' },
}

const PRIORITY_CONFIG: Record<string, { color: string; bg: string }> = {
  critical: { color: 'var(--apple-system-red)',    bg: 'rgba(255,59,48,0.13)' },
  high:     { color: 'var(--apple-system-orange)', bg: 'rgba(255,149,0,0.13)' },
  medium:   { color: 'var(--apple-system-yellow)', bg: 'rgba(255,204,0,0.13)' },
  low:      { color: 'var(--apple-system-green)',  bg: 'rgba(52,199,89,0.13)' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.todo
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: cfg.dot }} />
      {formatToTitleCase(status)}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {formatToTitleCase(priority)}
    </span>
  )
}

export function RecentTasks({ tasks, isLoading }: RecentTasksProps) {
  const router = useRouter()
  const { formatDate } = useDateTime()

  if (isLoading) {
    return (
      <div className="rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--apple-separator)]">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] animate-pulse" />
            <div className="h-4 w-24 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
          </div>
          <div className="h-3.5 w-14 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
        </div>
        <div className="divide-y divide-[var(--apple-separator)]">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <div className="h-3 w-3 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-2/3 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
                <div className="h-2.5 w-1/2 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
              </div>
              <div className="h-5 w-16 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const HeaderBlock = (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--apple-separator)]">
      <div className="flex items-center gap-3">
        <div
          className="h-8 w-8 rounded-[var(--apple-radius-sm)] flex items-center justify-center shrink-0"
          style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 3px 10px var(--apple-chart-glow)' }}
        >
          <CheckSquare className="h-[15px] w-[15px] text-white" strokeWidth={1.8} />
        </div>
        <p className="text-[15px] font-semibold text-[var(--apple-label)]">Recent Tasks</p>
      </div>
      <button
        onClick={() => router.push('/tasks')}
        className="flex items-center gap-1 text-[12px] font-medium apple-transition hover:opacity-70"
        style={{ color: 'var(--apple-chart-to)' }}
      >
        View all <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )

  if (!tasks || tasks.length === 0) {
    return (
      <div className="rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        {HeaderBlock}
        <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
          <div className="h-12 w-12 rounded-2xl bg-[var(--apple-quaternary-fill)] flex items-center justify-center">
            <CheckSquare className="h-6 w-6 text-[var(--apple-tertiary-label)]" strokeWidth={1.3} />
          </div>
          <div className="space-y-0.5">
            <p className="text-[14px] font-semibold text-[var(--apple-label)]">No tasks yet</p>
            <p className="text-[12px] text-[var(--apple-secondary-label)]">Tasks assigned to you will appear here.</p>
          </div>
          <button
            onClick={() => router.push('/tasks/create-new-task')}
            className="mt-1 text-[12px] font-medium apple-transition hover:opacity-70"
            style={{ color: 'var(--apple-chart-to)' }}
          >
            Create a task →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
      {HeaderBlock}

      <div className="divide-y divide-[var(--apple-separator)]">
        {tasks.map((task) => {
          const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.todo
          const isDone = task.status === 'done'

          return (
            <div
              key={task._id}
              className="flex items-start gap-3 px-5 py-3.5 apple-transition hover:bg-[var(--apple-quaternary-fill)] cursor-pointer"
              onClick={() => router.push(`/tasks/${task._id}`)}
            >
              {/* Status dot */}
              <div className="mt-1.5 shrink-0">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: statusCfg.dot }} />
              </div>

              {/* Main content */}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-[13px] font-medium leading-snug truncate',
                    isDone
                      ? 'line-through text-[var(--apple-tertiary-label)]'
                      : 'text-[var(--apple-label)]',
                  )}
                  title={task.title}
                >
                  {task.title}
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {task.project?.name && (
                    <span className="text-[11px] text-[var(--apple-secondary-label)] truncate max-w-[120px]">
                      {task.project.name}
                    </span>
                  )}
                  {task.assignedTo && (
                    <span className="flex items-center gap-1 text-[11px] text-[var(--apple-tertiary-label)]">
                      <User className="h-2.5 w-2.5" />
                      {task.assignedTo.firstName} {task.assignedTo.lastName}
                    </span>
                  )}
                  {task.dueDate && (
                    <span className="flex items-center gap-1 text-[11px] text-[var(--apple-tertiary-label)]">
                      <Calendar className="h-2.5 w-2.5" />
                      {formatDate(task.dueDate)}
                    </span>
                  )}
                </div>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
