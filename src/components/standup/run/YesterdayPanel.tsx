'use client'

import { useEffect, useState } from 'react'
import { ArrowUpRight, ChevronDown, Pencil } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'

import { formatMinutesAsHours, hoursToMinutes, minutes as toMinutes, roundToStep, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import type { BucketedRows, YesterdayBucket, YesterdayRow } from '@/lib/standup/yesterday'
import { cn } from '@/lib/utils'

import {
  PLAN_SCROLL_MAX_NESTED,
  PlanCard,
  initialsOf,
  planButtonClass,
  planFieldClass,
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
 *
 * **No red count on this panel.** It used to show one beside the heading,
 * counting every row that had not finished and labelled "rows need a note or
 * a revision" — but nothing here blocks completion, so the number disagreed
 * with the checklist and sent the PM hunting for work that did not exist. The
 * rows that genuinely owe an answer are counted once, on the variance panel
 * beside this one.
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
  /**
   * Whether "Revise remaining estimate" can open for this row — the dialog
   * needs the task's estimate figures, which come from the variance panel.
   * Omitted, every row offers it.
   */
  canRevise?(row: YesterdayRow): boolean
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
  const [editingRow, setEditingRow] = useState<Record<string, boolean>>({})
  const [noteStatus, setNoteStatus] = useState<Record<string, 'saving' | 'saved'>>({})
  const [toast, setToast] = useState<string | null>(null)

  const hasYesterday = Boolean(data.previousStandupId)

  // A fresh board from the server is the truth. The optimistic overlays and
  // drafts are keyed by task, so left in place they kept winning over the
  // refreshed values — which is part of why Refresh looked like it did nothing.
  useEffect(() => {
    setOptimisticStatus({})
    setOptimisticLogged({})
    setLoggedDraft({})
  }, [data])

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

  return (
    <PlanCard
      id="panel-2"
      aria-labelledby="panel-2-heading"
      title={standupStrings.yesterday.title()}
      headingLevel="h3"
      headingId="panel-2-heading"
      className={className}
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
          const empty = bucket.rows.length === 0

          return (
            <div key={bucket.bucket} className="flex flex-col gap-2.5">
              {/* All four buckets always render (RUN-9), but an empty one is
                  just its heading and "(0)" — the dashed "Nothing here." box
                  under it said the same thing a second time. */}
              <button
                type="button"
                aria-expanded={empty ? undefined : !isCollapsed}
                aria-controls={empty ? undefined : bodyId}
                disabled={empty}
                onClick={() =>
                  setCollapsed((current) => ({
                    ...current,
                    [bucket.bucket]: !isCollapsed
                  }))
                }
                className={cn(
                  'apple-transition flex items-center gap-1.5 self-start text-left apple-type-subheadline font-semibold',
                  empty ? 'text-[var(--plan-muted)]' : 'text-[var(--plan-text)]'
                )}
              >
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 text-[var(--plan-muted)] apple-transition',
                    (isCollapsed || empty) && '-rotate-90'
                  )}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <h4>{standupStrings.yesterday.bucketCount({ label: heading, count: bucket.rows.length })}</h4>
              </button>

              {!isCollapsed && !empty && (
                <ul
                  id={bodyId}
                  className={cn(
                    'flex flex-col gap-3',
                    // Roughly three rows before it scrolls. The four buckets
                    // stack inside one card, so an unbounded in-progress
                    // bucket on a large team buries the three below it.
                    `plan-scroll ${PLAN_SCROLL_MAX_NESTED} p-0.5`
                  )}
                >
                  {bucket.rows.map((row) => {
                    const label = row.taskKey ?? row.taskId
                    const editing = editingRow[row.taskId] ?? false

                    return (
                      <li
                        key={row.allocationId ?? `${row.memberId}:${row.taskId}`}
                        data-testid={`yesterday-row-${label}`}
                        className="flex flex-col gap-2.5 rounded-[var(--apple-radius-lg)] border border-[var(--plan-border)] bg-[var(--plan-surface)] px-4 py-3.5 shadow-[var(--plan-shadow)]"
                      >
                        {/* Four lines, each with one job: whose task it is,
                            what it is, what the day cost, what to do. Badges
                            became words in the first line — three pills in a
                            row competed with the title for the same width. */}
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 apple-type-caption text-[var(--plan-muted)]">
                            <span className="font-semibold tabular-nums text-[var(--plan-secondary)]">
                              {label}
                            </span>
                            {' · '}
                            <span>{row.memberName}</span>
                            {row.ageInStandups > 1 && (
                              <>
                                {' · '}
                                <span data-testid="age-badge">
                                  {standupStrings.yesterday.ageBadge({ standups: row.ageInStandups })}
                                </span>
                              </>
                            )}
                            {row.unplanned && (
                              <>
                                {' · '}
                                <span
                                  className="font-semibold text-[var(--plan-warning)]"
                                  title={standupStrings.yesterday.unplannedHint()}
                                >
                                  {standupStrings.yesterday.unplannedBadge()}
                                </span>
                              </>
                            )}
                          </p>

                          <span className={planPillClass(varianceTone(row.dayVarianceMinutes), 'shrink-0')}>
                            <span data-testid="day-variance" className="tabular-nums">
                              {formatMinutesAsHours(row.dayVarianceMinutes, { locale, signed: true })}
                            </span>
                            &nbsp;{varianceWord(row.dayVarianceMinutes)}
                          </span>
                        </div>

                        <p className="line-clamp-2 apple-type-body font-semibold leading-snug text-[var(--plan-text)]">
                          {row.title}
                        </p>

                        <p className="apple-type-caption tabular-nums text-[var(--plan-muted)]">
                          <span data-testid="planned" className="text-[var(--plan-text)]">
                            {formatMinutesAsHours(row.plannedMinutes, { locale })}
                          </span>{' '}
                          planned{' · '}
                          <span data-testid="logged" className="text-[var(--plan-text)]">
                            {formatMinutesAsHours(loggedOf(row), { locale })}
                          </span>{' '}
                          logged{' · '}
                          <span data-testid="remaining" className="text-[var(--plan-text)]">
                            {formatMinutesAsHours(row.remainingEstimateMinutes, { locale })}
                          </span>{' '}
                          left
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--plan-border)] pt-2.5">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {/* "was …" only when the status actually moved —
                                "To do → To do" is a sentence with nothing in it. */}
                            {row.previousStatus !== statusOf(row) && (
                              <span
                                data-testid="previous-status"
                                className="shrink-0 apple-type-caption text-[var(--plan-muted)]"
                              >
                                {standupStrings.yesterday.was()} {statusLabel(row.previousStatus)} →
                              </span>
                            )}
                            <select
                              id={`status-${row.taskId}`}
                              data-testid="current-status"
                              aria-label={`Status for ${label}`}
                              value={statusOf(row)}
                              disabled={disabled}
                              onChange={(event) => changeStatus(row, event.target.value)}
                              className={cn(
                                planFieldClass,
                                'h-8 min-w-0 rounded-[var(--apple-radius-pill)] px-3 font-semibold'
                              )}
                            >
                              {statusOptions.map((option) => (
                                <option key={option} value={option}>
                                  {statusLabel(option)}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="ml-auto flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              aria-expanded={editing}
                              aria-controls={`yesterday-edit-${row.taskId}`}
                              aria-label={`Hours and note for ${label}`}
                              title={standupStrings.yesterday.editRow()}
                              disabled={disabled}
                              onClick={() =>
                                setEditingRow((current) => ({ ...current, [row.taskId]: !editing }))
                              }
                              className={planButtonClass(
                                'secondary',
                                cn('h-8 w-8 px-0', editing && 'bg-[var(--plan-track)]'),
                                'sm'
                              )}
                            >
                              <Pencil aria-hidden="true" />
                            </button>

                            {(api.canRevise?.(row) ?? true) && (
                              <button
                                type="button"
                                aria-label={`${standupStrings.variance.reviseTitle()} for ${label}`}
                                onClick={() => api.reviseEstimate(row)}
                                disabled={disabled}
                                className={planButtonClass('secondary', 'h-8 px-3', 'sm')}
                              >
                                {standupStrings.yesterday.reviseShort()}
                              </button>
                            )}

                            <button
                              type="button"
                              aria-label={`${standupStrings.yesterday.goToTask()} ${label}`}
                              onClick={() => api.openTask(row.taskId)}
                              className={planButtonClass('secondary', 'h-8 px-3', 'sm')}
                            >
                              {standupStrings.yesterday.goToTask()}
                              <ArrowUpRight aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        {/* RUN-10's two corrections, out of the way until asked
                            for: on every row at once they doubled the panel's
                            height for something done on one row in ten. */}
                        {editing && (
                          <div
                            id={`yesterday-edit-${row.taskId}`}
                            className="flex flex-wrap items-center gap-2 rounded-[var(--apple-radius-md)] bg-[var(--plan-raised)] p-3"
                          >
                            <label
                              className="flex items-center gap-2 apple-type-caption text-[var(--plan-muted)]"
                              htmlFor={`logged-${row.taskId}`}
                            >
                              <span aria-hidden="true">{standupStrings.yesterday.loggedLabel()}</span>
                              <input
                                id={`logged-${row.taskId}`}
                                data-testid="logged-hours-edit"
                                aria-label={`Logged hours for ${label}`}
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
                            </label>

                            <input
                              id={`note-${row.taskId}`}
                              data-testid="note-input"
                              aria-label={`Note for ${label}`}
                              type="text"
                              placeholder={standupStrings.yesterday.notePlaceholder()}
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
                              className={planButtonClass('primary', 'h-8 px-3', 'sm')}
                            >
                              {noteStatus[row.taskId] === 'saved'
                                ? standupStrings.yesterday.noteSaved()
                                : standupStrings.yesterday.saveNote()}
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
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
                  className={planButtonClass('secondary', 'h-8 self-start px-3', 'sm')}
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
                className="flex flex-wrap items-center gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--plan-border)] bg-[var(--plan-surface)] p-4 apple-type-subheadline shadow-[var(--plan-shadow)]"
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

/** "in_progress" -> "In progress": the workflow's stored value, readable. */
function statusLabel(status: string): string {
  const words = String(status ?? '').replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function hoursText(value: Minutes): string {
  return String(Number((value / 60).toFixed(2)))
}

/** The word beside the signed hours, so colour is never the only signal (NFR-A2). */
function varianceWord(minutesOver: number): string {
  if (minutesOver > 0) return standupStrings.variance.labelOver()
  if (minutesOver < 0) return standupStrings.variance.labelUnder()
  return standupStrings.yesterday.onPlan()
}

/** Over is amber (the blueprint's "+0.5h over"), under blue, on-plan green. */
function varianceTone(minutesOver: number): PlanPillTone {
  if (minutesOver > 0) return 'warning'
  if (minutesOver < 0) return 'accent'
  return 'success'
}

export type { YesterdayRow, Minutes }
