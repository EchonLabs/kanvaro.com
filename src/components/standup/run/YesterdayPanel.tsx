'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { formatMinutesAsHours, hoursToMinutes, minutes as toMinutes, roundToStep, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import type { BucketedRows, YesterdayBucket, YesterdayRow } from '@/lib/standup/yesterday'
import { cn } from '@/lib/utils'

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
  locale
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

  return (
    <section
      id="panel-2"
      aria-labelledby="panel-2-heading"
      className="scroll-mt-6 flex flex-col gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4"
    >
      <h3 id="panel-2-heading" className="apple-section-label text-[var(--apple-tertiary-label)]">
        {standupStrings.yesterday.title()}
      </h3>

      {toast && (
        <p
          role="alert"
          className="rounded-[var(--apple-radius-md)] border border-[var(--apple-system-red)]/30 bg-[var(--apple-system-red)]/[0.06] px-3 py-2 text-[13px] text-[var(--apple-system-red)]"
        >
          {toast}
        </p>
      )}

      {!hasYesterday && (
        <p className="text-[13px] text-[var(--apple-secondary-label)]">
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
                className="apple-transition flex items-center gap-1.5 self-start text-left text-[13px] font-semibold text-[var(--apple-label)]"
              >
                <ChevronDown
                  className={cn('h-3.5 w-3.5 shrink-0 apple-transition', isCollapsed && '-rotate-90')}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <h4>{standupStrings.yesterday.bucketCount({ label: heading, count: bucket.rows.length })}</h4>
              </button>

              {!isCollapsed && (
                <ul id={bodyId} className="flex flex-col gap-2.5">
                  {bucket.rows.length === 0 && (
                    <li className="rounded-[var(--apple-radius-md)] border border-dashed border-[var(--apple-separator)] px-3 py-2.5 text-[12.5px] text-[var(--apple-tertiary-label)]">
                      {standupStrings.yesterday.emptyBucket()}
                    </li>
                  )}

                  {bucket.rows.map((row) => (
                    <li
                      key={row.allocationId ?? `${row.memberId}:${row.taskId}`}
                      data-testid={`yesterday-row-${row.taskKey ?? row.taskId}`}
                      className="flex flex-col gap-3 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-background p-3"
                    >
                      {/* Identity line */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-apple-mono text-[12px] text-[var(--apple-tertiary-label)]">
                          {row.taskKey ?? row.taskId}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--apple-label)]">
                          {row.title}
                        </span>
                        <span
                          aria-label={row.memberName}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--apple-tertiary-fill)] text-[10px] font-semibold text-[var(--apple-secondary-label)]"
                        >
                          {initialsOf(row.memberName)}
                        </span>

                        {row.ageInStandups > 1 && (
                          <span
                            data-testid="age-badge"
                            className="rounded-full bg-[var(--apple-tertiary-fill)] px-2 py-0.5 text-[11px] text-[var(--apple-secondary-label)]"
                          >
                            {standupStrings.yesterday.ageBadge({ standups: row.ageInStandups })}
                          </span>
                        )}

                        {row.unplanned && (
                          <span
                            title={standupStrings.yesterday.unplannedHint()}
                            className="rounded-full bg-[var(--apple-system-orange)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--apple-system-orange)]"
                          >
                            {standupStrings.yesterday.unplannedBadge()}
                          </span>
                        )}
                      </div>

                      {/* Stat grid — every RUN-12 field, full width at every breakpoint. */}
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                        <div
                          data-testid="previous-status"
                          className="flex flex-col gap-0.5 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] px-2 py-1.5"
                        >
                          <span className="text-[10px] uppercase tracking-wide text-[var(--apple-tertiary-label)]">
                            {standupStrings.yesterday.previousStatus()}
                          </span>
                          <span className="text-[12.5px] text-[var(--apple-label)]">{row.previousStatus}</span>
                        </div>

                        <div className="flex flex-col gap-0.5 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] px-2 py-1">
                          <label
                            className="text-[10px] uppercase tracking-wide text-[var(--apple-tertiary-label)]"
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
                            className="h-6 w-full rounded-[var(--apple-radius-sm)] border-0 bg-transparent p-0 text-[12.5px] text-[var(--apple-label)]"
                          >
                            {statusOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-0.5 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] px-2 py-1.5">
                          <span className="text-[10px] uppercase tracking-wide text-[var(--apple-tertiary-label)]">
                            Planned
                          </span>
                          <span data-testid="planned" className="font-apple-mono text-[12.5px] tabular-nums text-[var(--apple-label)]">
                            {formatMinutesAsHours(row.plannedMinutes, { locale })}
                          </span>
                        </div>

                        <div className="flex flex-col gap-0.5 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] px-2 py-1.5">
                          <span className="text-[10px] uppercase tracking-wide text-[var(--apple-tertiary-label)]">
                            Logged
                          </span>
                          <span data-testid="logged" className="font-apple-mono text-[12.5px] tabular-nums text-[var(--apple-label)]">
                            {formatMinutesAsHours(loggedOf(row), { locale })}
                          </span>
                        </div>

                        <div className="flex flex-col gap-0.5 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] px-2 py-1.5">
                          <span className="text-[10px] uppercase tracking-wide text-[var(--apple-tertiary-label)]">
                            Variance
                          </span>
                          <span data-testid="day-variance" className="font-apple-mono text-[12.5px] tabular-nums text-[var(--apple-label)]">
                            {formatMinutesAsHours(row.dayVarianceMinutes, { locale, signed: true })}
                          </span>
                        </div>

                        <div className="flex flex-col gap-0.5 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] px-2 py-1.5">
                          <span className="text-[10px] uppercase tracking-wide text-[var(--apple-tertiary-label)]">
                            Remaining
                          </span>
                          <span data-testid="remaining" className="font-apple-mono text-[12.5px] tabular-nums text-[var(--apple-label)]">
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
                          className="h-8 w-20 shrink-0 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-background px-2 text-right text-[12.5px] tabular-nums disabled:opacity-40"
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
                          className="h-8 min-w-[10rem] flex-1 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-background px-2.5 text-[12.5px] disabled:opacity-40"
                        />
                        <button
                          type="button"
                          data-testid="note-save"
                          disabled={disabled || !((noteDraft[row.taskId] ?? '').trim())}
                          onClick={() => submitNote(row)}
                          className="apple-transition shrink-0 text-[12px] font-medium text-[var(--apple-system-blue)] hover:underline disabled:opacity-40"
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
                            className="apple-transition text-[12px] font-medium text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] hover:underline"
                          >
                            {standupStrings.variance.reviseTitle()}
                          </button>

                          <button
                            type="button"
                            onClick={() => api.openTask(row.taskId)}
                            className="apple-transition text-[12px] font-medium text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] hover:underline"
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
                  className="apple-transition self-start rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] px-2.5 py-1 text-[12px] font-medium hover:bg-[var(--apple-quaternary-fill)]"
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
          <h4 className="text-[13px] font-semibold text-[var(--apple-label)]">
            {standupStrings.yesterday.bucketCount({
              label: standupStrings.yesterday.addedAfterCompletion(),
              count: data.addedAfterCompletion.length
            })}
          </h4>
          <ul className="flex flex-col gap-2.5">
            {data.addedAfterCompletion.map((row) => (
              <li
                key={row.allocationId ?? `${row.memberId}:${row.taskId}`}
                data-testid={`yesterday-added-row-${row.taskKey ?? row.taskId}`}
                className="flex flex-wrap items-center gap-3 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-background p-3 text-[12.5px]"
              >
                <span className="font-apple-mono text-[12px] text-[var(--apple-tertiary-label)]">
                  {row.taskKey ?? row.taskId}
                </span>
                <span className="min-w-0 flex-1 truncate text-[var(--apple-label)]">{row.title}</span>
                <span
                  aria-label={row.memberName}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--apple-tertiary-fill)] text-[10px] font-semibold text-[var(--apple-secondary-label)]"
                >
                  {initialsOf(row.memberName)}
                </span>
                <span data-testid="added-current-status" className="shrink-0 text-[var(--apple-secondary-label)]">
                  {standupStrings.yesterday.currentStatus()} {row.currentStatus}
                </span>
                <span data-testid="planned" className="font-apple-mono shrink-0 tabular-nums text-[var(--apple-label)]">
                  {formatMinutesAsHours(row.plannedMinutes, { locale })}
                </span>
                <span data-testid="logged" className="font-apple-mono shrink-0 tabular-nums text-[var(--apple-label)]">
                  {formatMinutesAsHours(row.loggedMinutes, { locale })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function hoursText(value: Minutes): string {
  return String(Number((value / 60).toFixed(2)))
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export type { YesterdayRow, Minutes }
