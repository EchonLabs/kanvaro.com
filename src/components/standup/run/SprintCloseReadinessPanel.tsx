'use client'

import { standupStrings } from '@/lib/standup/strings'
import { formatMinutesAsHours } from '@/lib/standup/minutes'
import type { OpenTaskReadiness, ProjectedOutcome, CarryForwardDispositionRow } from '@/lib/standup/sprint-close'
import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'

import { PLAN_SCROLL_MAX, PlanBanner, PlanCard, PlanCount, planFieldClass } from '../planning/ui'

/**
 * §15.8.11 — the panel inserted between Panel 5 and Panel 6 on the sprint's
 * final day. Enforces CC-8 (every open task dispositioned) and surfaces
 * CFW-9's offenders (every open carry-forward item resolved) as a pointer
 * back to Panel 4, which already owns that write path (P11-2).
 */

const DISPOSITION_TYPES = [
  'finish_today',
  'descope',
  'move_to_next_sprint',
  'split_and_move_remainder'
] as const
type DispositionType = typeof DISPOSITION_TYPES[number]

const DISPOSITION_LABEL: Record<DispositionType, () => string> = {
  finish_today: standupStrings.run.sprintCloseDispositionFinishToday,
  descope: standupStrings.run.sprintCloseDispositionDescope,
  move_to_next_sprint: standupStrings.run.sprintCloseDispositionMoveToNextSprint,
  split_and_move_remainder: standupStrings.run.sprintCloseDispositionSplitAndMoveRemainder
}

const OUTCOME_LABEL: Record<ProjectedOutcome, () => string> = {
  will_finish: standupStrings.run.sprintCloseOutcomeWillFinish,
  at_risk: standupStrings.run.sprintCloseOutcomeAtRisk,
  cannot_finish: standupStrings.run.sprintCloseOutcomeCannotFinish
}

const OUTCOME_TONE: Record<ProjectedOutcome, string> = {
  will_finish: 'text-[var(--plan-success)]',
  at_risk: 'text-[var(--plan-warning)]',
  cannot_finish: 'text-[var(--plan-danger)]'
}

export interface SprintCloseReadinessPanelProps {
  openTasks: readonly OpenTaskReadiness[]
  carryForwardOffenders: readonly CarryForwardDispositionRow[]
  onSetDisposition: (taskId: string, type: DispositionType) => void
  disabled?: boolean
  locale?: string
}

export function SprintCloseReadinessPanel({
  openTasks,
  carryForwardOffenders,
  onSetDisposition,
  disabled = false,
  locale
}: SprintCloseReadinessPanelProps) {
  return (
    <PlanCard
      id="panel-5-5"
      aria-labelledby="panel-5-5-heading"
      title={standupStrings.run.sprintCloseTitle()}
      headingLevel="h3"
      headingId="panel-5-5-heading"
      // `color-mix()` rather than the `/N` opacity modifier: in Tailwind 3 an
      // alpha modifier on a `var()` colour emits no CSS at all, so the panel
      // would have neither tint nor warning border. Same precedent as the
      // note in WorkingCalendarSettings.tsx. The `color:` type hint is
      // required too: without it tailwind-merge reads the border as a WIDTH
      // and drops the card's `border` class (no border at all), and keeps the
      // card's surface fill, which then wins the cascade over the tint.
      className="border-[color:color-mix(in_srgb,var(--plan-warning)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--plan-warning)_6%,transparent)]"
      aside={
        <PlanCount
          count={openTasks.length}
          label={standupStrings.run.sprintCloseIssueCount({ count: openTasks.length })}
        />
      }
    >

      {/* On the final day this table is every task still open in the sprint, so
          it is the one panel whose length is bounded by nothing at all. It keeps
          its horizontal scroll (six columns on a narrow window) and gains a
          vertical one. */}
      <div className={cn(
        'overflow-x-auto rounded-[var(--apple-radius-md)] border border-[var(--plan-border)] bg-[var(--plan-surface)]',
        'plan-scroll',
        PLAN_SCROLL_MAX
      )}>
        <table className="w-full min-w-[36rem] apple-type-subheadline">
          <thead>
            <tr className="border-b border-[var(--plan-border)] text-left apple-type-caption uppercase tracking-wide text-[var(--plan-muted)]">
              <th className="py-2 pl-3 pr-2 font-medium">Task</th>
              <th className="py-2 pr-2 font-medium">Owner</th>
              <th className="py-2 pr-2 font-medium">Remaining</th>
              <th className="py-2 pr-2 font-medium">Available today</th>
              <th className="py-2 pr-2 font-medium">Outcome</th>
              <th className="py-2 pr-3 font-medium">Disposition</th>
            </tr>
          </thead>
          <tbody>
            {openTasks.map((task) => {
              const labelId = `disposition-label-${task.taskId}`
              return (
                <tr key={task.taskId} className="border-b border-[var(--plan-border)] last:border-0">
                  <td className="py-2 pl-3 pr-2 font-apple-mono apple-type-caption text-[var(--plan-text)]">
                    {task.taskKey ?? task.taskId}
                  </td>
                  <td className="py-2 pr-2 apple-type-subheadline text-[var(--plan-secondary)]">
                    {task.ownerName ?? '—'}
                  </td>
                  <td className="py-2 pr-2 font-apple-mono apple-type-subheadline tabular-nums text-[var(--plan-secondary)]">
                    {formatMinutesAsHours(task.remainingEstimateMinutes, { locale })}
                  </td>
                  <td className="py-2 pr-2 font-apple-mono apple-type-subheadline tabular-nums text-[var(--plan-secondary)]">
                    {formatMinutesAsHours(task.hoursAvailableTodayMinutes, { locale })}
                  </td>
                  <td className={`py-2 pr-2 apple-type-subheadline font-medium ${OUTCOME_TONE[task.projectedOutcome]}`}>
                    {OUTCOME_LABEL[task.projectedOutcome]()}
                  </td>
                  <td className="py-2 pr-3">
                    <label id={labelId} className="sr-only">
                      {standupStrings.run.sprintCloseDispositionFor({ key: task.taskKey ?? task.taskId })}
                    </label>
                    <select
                      aria-labelledby={labelId}
                      aria-label={standupStrings.run.sprintCloseDispositionFor({
                        key: task.taskKey ?? task.taskId
                      })}
                      value={task.disposition ?? ''}
                      disabled={disabled}
                      onChange={(event) =>
                        onSetDisposition(task.taskId, event.target.value as DispositionType)
                      }
                      className={planFieldClass}
                    >
                      <option value="" disabled>
                        {standupStrings.run.sprintCloseNoDisposition()}
                      </option>
                      {DISPOSITION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {DISPOSITION_LABEL[type]()}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {carryForwardOffenders.length > 0 && (
        <PlanBanner tone="warning" bordered role="presentation" icon={<AlertTriangle strokeWidth={2} />}>
          <p className="font-medium text-[var(--plan-text)]">{standupStrings.run.sprintCloseCarryForwardTitle()}</p>
          <ul className="list-disc pl-4 text-[var(--plan-text)]">
            {carryForwardOffenders.map((item) => (
              <li key={item.itemId}>{item.taskKey ?? item.itemId}</li>
            ))}
          </ul>
          <p className="mt-1 text-[var(--plan-secondary)]">
            {standupStrings.run.sprintCloseCarryForwardHint()}
          </p>
        </PlanBanner>
      )}
    </PlanCard>
  )
}
