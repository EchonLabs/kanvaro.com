'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown } from 'lucide-react'

import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'
import type { VarianceOutcome } from '@/models/AllocationVariance'

import {
  PLAN_SCROLL_MAX,
  PLAN_SCROLL_MAX_NESTED,
  PlanCard,
  PlanCount,
  PlanRow,
  planButtonClass,
  planFieldClass,
  planInsetClass,
  planPillClass,
  type PlanPillTone
} from '../planning/ui'

/**
 * Panel 3 — variance and estimate debt (§15.8.5).
 *
 * The panel exists to make two conversations unavoidable, and its layout is the
 * argument:
 *
 * **Answer-first.** The rows that block completion (CC-3 — a revised estimate
 * or a reason is owed) come first, under one sentence saying how many and why,
 * each with its question in plain words and a real button to answer it. Every
 * other row folds behind a "Show N other rows" toggle. Before this, all rows
 * rendered in one long list, the ones owing an answer distinguishable only by
 * a red pill and an underlined link, and a PM had to read the lot to find the
 * two that mattered.
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
 *
 * The VAR-13 roll-up closes the panel as one compact row per member rather
 * than a grid of five-line tiles: it is reference material for the debt
 * conversation, not something the PM has to act on to complete.
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

const needsRevisionOf = (row: VariancePanelRow) =>
  row.requiresRevision && row.revisedRemainingMinutes === undefined
const needsReasonOf = (row: VariancePanelRow) =>
  row.requiresReason && !(row.notStartedReason ?? '').trim()
const needsAnswer = (row: VariancePanelRow) => needsRevisionOf(row) || needsReasonOf(row)

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
  const [showOthers, setShowOthers] = useState(false)

  const rows = useMemo(() => sortRows(data.rows, sort), [data.rows, sort])
  const owing = rows.filter(needsAnswer)
  const others = rows.filter((row) => !needsAnswer(row))

  // Derived from `data.rows` rather than the sorted copy: the sort order must
  // never change the number.
  const issues = data.rows.filter(needsAnswer).length

  const renderRow = (row: VariancePanelRow) => (
    <VarianceRow
      key={row.allocationId}
      row={row}
      onRevise={onRevise}
      onGiveReason={onGiveReason}
      disabled={disabled}
      locale={locale}
    />
  )

  return (
    <PlanCard
      id="panel-3"
      aria-labelledby="panel-3-heading"
      title={standupStrings.run.panel3()}
      headingLevel="h3"
      headingId="panel-3-heading"
      className={className}
      aside={
        <div className="flex flex-wrap items-center gap-3">
          <PlanCount
            count={issues}
            label={standupStrings.run.varianceIssueCount({ count: issues })}
          />

          <label className="flex items-center gap-2 apple-type-caption text-[var(--plan-muted)]" htmlFor="variance-sort">
            Sort
            <select
              id="variance-sort"
              aria-label="Sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as VarianceSort)}
              className={planFieldClass}
            >
              <option value="member">Member</option>
              <option value="task_key">Task</option>
              <option value="day_variance">Day variance</option>
            </select>
          </label>
        </div>
      }
    >
      {issues > 0 ? (
        <div
          data-testid="variance-needs-answer"
          className="flex flex-col gap-1 rounded-[var(--apple-radius-md)] border border-[var(--plan-warning)] bg-[var(--plan-warning-bg)] px-3.5 py-3"
        >
          <p className="apple-type-subheadline font-semibold text-[var(--plan-text)]">
            {standupStrings.variance.needsAnswerTitle({ count: issues })}
          </p>
          <p className="apple-type-caption text-[var(--plan-secondary)]">
            {standupStrings.variance.needsAnswerHelp()}
          </p>
        </div>
      ) : (
        data.rows.length > 0 && (
          <p className="flex items-center gap-2 apple-type-subheadline text-[var(--plan-secondary)]">
            <CheckCircle2
              className="h-4 w-4 shrink-0 text-[var(--plan-success)]"
              strokeWidth={2.25}
              aria-hidden="true"
            />
            {standupStrings.variance.allAnswered()}
          </p>
        )
      )}

      {owing.length > 0 && (
        <ul className={cn('flex flex-col gap-2.5', `plan-scroll ${PLAN_SCROLL_MAX} p-0.5`)}>
          {owing.map(renderRow)}
        </ul>
      )}

      {others.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            aria-expanded={showOthers}
            aria-controls="variance-other-rows"
            onClick={() => setShowOthers((current) => !current)}
            className="apple-transition flex items-center gap-1.5 self-start apple-type-subheadline font-semibold text-[var(--plan-secondary)] hover:text-[var(--plan-text)]"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 apple-transition', !showOthers && '-rotate-90')}
              strokeWidth={2}
              aria-hidden="true"
            />
            {showOthers
              ? standupStrings.variance.hideExplained()
              : standupStrings.variance.showExplained({ count: others.length })}
          </button>

          {showOthers && (
            <ul
              id="variance-other-rows"
              className={cn('flex flex-col gap-2.5', `plan-scroll ${PLAN_SCROLL_MAX_NESTED} p-0.5`)}
            >
              {others.map(renderRow)}
            </ul>
          )}
        </div>
      )}

      {/* VAR-13 — the member roll-up, one compact row each. */}
      {data.members.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-[var(--plan-border)] pt-4">
          <h4 className="apple-type-subheadline font-semibold text-[var(--plan-text)]">
            {standupStrings.variance.debtByMember()}
          </h4>
          <ul className={cn('flex flex-col', 'plan-scroll', PLAN_SCROLL_MAX_NESTED)}>
            {data.members.map((member) => (
              <MemberRollUp
                key={member.memberId}
                member={member}
                onViewLedger={onViewLedger}
                locale={locale}
              />
            ))}
          </ul>
        </div>
      )}
    </PlanCard>
  )
}

