'use client'

import { useMemo, useState } from 'react'

import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import type { VarianceOutcome } from '@/models/AllocationVariance'

/**
 * Panel 3 — variance and estimate debt (§15.8.5).
 *
 * The panel exists to make two conversations unavoidable, and its layout is the
 * argument:
 *
 * **All four numbers, always, side by side** (VAR-11). Planned, logged, day
 * variance on the first line; original estimate, total logged, task variance on
 * the second. Showing fewer lets the day's conversation ("you spent eight hours
 * on a six-hour plan") be mistaken for the sprint's ("this task has cost eleven
 * against a six-hour estimate"), and §12.1 exists because they are different
 * problems with different answers.
 *
 * **Colour never carries meaning alone** (VAR-12, NFR-A2). Over is red *and
 * says "over"*; under is blue *and says "under"* — and blue deliberately, not
 * green, because finishing early is information, not automatically good.
 *
 * A chronic spill is pinned to the top whatever the sort (VAR-14): it is the
 * row a PM is most likely to scroll past and least able to afford to.
 */

export interface VariancePanelRow {
  allocationId: string
  taskId: string
  taskKey?: string
  title: string
  memberId: string
  memberName: string
  outcome: VarianceOutcome
  plannedMinutes: Minutes
  loggedMinutesOnDay: Minutes
  dayVarianceMinutes: Minutes
  originalEstimateMinutes: Minutes
  totalLoggedMinutesOnTask: Minutes
  taskVarianceMinutes: Minutes
  requiresRevision: boolean
  requiresReason: boolean
  revisedRemainingMinutes?: Minutes
  notStartedReason?: string
  spillChainLength: number
  chronicSpill: boolean
  explanation: string
}

export interface VariancePanelMember {
  memberId: string
  memberName: string
  plannedMinutes: Minutes
  loggedMinutesOnDay: Minutes
  dayVarianceMinutes: Minutes
  outstandingDebtMinutes: Minutes
  surplusMinutes: Minutes
  needingRevision: number
}

export type VarianceSort = 'member' | 'task_key' | 'day_variance'

export interface VariancePanelProps {
  data: { rows: VariancePanelRow[]; members: VariancePanelMember[] }
  onRevise: (row: VariancePanelRow) => void
  onGiveReason: (row: VariancePanelRow) => void
  onViewLedger: (memberId: string) => void
  disabled?: boolean
  locale?: string
}

