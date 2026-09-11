'use client'

import { PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { HoursValue } from '../shared/HoursValue'
import { IconChip } from '../shared/IconChip'
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
    <SectionCard title={standupStrings.pool.title()} icon={<PlusCircle strokeWidth={1.75} />} tone="blue">
      <p className="text-[13px] text-[var(--apple-secondary-label)]">
        {standupStrings.my.selfSelectHint()}
      </p>
      <ul className="flex flex-col gap-2">
        {poolTasks.map((task) => (
          <li key={task.taskId}>
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => onAdd(task.taskId)}
              className="h-auto w-full items-center justify-start gap-3 rounded-[var(--apple-radius-sm)] p-3 text-left font-normal hover:border-[var(--apple-system-blue)]/40 hover:bg-[var(--apple-system-blue)]/5"
            >
              <IconChip icon={<PlusCircle strokeWidth={1.75} />} tone="blue" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-medium text-[var(--apple-label)]">
                  {task.title}
                </span>
                <span className="font-apple-mono text-[13px] text-[var(--apple-tertiary-label)]">
                  {standupStrings.my.addTask({ key: task.key ?? task.taskId })}
                </span>
              </span>
              <HoursValue minutes={task.remainingEstimateMinutes} locale={locale} />
            </Button>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
