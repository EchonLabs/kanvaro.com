'use client'

import { useMemo, useState } from 'react'

import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'
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
    <section
      id="panel-3"
      aria-labelledby="panel-3-heading"
      className="scroll-mt-6 flex flex-col gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="panel-3-heading" className="apple-section-label text-[var(--apple-tertiary-label)]">
          {standupStrings.run.panel3()}
        </h3>

        <label className="flex items-center gap-2 text-[12px] text-[var(--apple-secondary-label)]" htmlFor="variance-sort">
          Sort
          <select
            id="variance-sort"
            aria-label="Sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as VarianceSort)}
            className="h-8 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-background px-2 text-[12.5px] text-[var(--apple-label)]"
          >
            <option value="member">Member</option>
            <option value="task_key">Task</option>
            <option value="day_variance">Day variance</option>
          </select>
        </label>
      </div>

      {/* VAR-13 — the member roll-up strip. */}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.members.map((member) => (
          <li
            key={member.memberId}
            data-testid={`variance-rollup-${member.memberId}`}
            className="flex flex-col gap-1 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-background px-3 py-2.5 text-[12px] text-[var(--apple-secondary-label)]"
          >
            <span className="text-[13px] font-medium text-[var(--apple-label)]">{member.memberName}</span>
            <span>
              {standupStrings.variance.rollUpPlanned()}{' '}
              <span data-testid="planned-total" className="font-apple-mono tabular-nums text-[var(--apple-label)]">
                {formatMinutesAsHours(member.plannedMinutes, { locale })}
              </span>
            </span>
            <span>
              {standupStrings.variance.rollUpLogged()}{' '}
              <span data-testid="logged-total" className="font-apple-mono tabular-nums text-[var(--apple-label)]">
                {formatMinutesAsHours(member.loggedMinutesOnDay, { locale })}
              </span>
            </span>
            <span>
              {standupStrings.variance.rollUpDayVariance()}{' '}
              <span data-testid="net-day-variance" className="font-apple-mono tabular-nums text-[var(--apple-label)]">
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
              className="apple-transition self-start text-[11.5px] font-medium text-[var(--apple-system-blue)] hover:underline"
            >
              {standupStrings.debt.ledgerTitle()}
            </button>
          </li>
        ))}
      </ul>

      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => {
          const tone = toneOf(row)
          return (
            <li
              key={row.allocationId}
              data-testid={`variance-row-${row.taskKey ?? row.taskId}`}
              className="flex flex-col gap-1.5 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-background px-3 py-2.5 text-[13px]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-apple-mono text-[12px] text-[var(--apple-tertiary-label)]">
                  {row.taskKey ?? row.taskId}
                </span>
                <span className="min-w-0 flex-1 truncate text-[var(--apple-label)]">{row.title}</span>
                <span className="text-[11.5px] text-[var(--apple-secondary-label)]">{row.memberName}</span>

                {row.chronicSpill && (
                  <span
                    data-testid="chronic-spill"
                    className="rounded-full bg-[var(--apple-system-red)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--apple-system-red)]"
                  >
                    {standupStrings.variance.chronicSpill({ chainLength: row.spillChainLength })}
                  </span>
                )}
              </div>

              {/* VAR-11, first line: the day. */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--apple-secondary-label)]">
                <span data-testid="planned">
                  Planned <span className="font-apple-mono tabular-nums text-[var(--apple-label)]">{formatMinutesAsHours(row.plannedMinutes, { locale })}</span>
                </span>
                <span data-testid="logged">
                  Logged <span className="font-apple-mono tabular-nums text-[var(--apple-label)]">{formatMinutesAsHours(row.loggedMinutesOnDay, { locale })}</span>
                </span>
                <span
                  data-testid={`day-variance-${tone}`}
                  className={cn('font-apple-mono font-medium tabular-nums', TONE_CLASS[tone])}
                  // NFR-A2: the word is part of the content, not a tooltip.
                >
                  {formatMinutesAsHours(row.dayVarianceMinutes, { locale, signed: true })}{' '}
                  {TONE_WORD[tone]()}
                </span>
              </div>

              {/* VAR-11, second line: the task. */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--apple-tertiary-label)]">
                <span data-testid="original-estimate">
                  Original estimate{' '}
                  <span className="font-apple-mono tabular-nums">{formatMinutesAsHours(row.originalEstimateMinutes, { locale })}</span>
                </span>
                <span data-testid="total-logged">
                  Total logged{' '}
                  <span className="font-apple-mono tabular-nums">{formatMinutesAsHours(row.totalLoggedMinutesOnTask, { locale })}</span>
                </span>
                <span data-testid="task-variance">
                  <span className="font-apple-mono tabular-nums">{formatMinutesAsHours(row.taskVarianceMinutes, { locale, signed: true })}</span>{' '}
                  against estimate
                </span>
              </div>

              <p data-testid={`variance-explanation-${row.taskKey ?? row.taskId}`} className="text-[11.5px] text-[var(--apple-secondary-label)]">
                {row.explanation}
              </p>

              {(row.requiresRevision && row.revisedRemainingMinutes === undefined) ||
              (row.requiresReason && !row.notStartedReason) ? (
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {row.requiresRevision && row.revisedRemainingMinutes === undefined && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onRevise(row)}
                      aria-label={`Revise ${row.taskKey ?? row.taskId}`}
                      className="apple-transition rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] px-2.5 py-1 text-[11.5px] font-medium hover:bg-[var(--apple-quaternary-fill)] disabled:opacity-40"
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
                      className="apple-transition rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] px-2.5 py-1 text-[11.5px] font-medium hover:bg-[var(--apple-quaternary-fill)] disabled:opacity-40"
                    >
                      Give a reason
                    </button>
                  )}
                </div>
              ) : null}
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
  over: 'text-[var(--apple-system-red)]',
  under: 'text-[var(--apple-system-blue)]',
  'on-estimate': 'text-[var(--apple-system-green)]',
  'not-started': 'text-[var(--apple-tertiary-label)]'
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
