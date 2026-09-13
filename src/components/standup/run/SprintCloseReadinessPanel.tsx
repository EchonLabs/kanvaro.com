'use client'

import { standupStrings } from '@/lib/standup/strings'
import { formatMinutesAsHours } from '@/lib/standup/minutes'
import type { OpenTaskReadiness, ProjectedOutcome, CarryForwardDispositionRow } from '@/lib/standup/sprint-close'

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
  will_finish: 'text-[var(--apple-system-green)]',
  at_risk: 'text-[var(--apple-system-orange)]',
  cannot_finish: 'text-[var(--apple-system-red)]'
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
    <section
      id="panel-5-5"
      aria-labelledby="panel-5-5-heading"
      className="scroll-mt-6 flex flex-col gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-system-orange)]/30 bg-[var(--apple-system-orange)]/[0.03] p-4"
    >
      <h3 id="panel-5-5-heading" className="apple-section-label text-[var(--apple-system-orange)]">
        {standupStrings.run.sprintCloseTitle()}
      </h3>

      <div className="overflow-x-auto rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-background">
        <table className="w-full min-w-[36rem] text-[13px]">
          <thead>
            <tr className="border-b border-[var(--apple-separator)] text-left text-[11px] uppercase tracking-wide text-[var(--apple-tertiary-label)]">
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
                <tr key={task.taskId} className="border-b border-[var(--apple-separator)] last:border-0">
                  <td className="py-2 pl-3 pr-2 font-apple-mono text-[12px] text-[var(--apple-label)]">
                    {task.taskKey ?? task.taskId}
                  </td>
                  <td className="py-2 pr-2 text-[12.5px] text-[var(--apple-secondary-label)]">
                    {task.ownerName ?? '—'}
                  </td>
                  <td className="py-2 pr-2 font-apple-mono text-[12.5px] tabular-nums text-[var(--apple-secondary-label)]">
                    {formatMinutesAsHours(task.remainingEstimateMinutes, { locale })}
                  </td>
                  <td className="py-2 pr-2 font-apple-mono text-[12.5px] tabular-nums text-[var(--apple-secondary-label)]">
                    {formatMinutesAsHours(task.hoursAvailableTodayMinutes, { locale })}
                  </td>
                  <td className={`py-2 pr-2 text-[12.5px] font-medium ${OUTCOME_TONE[task.projectedOutcome]}`}>
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
                      className="h-8 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-background px-2 text-[12.5px] text-[var(--apple-label)]"
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
        <div className="rounded-[var(--apple-radius-md)] border border-[var(--apple-system-orange)]/30 bg-[var(--apple-system-orange)]/[0.06] p-3 text-[12.5px]">
          <p className="font-medium text-[var(--apple-label)]">{standupStrings.run.sprintCloseCarryForwardTitle()}</p>
          <ul className="list-disc pl-4 text-[var(--apple-label)]">
            {carryForwardOffenders.map((item) => (
              <li key={item.itemId}>{item.taskKey ?? item.itemId}</li>
            ))}
          </ul>
          <p className="mt-1 text-[var(--apple-secondary-label)]">
            {standupStrings.run.sprintCloseCarryForwardHint()}
          </p>
        </div>
      )}
    </section>
  )
}
