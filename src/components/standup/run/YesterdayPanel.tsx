'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'

import { formatMinutesAsHours, hoursToMinutes, minutes as toMinutes, roundToStep, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import type { BucketedRows, YesterdayBucket, YesterdayRow } from '@/lib/standup/yesterday'
import { cn } from '@/lib/utils'

import {
  PLAN_SCROLL_MAX_NESTED,
  PlanCard,
  PlanCount,
  PlanRow,
  initialsOf,
  planButtonClass,
  planFieldClass,
  planInsetClass,
  planLinkClass,
  planPillClass,
  type PlanPillTone
} from '../planning/ui'


/**
 * Panel 2 — yesterday's review (§15.8.4, RUN-9..RUN-13).
 *
 * The panel's whole job is to make the previous day's plan answerable without
 * leaving the stand-up. Three decisions carry that:
 *
 * **All four buckets render, always.** Even empty. A PM who sees three headings
 * cannot tell "nothing is blocked" from "the blocked bucket did not render",
 * and the difference matters with eight people waiting.
 *
 * **The completed bucket is collapsed with its count** (RUN-9). It is the one
 * bucket with nothing to decide, so it starts out of the way — but the count
 * stays visible, because "six things finished" is the one fact about it worth
 * reading.
 *
 * **A rejected change rolls back loudly** (RUN-25). The row moves optimistically
 * because a meeting cannot wait for a round trip per click, and when the server
 * refuses, the row goes back *and says so*. A silent revert is strictly worse
 * than no optimism: the PM believes it stuck and finds out at completion.
 */

export interface YesterdayPanelApi {
  setStatus(input: { taskIds: string[]; status: string; onBehalfOf?: string }): Promise<void>
  confirmCompleted(input: { taskIds: string[] }): Promise<void>
  /** RUN-10 — adjust that member's logged hours for the day, in minutes. */
  adjustLoggedHours(input: { taskId: string; memberId: string; loggedMinutes: Minutes }): Promise<void>
  /** RUN-10 — a one-line note on the row. */
  addNote(input: { taskId: string; memberId?: string; note: string }): Promise<void>
  openTask(taskId: string): void
  reviseEstimate(row: YesterdayRow): void
}

export interface YesterdayPanelProps {
  data: {
    buckets: BucketedRows[]
    addedAfterCompletion: YesterdayRow[]
    previousStandupId?: string
    previousStandupDate?: string
  }
  api: YesterdayPanelApi
  /** The project's workflow, for RUN-10's status control. */
  statusOptions?: string[]
  disabled?: boolean
  locale?: string
  className?: string
}

const HEADINGS: Record<YesterdayBucket, () => string> = {
  completed: standupStrings.yesterday.bucketCompleted,
  in_progress: standupStrings.yesterday.bucketInProgress,
  not_started: standupStrings.yesterday.bucketNotStarted,
  blocked: standupStrings.yesterday.bucketBlocked
}

export function YesterdayPanel({
  data,
  api,
  statusOptions = ['todo', 'in_progress', 'blocked', 'done'],
  disabled = false,
  locale,
  className
}: YesterdayPanelProps) {
  // Only `completed` starts collapsed (RUN-9): it is the bucket with nothing
  // left to decide.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ completed: true })
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, string>>({})
  const [optimisticLogged, setOptimisticLogged] = useState<Record<string, Minutes>>({})
  const [loggedDraft, setLoggedDraft] = useState<Record<string, string>>({})
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})
  const [noteStatus, setNoteStatus] = useState<Record<string, 'saving' | 'saved'>>({})
  const [toast, setToast] = useState<string | null>(null)

  const hasYesterday = Boolean(data.previousStandupId)

  const statusOf = (row: YesterdayRow) => optimisticStatus[row.taskId] ?? row.currentStatus
  const loggedOf = (row: YesterdayRow) => optimisticLogged[row.taskId] ?? row.loggedMinutes

  const changeStatus = async (row: YesterdayRow, next: string) => {
    const previous = statusOf(row)
    setOptimisticStatus((current) => ({ ...current, [row.taskId]: next }))
    setToast(null)
    try {
      await api.setStatus({
        taskIds: [row.taskId],
        status: next,
        // RUN-11: the PM is changing somebody else's record, and the person it
        // belongs to has to be told.
        onBehalfOf: row.memberId
      })
    } catch {
      setOptimisticStatus((current) => ({ ...current, [row.taskId]: previous }))
      setToast(standupStrings.run.editRejected())
    }
  }

  const commitLoggedHours = async (row: YesterdayRow) => {
    const draft = loggedDraft[row.taskId]
    if (draft === undefined) return
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setLoggedDraft((current) => ({ ...current, [row.taskId]: hoursText(loggedOf(row)) }))
      return
    }

    const snapped = roundToStep(hoursToMinutes(parsed), toMinutes(15))
    const previous = loggedOf(row)
    setLoggedDraft((current) => ({ ...current, [row.taskId]: hoursText(snapped) }))
    if (snapped === previous) return

    setOptimisticLogged((current) => ({ ...current, [row.taskId]: snapped }))
    setToast(null)
    try {
      await api.adjustLoggedHours({ taskId: row.taskId, memberId: row.memberId, loggedMinutes: snapped })
    } catch {
      setOptimisticLogged((current) => ({ ...current, [row.taskId]: previous }))
      setLoggedDraft((current) => ({ ...current, [row.taskId]: hoursText(previous) }))
      setToast(standupStrings.run.editRejected())
    }
  }

  const submitNote = async (row: YesterdayRow) => {
    const note = (noteDraft[row.taskId] ?? '').trim()
    if (!note) return
    setNoteStatus((current) => ({ ...current, [row.taskId]: 'saving' }))
    setToast(null)
    try {
      await api.addNote({ taskId: row.taskId, memberId: row.memberId, note })
      setNoteDraft((current) => ({ ...current, [row.taskId]: '' }))
      setNoteStatus((current) => ({ ...current, [row.taskId]: 'saved' }))
    } catch {
      setNoteStatus((current) => {
        const next = { ...current }
        delete next[row.taskId]
        return next
      })
      setToast(standupStrings.run.editRejected())
    }
  }

  /**
   * The red heading count: yesterday's rows the PM still has to answer for —
   * anything that did not finish, plus anything that landed on somebody's day
   * after the stand-up closed (I1). The completed bucket is deliberately not in
   * it: a finished task is the one row here with nothing to decide, which is
   * also why it starts collapsed.
   */
  const issues =
    data.buckets.reduce(
      (total, bucket) => (bucket.bucket === 'completed' ? total : total + bucket.rows.length),
      0
    ) + data.addedAfterCompletion.length

  return (
    <PlanCard
      id="panel-2"
      aria-labelledby="panel-2-heading"
      title={standupStrings.yesterday.title()}
      headingLevel="h3"
      headingId="panel-2-heading"
      className={className}
      aside={
        hasYesterday && (
          <PlanCount
            count={issues}
            label={standupStrings.run.yesterdayIssueCount({ count: issues })}
          />
        )
      }
    >

      {toast && (
        <p
          role="alert"
          className={cn(
            'apple-type-subheadline',
            'rounded-[var(--apple-radius-md)] border border-[var(--plan-danger)] bg-[var(--plan-danger-bg)] px-4 py-3 text-[var(--plan-danger)]'
          )}
        >
          {toast}
        </p>
      )}

      {!hasYesterday && (
        <p className="apple-type-subheadline text-[var(--plan-secondary)]">
          {standupStrings.yesterday.noPreviousStandup()}
        </p>
      )}

      {hasYesterday &&
        data.buckets.map((bucket) => {
          const heading = HEADINGS[bucket.bucket]()
          const isCollapsed = collapsed[bucket.bucket] ?? false
          const bodyId = `yesterday-${bucket.bucket}`

          return (
            <div key={bucket.bucket} className="flex flex-col gap-2">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                aria-controls={bodyId}
                onClick={() =>
                  setCollapsed((current) => ({
                    ...current,
                    [bucket.bucket]: !isCollapsed
                  }))
                }
                className="apple-transition flex items-center gap-1.5 self-start text-left apple-type-subheadline font-semibold text-[var(--plan-text)]"
              >
                <ChevronDown
                  className={cn('h-3.5 w-3.5 shrink-0 text-[var(--plan-muted)] apple-transition', isCollapsed && '-rotate-90')}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <h4>{standupStrings.yesterday.bucketCount({ label: heading, count: bucket.rows.length })}</h4>
              </button>

              {!isCollapsed && (
                <ul
                  id={bodyId}
                  className={cn(
                    'flex flex-col gap-3',
                    // Roughly three rows before it scrolls. The four buckets
                    // stack inside one card, so an unbounded in-progress
                    // bucket on a large team buries the three below it.
                    bucket.rows.length > 0 && `plan-scroll ${PLAN_SCROLL_MAX_NESTED} p-0.5`
                  )}
                >
                  {bucket.rows.length === 0 && (
                    <li className="rounded-[var(--apple-radius-md)] border border-dashed border-[var(--plan-border)] px-3 py-2.5 apple-type-subheadline text-[var(--plan-muted)]">
                      {standupStrings.yesterday.emptyBucket()}
                    </li>
                  )}

                  {bucket.rows.map((row) => (
                    <li
                      key={row.allocationId ?? `${row.memberId}:${row.taskId}`}
                      data-testid={`yesterday-row-${row.taskKey ?? row.taskId}`}
                      className={cn(planInsetClass, 'flex flex-col gap-3 p-3')}
                    >
                      {/* The blueprint's row head: "ARD-410 Base LLM Wiring",
                          "Sarah K. · Planned 4h / Logged 4.5h", variance badge. */}
                      <PlanRow
                        title={
                          <>
                            <span>{row.taskKey ?? row.taskId}</span> {row.title}
                          </>
                        }
                        meta={
                          <>
                            <span>{row.memberName}</span> · Planned{' '}
                            <span data-testid="planned" className="tabular-nums">
                              {formatMinutesAsHours(row.plannedMinutes, { locale })}
                            </span>{' '}
                            / Logged{' '}
                            <span data-testid="logged" className="tabular-nums">
                              {formatMinutesAsHours(loggedOf(row), { locale })}
                            </span>
                          </>
                        }
                        badge={
                          <>
                            {row.ageInStandups > 1 && (
                              <span className={planPillClass('neutral')} data-testid="age-badge">
                                {standupStrings.yesterday.ageBadge({ standups: row.ageInStandups })}
                              </span>
                            )}

                            {row.unplanned && (
                              <span
                                className={planPillClass('warning')}
                                title={standupStrings.yesterday.unplannedHint()}
                              >
                                {standupStrings.yesterday.unplannedBadge()}
                              </span>
                            )}

                            <span className={planPillClass(varianceTone(row.dayVarianceMinutes))}>
                              <span data-testid="day-variance" className="tabular-nums">
                                {formatMinutesAsHours(row.dayVarianceMinutes, { locale, signed: true })}
                              </span>
                              &nbsp;{standupStrings.yesterday.varianceBadge()}
                            </span>
                          </>
                        }
                      />

                      {/* The rest of RUN-12's fields — status then and now, and
                          what is left. Planned, logged and variance live in the
                          row head above. */}
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div
                          data-testid="previous-status"
                          className="flex flex-col gap-0.5 rounded-[var(--apple-radius-sm)] bg-[var(--plan-surface)] px-2 py-1.5"
                        >
                          <span className="apple-type-caption font-semibold uppercase tracking-wide text-[var(--plan-muted)]">
                            {standupStrings.yesterday.previousStatus()}
                          </span>
                          <span className="apple-type-subheadline text-[var(--plan-text)]">{row.previousStatus}</span>
                        </div>

                        <div className="flex flex-col gap-0.5 rounded-[var(--apple-radius-sm)] bg-[var(--plan-surface)] px-2 py-1">
                          <label
                            className="apple-type-caption font-semibold uppercase tracking-wide text-[var(--plan-muted)]"
                            htmlFor={`status-${row.taskId}`}
                          >
                            {standupStrings.yesterday.currentStatus()}
                          </label>
                          <select
                            id={`status-${row.taskId}`}
                            data-testid="current-status"
                            aria-label={`Status for ${row.taskKey ?? row.taskId}`}
                            value={statusOf(row)}
                            disabled={disabled}
                            onChange={(event) => changeStatus(row, event.target.value)}
                            className="h-6 w-full rounded-[var(--apple-radius-sm)] border-0 bg-transparent p-0 apple-type-subheadline text-[var(--plan-text)]"
                          >
                            {statusOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-0.5 rounded-[var(--apple-radius-sm)] bg-[var(--plan-surface)] px-2 py-1.5">
                          <span className="apple-type-caption font-semibold uppercase tracking-wide text-[var(--plan-muted)]">
                            Remaining
                          </span>
                          <span data-testid="remaining" className="apple-type-subheadline tabular-nums text-[var(--plan-text)]">
                            {formatMinutesAsHours(row.remainingEstimateMinutes, { locale })}
                          </span>
                        </div>
                      </div>

                      {/* Actions line — the note field takes whatever width is left. */}
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor={`logged-${row.taskId}`}>
                          {`Logged hours for ${row.taskKey ?? row.taskId}`}
                        </label>
                        <input
                          id={`logged-${row.taskId}`}
                          data-testid="logged-hours-edit"
                          aria-label={`Logged hours for ${row.taskKey ?? row.taskId}`}
                          type="number"
                          inputMode="decimal"
                          step={0.25}
                          min={0}
                          disabled={disabled}
                          value={loggedDraft[row.taskId] ?? hoursText(loggedOf(row))}
                          onChange={(event) =>
                            setLoggedDraft((current) => ({ ...current, [row.taskId]: event.target.value }))
                          }
                          onBlur={() => commitLoggedHours(row)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              commitLoggedHours(row)
                            }
                          }}
                          className={cn(planFieldClass, 'w-20 shrink-0 text-right tabular-nums')}
                        />

                        <label className="sr-only" htmlFor={`note-${row.taskId}`}>
                          {`Note for ${row.taskKey ?? row.taskId}`}
                        </label>
                        <input
                          id={`note-${row.taskId}`}
                          data-testid="note-input"
                          aria-label={`Note for ${row.taskKey ?? row.taskId}`}
                          type="text"
                          placeholder="Add a note"
                          disabled={disabled}
                          value={noteDraft[row.taskId] ?? ''}
                          onChange={(event) => {
                            setNoteDraft((current) => ({ ...current, [row.taskId]: event.target.value }))
                            setNoteStatus((current) => {
                              const next = { ...current }
                              delete next[row.taskId]
                              return next
                            })
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              submitNote(row)
                            }
                          }}
                          className={cn(planFieldClass, 'min-w-[10rem] flex-1 px-2.5')}
                        />
                        <button
                          type="button"
                          data-testid="note-save"
                          disabled={disabled || !((noteDraft[row.taskId] ?? '').trim())}
                          onClick={() => submitNote(row)}
                          className={cn(planLinkClass, 'shrink-0')}
                        >
                          {noteStatus[row.taskId] === 'saved'
                            ? standupStrings.yesterday.noteSaved()
                            : standupStrings.yesterday.saveNote()}
                        </button>

                        <span className="ml-auto flex shrink-0 flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => api.reviseEstimate(row)}
                            disabled={disabled}
                            className={planLinkClass}
                          >
                            {standupStrings.variance.reviseTitle()}
                          </button>

                          <button
                            type="button"
                            onClick={() => api.openTask(row.taskId)}
                            className={planLinkClass}
                          >
                            {`Open ${row.taskKey ?? row.taskId}`}
                          </button>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* RUN-13 — clear the whole completed bucket in one click. */}
              {bucket.bucket === 'completed' && bucket.rows.length > 0 && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    api.confirmCompleted({ taskIds: bucket.rows.map((row) => row.taskId) })
                  }
                  className={planButtonClass('secondary', 'h-8 self-start px-3')}
                >
                  {standupStrings.yesterday.markAllConfirmed()}
                </button>
              )}
            </div>
          )
        })}

      {/* I1 — not one of RUN-9's four buckets: the PM was not in the room
          when these were added, so they are called out separately rather
          than blending into whichever bucket their task status lands in.
          Renders only when non-empty (unlike the four buckets above, this
          is not an "always all four" section). */}
      {hasYesterday && data.addedAfterCompletion.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="apple-type-subheadline font-semibold text-[var(--plan-text)]">
            {standupStrings.yesterday.bucketCount({
              label: standupStrings.yesterday.addedAfterCompletion(),
              count: data.addedAfterCompletion.length
            })}
          </h4>
          <ul className={cn('flex flex-col gap-2.5', 'plan-scroll', PLAN_SCROLL_MAX_NESTED, 'p-0.5')}>
            {data.addedAfterCompletion.map((row) => (
              <li
                key={row.allocationId ?? `${row.memberId}:${row.taskId}`}
                data-testid={`yesterday-added-row-${row.taskKey ?? row.taskId}`}
                className={cn(planInsetClass, 'flex flex-wrap items-center gap-3 p-3 apple-type-subheadline')}
              >
                <span className="apple-type-caption font-semibold text-[var(--plan-muted)]">
                  {row.taskKey ?? row.taskId}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-[var(--plan-text)]">{row.title}</span>
                {/* A real `Avatar`, not a styled `<span>`: this is the only row
                    on the panel that names a person, and it used to be the one
                    place their photo could never appear. `AvatarImage` is only
                    mounted when the board sent a URL, so Radix does not have to
                    fail a load to reach the fallback. */}
                <Avatar aria-label={row.memberName} className="h-6 w-6">
                  {row.avatarUrl && (
                    <AvatarImage src={row.avatarUrl} alt="" className="object-cover" />
                  )}
                  <AvatarFallback className="bg-[var(--plan-track)] apple-type-caption font-semibold text-[var(--plan-secondary)]">
                    {initialsOf(row.memberName)}
                  </AvatarFallback>
                </Avatar>
                <span data-testid="added-current-status" className="shrink-0 text-[var(--plan-secondary)]">
                  {standupStrings.yesterday.currentStatus()} {row.currentStatus}
                </span>
                <span data-testid="planned" className="shrink-0 tabular-nums text-[var(--plan-text)]">
                  {formatMinutesAsHours(row.plannedMinutes, { locale })}
                </span>
                <span data-testid="logged" className="shrink-0 tabular-nums text-[var(--plan-text)]">
                  {formatMinutesAsHours(row.loggedMinutes, { locale })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PlanCard>
  )
}

function hoursText(value: Minutes): string {
  return String(Number((value / 60).toFixed(2)))
}

/** Over is amber (the blueprint's "+0.5h variance"), under blue, on-plan green. */
function varianceTone(minutesOver: number): PlanPillTone {
  if (minutesOver > 0) return 'warning'
  if (minutesOver < 0) return 'accent'
  return 'success'
}

export type { YesterdayRow, Minutes }