function VarianceRow({
  row,
  onRevise,
  onGiveReason,
  disabled,
  locale
}: {
  row: VariancePanelRow
  onRevise: (row: VariancePanelRow) => void
  onGiveReason: (row: VariancePanelRow) => void
  disabled: boolean
  locale?: string
}) {
  const tone = toneOf(row)
  const needsRevision = needsRevisionOf(row)
  const needsReason = needsReasonOf(row)
  const owing = needsRevision || needsReason

  return (
    <li
      data-testid={`variance-row-${row.taskKey ?? row.taskId}`}
      className={cn(
        planInsetClass,
        'flex flex-col gap-2 p-3',
        owing && 'border-l-[3px] border-l-[var(--plan-warning)]'
      )}
    >
      <PlanRow
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
              <span className={planPillClass('danger')} data-testid="chronic-spill">
                {standupStrings.variance.chronicSpill({ chainLength: row.spillChainLength })}
              </span>
            )}
            {/* NFR-A2: the word is part of the content, not a tooltip. */}
            <span
              className={planPillClass(TONE_BADGE[tone])}
              data-testid={`day-variance-${tone}`}
            >
              {formatMinutesAsHours(row.dayVarianceMinutes, { locale, signed: true })}{' '}
              {TONE_WORD[tone]()}
            </span>
          </>
        }
      />

      {/* VAR-11, second line: the task. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 apple-type-caption text-[var(--plan-muted)]">
        <span data-testid="original-estimate">
          Original estimate{' '}
          <span className="tabular-nums text-[var(--plan-secondary)]">{formatMinutesAsHours(row.originalEstimateMinutes, { locale })}</span>
        </span>
        <span data-testid="total-logged">
          Total logged{' '}
          <span className="tabular-nums text-[var(--plan-secondary)]">{formatMinutesAsHours(row.totalLoggedMinutesOnTask, { locale })}</span>
        </span>
        <span data-testid="task-variance">
          <span className="tabular-nums text-[var(--plan-secondary)]">{formatMinutesAsHours(row.taskVarianceMinutes, { locale, signed: true })}</span>{' '}
          against estimate
        </span>
      </div>

      <p data-testid={`variance-explanation-${row.taskKey ?? row.taskId}`} className="apple-type-caption text-[var(--plan-secondary)]">
        {row.explanation}
      </p>

      {owing ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--plan-border)] pt-2">
          <p className="apple-type-subheadline font-medium text-[var(--plan-text)]">
            {needsRevision
              ? standupStrings.variance.revisionQuestion({ name: firstName(row.memberName) })
              : standupStrings.variance.reasonQuestion({ name: firstName(row.memberName) })}
          </p>
          <div className="flex flex-wrap gap-2">
            {needsRevision && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRevise(row)}
                aria-label={`Revise ${row.taskKey ?? row.taskId}`}
                className={planButtonClass('primary', 'h-8 px-3', 'sm')}
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
                className={planButtonClass(needsRevision ? 'secondary' : 'primary', 'h-8 px-3', 'sm')}
              >
                {standupStrings.variance.giveReason()}
              </button>
            )}
          </div>
        </div>
      ) : row.revisedRemainingMinutes !== undefined ? (
        <span className={planPillClass('success', 'self-start')}>
          {standupStrings.variance.answeredRevision({ minutes: row.revisedRemainingMinutes, locale })}
        </span>
      ) : row.notStartedReason ? (
        <p className="apple-type-caption text-[var(--plan-secondary)]">
          <span className="font-semibold text-[var(--plan-success)]">
            {standupStrings.variance.answeredReason()}:
          </span>{' '}
          {row.notStartedReason}
        </p>
      ) : null}
    </li>
  )
}

function MemberRollUp({
  member,
  onViewLedger,
  locale
}: {
  member: VariancePanelMember
  onViewLedger: (memberId: string) => void
  locale?: string
}) {
  const inDebt = member.surplusMinutes === 0 && member.outstandingDebtMinutes > 0

  return (
    <li
      data-testid={`variance-rollup-${member.memberId}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--plan-border)] py-2 last:border-b-0 apple-type-caption text-[var(--plan-muted)]"
    >
      <span className="min-w-[8rem] flex-1 apple-type-subheadline font-semibold text-[var(--plan-text)]">
        {member.memberName}
      </span>
      <span>
        {standupStrings.variance.rollUpPlanned()}{' '}
        <span data-testid="planned-total" className="tabular-nums text-[var(--plan-text)]">
          {formatMinutesAsHours(member.plannedMinutes, { locale })}
        </span>
      </span>
      <span>
        {standupStrings.variance.rollUpLogged()}{' '}
        <span data-testid="logged-total" className="tabular-nums text-[var(--plan-text)]">
          {formatMinutesAsHours(member.loggedMinutesOnDay, { locale })}
        </span>
      </span>
      <span>
        {standupStrings.variance.rollUpDayVariance()}{' '}
        <span data-testid="net-day-variance" className="tabular-nums text-[var(--plan-text)]">
          {formatMinutesAsHours(member.dayVarianceMinutes, { locale, signed: true })}
        </span>
      </span>
      <span
        data-testid="outstanding-debt"
        className={cn(inDebt && 'font-semibold text-[var(--plan-danger)]')}
      >
        {member.surplusMinutes > 0
          ? standupStrings.variance.surplus({ minutes: member.surplusMinutes, locale })
          : `${standupStrings.variance.rollUpDebt()} ${formatMinutesAsHours(
              member.outstandingDebtMinutes,
              { locale }
            )}`}
      </span>
      {/* Kept for VAR-13's five figures, but only spoken when non-zero:
          "0 tasks need a revised estimate" on every row is noise. */}
      <span
        data-testid="needing-revision"
        className={cn(member.needingRevision === 0 && 'sr-only')}
      >
        {standupStrings.variance.rollUpNeedingRevision({ count: member.needingRevision })}
      </span>

      <button
        type="button"
        onClick={() => onViewLedger(member.memberId)}
        className={planButtonClass('secondary', 'ml-auto h-7 px-3', 'sm')}
      >
        {standupStrings.debt.ledgerTitle()}
      </button>
    </li>
  )
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

type Tone = 'over' | 'under' | 'on-estimate' | 'not-started'

const TONE_WORD: Record<Tone, () => string> = {
  over: standupStrings.variance.labelOver,
  under: standupStrings.variance.labelUnder,
  'on-estimate': standupStrings.variance.labelOnEstimate,
  'not-started': standupStrings.variance.labelNotStarted
}

/** VAR-12's palette. Under is blue — informational, not "good". */
const TONE_BADGE: Record<Tone, PlanPillTone> = {
  over: 'danger',
  under: 'accent',
  'on-estimate': 'success',
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
