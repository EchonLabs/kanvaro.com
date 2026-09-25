'use client'

import { CheckSquare, Square } from 'lucide-react'
import { HourStepper } from '@/components/standup/primitives/HourStepper'
import { Tag } from '../shared/Tag'
import { TaskTitle } from '../shared/TaskTitle'
import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import type { CapacityBreakdown } from '@/lib/standup/capacity'
import type { BoardAllocationView } from '@/components/standup/run/CapacityBoard'

const SOURCE_LABEL: Record<string, () => string> = {
  carried_forward: standupStrings.my.sourceCarried,
  pre_assigned: standupStrings.my.sourcePreAssigned,
  assigned_in_standup: standupStrings.my.sourceAssignedInStandup,
  self_selected: standupStrings.my.sourceSelfSelected,
  auto_prefilled: standupStrings.my.sourceAutoPrefilled
}

export interface TodaysPlanSectionProps {
  allocations: readonly BoardAllocationView[]
  /** Drives the "N tasks planned • Xh surplus available" line. */
  capacity: Pick<CapacityBreakdown, 'gapMinutes'>
  readOnly: boolean
  onChangeHours: (allocationId: string, plannedMinutes: Minutes) => void
  locale?: string
  /** The pull-more-work card, which the design nests at the foot of the plan. */
  children?: React.ReactNode
}

function summaryFor(count: number, gapMinutes: number, locale?: string): string {
  const hours = (m: number) => formatMinutesAsHours(m as any, { locale })
  const tail =
    gapMinutes > 0
      ? standupStrings.my.gapAvailable({ hours: hours(gapMinutes) })
      : gapMinutes < 0
        ? standupStrings.my.overCapacity({ hours: hours(Math.abs(gapMinutes)) })
        : standupStrings.my.fullyPlanned()
  return `${standupStrings.my.tasksPlanned({ count })} • ${tail}`
}

/**
 * Step 2's "Today's Plan" card — each allocation with where it came from and
 * its planned hours, editable while the stand-up is Ready and with the lock
 * reason stated (not a silent disable) once it is not.
 */
export function TodaysPlanSection({
  allocations,
  capacity,
  readOnly,
  onChangeHours,
  locale,
  children
}: TodaysPlanSectionProps) {
  return (
    <div className="flex w-full flex-col gap-4 rounded-xl border border-[var(--my-border)] bg-[var(--my-canvas)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-[16px] font-semibold text-[var(--my-text)]">
            {standupStrings.my.todayPlanTitle()}
          </h3>
          <p className="text-[13px] text-[var(--my-muted)]">
            {summaryFor(allocations.length, capacity.gapMinutes, locale)}
          </p>
        </div>
        {readOnly ? (
          <Tag tone="neutral">{standupStrings.my.stateLocked()}</Tag>
        ) : (
          <Tag tone="blue">{standupStrings.my.stateEditing()}</Tag>
        )}
      </div>

      {readOnly && allocations.length > 0 ? (
        <p className="text-[13px] text-[var(--my-muted)]">{standupStrings.my.lockedReason()}</p>
      ) : null}

      {allocations.length === 0 ? (
        <p className="text-[14px] text-[var(--my-muted)]">{standupStrings.my.todayEmpty()}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {allocations.map((row) => {
            const detail = [SOURCE_LABEL[row.source]?.(), row.note].filter(Boolean).join(' • ')
            return (
              <li
                key={row.allocationId}
                className="group flex flex-wrap items-center gap-4 rounded-lg border border-[var(--my-border)] bg-[var(--my-canvas)] p-4 focus-within:border-[var(--my-blue)] sm:flex-nowrap"
              >
                {/* The row being edited is the one the design ticks and outlines in blue. */}
                <Square
                  className="h-4 w-4 shrink-0 text-[var(--my-subtle)] group-focus-within:hidden"
                  strokeWidth={2}
                  aria-hidden
                />
                <CheckSquare
                  className="hidden h-4 w-4 shrink-0 text-[var(--my-blue)] group-focus-within:block"
                  strokeWidth={2}
                  aria-hidden
                />

                <div className="flex min-w-[12rem] flex-1 flex-col gap-0.5">
                  <TaskTitle taskKey={row.taskKey} title={row.title} className="whitespace-normal" />
                  {detail ? (
                    <p className="text-[12px] text-[var(--my-muted)] first-letter:uppercase">{detail}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[13px] text-[var(--my-subtle)] group-focus-within:text-[var(--my-muted)]">
                    {standupStrings.my.allocatedLabel()}
                  </span>
                  <label className="flex items-center rounded-[4px] border border-[var(--my-border)] bg-[var(--my-inset)] px-2.5 py-1.5 group-focus-within:border-[var(--my-blue)]">
                    <HourStepper
                      variant="bare"
                      taskLabel={row.title}
                      valueMinutes={row.plannedMinutes}
                      onChange={(next) => onChangeHours(row.allocationId, next)}
                      disabled={readOnly}
                      locale={locale}
                      inputClassName="my-mono w-10 bg-transparent text-right text-[13px] text-[var(--my-muted)] outline-none [appearance:textfield] focus:font-bold focus:text-[var(--my-blue)] disabled:cursor-not-allowed [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="my-mono text-[13px] text-[var(--my-muted)] group-focus-within:font-bold group-focus-within:text-[var(--my-blue)]">
                      h
                    </span>
                  </label>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {children}
    </div>
  )
}
