'use client'

import { Info } from 'lucide-react'
import { Emphasize } from '../shared/Emphasize'
import { TaskTitle } from '../shared/TaskTitle'
import { formatMinutesAsHours } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'
import type { MyStandupPoolTask } from '../MyStandupScreen'

export interface PullMoreWorkSectionProps {
  poolTasks: readonly MyStandupPoolTask[]
  allowSelfSelect: boolean
  /** Today's unplanned capacity. Nothing renders without some; a task bigger than it is shown but marked Over Limit. */
  gapMinutes: number
  disabled: boolean
  onAdd: (taskId: string) => void
  locale?: string
}

/**
 * The pull-work card nested in Today's Plan (ALO-23). Only rendered with a gap
 * to close — a pool shown against a full day is noise, not information.
 */
export function PullMoreWorkSection({
  poolTasks,
  allowSelfSelect,
  gapMinutes,
  disabled,
  onAdd,
  locale
}: PullMoreWorkSectionProps) {
  if (!allowSelfSelect || gapMinutes <= 0 || poolTasks.length === 0) return null

  const hours = (m: number) => formatMinutesAsHours(m as any, { locale })
  const spare = hours(gapMinutes)

  return (
    <div className="flex w-full flex-col gap-3 rounded-[10px] border border-[var(--my-border)] bg-[var(--my-inset)] p-4">
      <div className="flex items-start gap-2.5 rounded-lg bg-[var(--my-blue-tint)] px-3.5 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--my-blue)]" strokeWidth={2} aria-hidden />
        <p className="text-[13px] text-[var(--my-text)]">
          <Emphasize
            text={standupStrings.my.spareCapacity({ hours: spare })}
            phrase={standupStrings.my.spareCapacityPhrase({ hours: spare })}
            className="font-semibold"
          />{' '}
          {standupStrings.my.selfSelectHint()}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {poolTasks.map((task) => {
          const overLimit = task.remainingEstimateMinutes > gapMinutes
          const meta = [
            standupStrings.my.estimated({ hours: hours(task.remainingEstimateMinutes) }),
            task.priority ? standupStrings.my.priority({ priority: capitalise(task.priority) }) : null
          ]
            .filter(Boolean)
            .join(' • ')
          return (
            <li
              key={task.taskId}
              className={cn(
                'flex items-center gap-3 rounded-lg border border-[var(--my-border)] bg-[var(--my-canvas)] p-3',
                overLimit && 'opacity-40'
              )}
            >
              <button
                type="button"
                aria-label={standupStrings.my.addTask({ key: task.key ?? task.taskId })}
                disabled={disabled || overLimit}
                onClick={() => onAdd(task.taskId)}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[12px]',
                  overLimit
                    ? 'cursor-not-allowed border-[var(--my-border)] bg-[var(--my-raised)] text-[var(--my-subtle)]'
                    : 'border-[var(--my-blue)] bg-[var(--my-blue-tint)] font-semibold text-[var(--my-blue)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
                )}
              >
                {overLimit ? standupStrings.my.overLimit() : standupStrings.my.pullTask()}
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <TaskTitle
                  taskKey={task.key}
                  title={task.title}
                  className={overLimit ? 'text-[var(--my-muted)]' : undefined}
                />
                <p className={cn('text-[12px]', overLimit ? 'text-[var(--my-subtle)]' : 'text-[var(--my-muted)]')}>
                  {meta}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
