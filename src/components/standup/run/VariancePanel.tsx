'use client'

import { useMemo, useState } from 'react'

import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'
import type { VarianceOutcome } from '@/models/AllocationVariance'

import {
  Badge,
  CARD_CLASSES,
  CARD_TITLE_CLASSES,
  INSET_CLASSES,
  IssueCount,
  LINK_BUTTON_CLASSES,
  RowHead,
  RUN_FIELD_CLASSES,
  SCROLL_CLASSES,
  SCROLL_MAX,
  SCROLL_MAX_NESTED,
  type Tone as BadgeTone
} from './ui'

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
  className?: string
}

export function VariancePanel({
  data,
  onRevise,
  onGiveReason,
  onViewLedger,
  disabled = false,
  locale,
  className
}: VariancePanelProps) {
  const [sort, setSort] = useState<VarianceSort>('member')

  const rows = useMemo(() => sortRows(data.rows, sort), [data.rows, sort])

  // The two per-row conditions the list below marks in red, counted once for
  // the heading. Derived from `data.rows` rather than the sorted copy: the sort
  // order must never change the number.
  const issues = data.rows.filter(
    (row) =>
      (row.requiresRevision && row.revisedRemainingMinutes === undefined) ||
      (row.requiresReason && !row.notStartedReason)
  ).length

  return (
    <section
      id="panel-3"
      aria-labelledby="panel-3-heading"
      className={cn('scroll-mt-6 flex flex-col gap-4', CARD_CLASSES, className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3
            id="panel-3-heading"
            className={CARD_TITLE_CLASSES}
          >
            {standupStrings.run.panel3()}
          </h3>
          <IssueCount
            count={issues}
            label={standupStrings.run.varianceIssueCount({ count: issues })}
          />
        </div>

        <label className="flex items-center gap-2 text-[11px] text-[var(--sur-muted)]" htmlFor="variance-sort">
          Sort
          <select
            id="variance-sort"
            aria-label="Sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as VarianceSort)}
            className={RUN_FIELD_CLASSES}
          >
            <option value="member">Member</option>
            <option value="task_key">Task</option>
            <option value="day_variance">Day variance</option>
          </select>
        </label>
      </div>

      {/* VAR-13 — the member roll-up strip, as the blueprint's per-member
          "estimate debt" tiles. */}
      {/* One tile per member, two-up — a fifteen-person team is eight rows of
          tiles before the variance list even starts. */}
      <ul
        className={cn(
          'grid grid-cols-1 gap-2 sm:grid-cols-2',
          SCROLL_CLASSES,
          SCROLL_MAX_NESTED,
          'p-0.5'
        )}
      >
        {data.members.map((member) => (
          <li
            key={member.memberId}
            data-testid={`variance-rollup-${member.memberId}`}
            className={cn(INSET_CLASSES, 'flex flex-col gap-1 px-3 py-2.5 text-[11px] text-[var(--sur-muted)]')}
          >
            <span className="text-[13px] font-semibold text-[var(--sur-text)]">{member.memberName}</span>
            <span>
              {standupStrings.variance.rollUpPlanned()}{' '}
              <span data-testid="planned-total" className="tabular-nums text-[var(--sur-text)]">
                {formatMinutesAsHours(member.plannedMinutes, { locale })}
              </span>
            </span>
            <span>
              {standupStrings.variance.rollUpLogged()}{' '}
              <span data-testid="logged-total" className="tabular-nums text-[var(--sur-text)]">
                {formatMinutesAsHours(member.loggedMinutesOnDay, { locale })}
              </span>
            </span>
            <span>
              {standupStrings.variance.rollUpDayVariance()}{' '}
              <span data-testid="net-day-variance" className="tabular-nums text-[var(--sur-text)]">
                {formatMinutesAsHours(member.dayVarianceMinutes, { locale, signed: true })}
              </span>
            </span>
            <span
              data-testid="outstanding-debt"
              className={cn(
                member.surplusMinutes === 0 &&
                  member.outstandingDebtMinutes > 0 &&
                  'font-semibold text-[var(--sur-red)]'
              )}
            >
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
              className={cn(LINK_BUTTON_CLASSES, 'mt-0.5 self-start text-[11px]')}
            >
              {standupStrings.debt.ledgerTitle()}
            </button>
          </li>
        ))}
      </ul>

      <ul
        className={cn(
          'flex flex-col divide-y divide-[var(--sur-border)]',
          rows.length > 0 && `${SCROLL_CLASSES} ${SCROLL_MAX}`
        )}
      >
        {rows.map((row) => {
          const tone = toneOf(row)
          const needsRevision = row.requiresRevision && row.revisedRemainingMinutes === undefined
          const needsReason = row.requiresReason && !row.notStartedReason

          return (
            <li
              key={row.allocationId}
              data-testid={`variance-row-${row.taskKey ?? row.taskId}`}
              className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0"
            >
              <RowHead
                title={
                  <>
                    {row.taskKey && <span>{row.taskKey} </span>}
                    {row.title}
                  </>
                }
                meta={
                  /* VAR-11, first line: the day — "Sarah K. · Planned 4h / Logged 4.5h". */
                  <>
                    {row.memberName} ·{' '}
                    <span data-testid="planned">
                      Planned <span className="tabular-nums">{formatMinutesAsHours(row.plannedMinutes, { locale })}</span>
                    </span>{' '}
                    /{' '}
                    <span data-testid="logged">
                      Logged <span className="tabular-nums">{formatMinutesAsHours(row.loggedMinutesOnDay, { locale })}</span>
                    </span>
                  </>
                }
                badge={
                  <>
                    {row.chronicSpill && (
                      <Badge tone="red" data-testid="chronic-spill">
                        {standupStrings.variance.chronicSpill({ chainLength: row.spillChainLength })}
                      </Badge>
                    )}
                    {needsRevision && (
                      <Badge tone="red">{standupStrings.variance.revisionRequiredBadge()}</Badge>
                    )}
                    {needsReason && (
                      <Badge tone="amber">{standupStrings.variance.reasonRequiredBadge()}</Badge>
                    )}
                    {/* NFR-A2: the word is part of the content, not a tooltip. */}
                    <Badge tone={TONE_BADGE[tone]} data-testid={`day-variance-${tone}`}>
                      {formatMinutesAsHours(row.dayVarianceMinutes, { locale, signed: true })}{' '}
                      {TONE_WORD[tone]()}
                    </Badge>
                  </>
                }
              />

              {/* VAR-11, second line: the task. */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--sur-muted)]">
                <span data-testid="original-estimate">
                  Original estimate{' '}
                  <span className="tabular-nums text-[var(--sur-secondary)]">{formatMinutesAsHours(row.originalEstimateMinutes, { locale })}</span>
                </span>
                <span data-testid="total-logged">
                  Total logged{' '}
                  <span className="tabular-nums text-[var(--sur-secondary)]">{formatMinutesAsHours(row.totalLoggedMinutesOnTask, { locale })}</span>
                </span>
                <span data-testid="task-variance">
                  <span className="tabular-nums text-[var(--sur-secondary)]">{formatMinutesAsHours(row.taskVarianceMinutes, { locale, signed: true })}</span>{' '}
                  against estimate
                </span>
              </div>

              <p data-testid={`variance-explanation-${row.taskKey ?? row.taskId}`} className="text-[11px] text-[var(--sur-secondary)]">
                {row.explanation}
              </p>

              {needsRevision || needsReason ? (
                <div className="flex flex-wrap gap-3">
                  {needsRevision && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onRevise(row)}
                      aria-label={`Revise ${row.taskKey ?? row.taskId}`}
                      className={LINK_BUTTON_CLASSES}
                    >
                      {standupStrings.variance.reviseTitle()}
                    </button>
                  )}

                  {needsReason && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onGiveReason(row)}
                      aria-label={`Give a reason for ${row.taskKey ?? row.taskId}`}
                      className={LINK_BUTTON_CLASSES}
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
const TONE_BADGE: Record<Tone, BadgeTone> = {
  over: 'red',
  under: 'blue',
  'on-estimate': 'green',
  'not-started': 'neutral'
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