export function VariancePanel({
  data,
  onRevise,
  onGiveReason,
  onViewLedger,
  disabled = false,
  locale
}: VariancePanelProps) {
  const [sort, setSort] = useState<VarianceSort>('member')

  const rows = useMemo(() => sortRows(data.rows, sort), [data.rows, sort])

  return (
    <section id="panel-3" aria-labelledby="panel-3-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="panel-3-heading" className="text-sm font-semibold">
          {standupStrings.run.panel3()}
        </h3>

        <label className="flex items-center gap-2 text-xs" htmlFor="variance-sort">
          Sort
          <select
            id="variance-sort"
            aria-label="Sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as VarianceSort)}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="member">Member</option>
            <option value="task_key">Task</option>
            <option value="day_variance">Day variance</option>
          </select>
        </label>
      </div>

      {/* VAR-13 — the member roll-up strip. */}
      <ul className="flex flex-wrap gap-3">
        {data.members.map((member) => (
          <li
            key={member.memberId}
            data-testid={`variance-rollup-${member.memberId}`}
            className="flex flex-col gap-0.5 rounded-md border border-border px-3 py-2 text-xs"
          >
            <span className="font-medium">{member.memberName}</span>
            <span>
              {standupStrings.variance.rollUpPlanned()}{' '}
              <span data-testid="planned-total">
                {formatMinutesAsHours(member.plannedMinutes, { locale })}
              </span>
            </span>
            <span>
              {standupStrings.variance.rollUpLogged()}{' '}
              <span data-testid="logged-total">
                {formatMinutesAsHours(member.loggedMinutesOnDay, { locale })}
              </span>
            </span>
            <span>
              {standupStrings.variance.rollUpDayVariance()}{' '}
              <span data-testid="net-day-variance">
                {formatMinutesAsHours(member.dayVarianceMinutes, { locale, signed: true })}
              </span>
            </span>
            <span data-testid="outstanding-debt">
              {member.surplusMinutes > 0
                ? standupStrings.variance.surplus({ minutes: member.surplusMinutes, locale })
                : `${standupStrings.variance.rollUpDebt()} ${formatMinutesAsHours(
                    member.outstandingDebtMinutes,
                    { locale }
                  )}`}
            </span>
            <span data-testid="needing-revision">
              {standupStrings.variance.rollUpNeedingRevision({ count: member.needingRevision })}
            </span>

            <button
              type="button"
              onClick={() => onViewLedger(member.memberId)}
              className="self-start text-xs underline"
            >
              {standupStrings.debt.ledgerTitle()}
            </button>
          </li>
        ))}
      </ul>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const tone = toneOf(row)
          return (
            <li
              key={row.allocationId}
              data-testid={`variance-row-${row.taskKey ?? row.taskId}`}
              className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{row.taskKey ?? row.taskId}</span>
                <span className="text-muted-foreground">{row.title}</span>
                <span className="text-xs text-muted-foreground">{row.memberName}</span>

                {row.chronicSpill && (
                  <span
                    data-testid="chronic-spill"
                    className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-900 dark:bg-red-900/30 dark:text-red-200"
                  >
                    {standupStrings.variance.chronicSpill({ chainLength: row.spillChainLength })}
                  </span>
                )}
              </div>

              {/* VAR-11, first line: the day. */}
              <div className="flex flex-wrap gap-3 text-xs">
                <span data-testid="planned">
                  Planned {formatMinutesAsHours(row.plannedMinutes, { locale })}
                </span>
                <span data-testid="logged">
                  Logged {formatMinutesAsHours(row.loggedMinutesOnDay, { locale })}
                </span>
                <span
                  data-testid={`day-variance-${tone}`}
                  className={TONE_CLASS[tone]}
                  // NFR-A2: the word is part of the content, not a tooltip.
                >
                  {formatMinutesAsHours(row.dayVarianceMinutes, { locale, signed: true })}{' '}
                  {TONE_WORD[tone]()}
                </span>
              </div>

              {/* VAR-11, second line: the task. */}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span data-testid="original-estimate">
                  Original estimate {formatMinutesAsHours(row.originalEstimateMinutes, { locale })}
                </span>
                <span data-testid="total-logged">
                  Total logged {formatMinutesAsHours(row.totalLoggedMinutesOnTask, { locale })}
                </span>
                <span data-testid="task-variance">
                  {formatMinutesAsHours(row.taskVarianceMinutes, { locale, signed: true })} against
                  estimate
                </span>
              </div>

              <p data-testid={`variance-explanation-${row.taskKey ?? row.taskId}`} className="text-xs">
                {row.explanation}
              </p>

              {row.requiresRevision && row.revisedRemainingMinutes === undefined && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRevise(row)}
                  aria-label={`Revise ${row.taskKey ?? row.taskId}`}
                  className="self-start rounded-md border border-border px-2 py-1 text-xs"
                >
                  {standupStrings.variance.reviseTitle()}
                </button>
              )}

              {row.requiresReason && !row.notStartedReason && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onGiveReason(row)}
                  aria-label={`Give a reason for ${row.taskKey ?? row.taskId}`}
                  className="self-start rounded-md border border-border px-2 py-1 text-xs"
                >
                  Give a reason
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

type Tone = 'over' | 'under' | 'on-estimate' | 'not-started'

const TONE_WORD: Record<Tone, () => string> = {
  over: standupStrings.variance.labelOver,
  under: standupStrings.variance.labelUnder,
  'on-estimate': standupStrings.variance.labelOnEstimate,
  'not-started': standupStrings.variance.labelNotStarted
}

/** VAR-12's palette. Under is blue — informational, not "good". */
const TONE_CLASS: Record<Tone, string> = {
  over: 'text-red-700 dark:text-red-300',
  under: 'text-blue-700 dark:text-blue-300',
  'on-estimate': 'text-green-700 dark:text-green-300',
  'not-started': 'text-muted-foreground'
}

function toneOf(row: VariancePanelRow): Tone {
  if (row.outcome === 'not_started') return 'not-started'
  if (row.dayVarianceMinutes > 0) return 'over'
  if (row.dayVarianceMinutes < 0) return 'under'
  return 'on-estimate'
}

function sortRows(rows: VariancePanelRow[], sort: VarianceSort): VariancePanelRow[] {
  const compare = (a: VariancePanelRow, b: VariancePanelRow) => {
    if (sort === 'task_key') return (a.taskKey ?? '').localeCompare(b.taskKey ?? '')
    if (sort === 'day_variance') return b.dayVarianceMinutes - a.dayVarianceMinutes
    return a.memberName.localeCompare(b.memberName)
  }

  return [...rows].sort((a, b) => {
    // VAR-14: pinned above the sort, not sorted within it.
    if (a.chronicSpill !== b.chronicSpill) return a.chronicSpill ? -1 : 1
    return compare(a, b)
  })
}
