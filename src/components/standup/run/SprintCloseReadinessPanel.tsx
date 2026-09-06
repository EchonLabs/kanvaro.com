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
  will_finish: 'text-emerald-600 dark:text-emerald-400',
  at_risk: 'text-amber-600 dark:text-amber-400',
  cannot_finish: 'text-destructive'
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
      className="flex flex-col gap-3 rounded-md border border-border p-3"
    >
      <h3 id="panel-5-5-heading" className="text-sm font-semibold">
        {standupStrings.run.sprintCloseTitle()}
      </h3>

      <table className="w-full text-sm">
        <tbody>
          {openTasks.map((task) => {
            const labelId = `disposition-label-${task.taskId}`
            return (
              <tr key={task.taskId} className="border-b border-border last:border-0">
                <td className="py-1 pr-2 font-mono text-xs">{task.taskKey ?? task.taskId}</td>
                <td className="py-1 pr-2 text-xs text-muted-foreground">
                  {formatMinutesAsHours(task.remainingEstimateMinutes, { locale })}
                </td>
                <td className={`py-1 pr-2 text-xs ${OUTCOME_TONE[task.projectedOutcome]}`}>
                  {OUTCOME_LABEL[task.projectedOutcome]()}
                </td>
                <td className="py-1">
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
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
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

      {carryForwardOffenders.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
          <p className="font-medium">{standupStrings.run.sprintCloseCarryForwardTitle()}</p>
          <ul className="list-disc pl-4">
            {carryForwardOffenders.map((item) => (
              <li key={item.itemId}>{item.taskKey ?? item.itemId}</li>
            ))}
          </ul>
          <p className="mt-1 text-muted-foreground">
            {standupStrings.run.sprintCloseCarryForwardHint()}
          </p>
        </div>
      )}
    </section>
  )
}
