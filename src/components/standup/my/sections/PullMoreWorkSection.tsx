'use client'

import { Button } from '@/components/ui/Button'
import { HoursValue } from '../shared/HoursValue'
import { SectionCard } from '../shared/SectionCard'
import { standupStrings } from '@/lib/standup/strings'
import type { MyStandupPoolTask } from '../MyStandupScreen'

export interface PullMoreWorkSectionProps {
  poolTasks: readonly MyStandupPoolTask[]
  allowSelfSelect: boolean
  hasGap: boolean
  disabled: boolean
  onAdd: (taskId: string) => void
  locale?: string
}

/** Only rendered with something to close — a pool shown against a full day is noise, not information (design §4.8). */
export function PullMoreWorkSection({ poolTasks, allowSelfSelect, hasGap, disabled, onAdd, locale }: PullMoreWorkSectionProps) {
  if (!allowSelfSelect || !hasGap || poolTasks.length === 0) return null

  return (
    <SectionCard title={standupStrings.pool.title()}>
      <p className="text-[13px] text-[var(--apple-secondary-label)]">
        {standupStrings.my.selfSelectHint()}
      </p>
      <ul className="flex flex-col gap-2">
        {poolTasks.map((task) => (
          <li key={task.taskId}>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onAdd(task.taskId)}
              className="w-full justify-between"
            >
              <span>{standupStrings.my.addTask({ key: task.key ?? task.taskId })} — {task.title}</span>
              <HoursValue minutes={task.remainingEstimateMinutes} locale={locale} />
            </Button>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
