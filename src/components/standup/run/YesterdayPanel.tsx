'use client'

import { useState } from 'react'

import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import type { BucketedRows, YesterdayBucket, YesterdayRow } from '@/lib/standup/yesterday'

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
  openTask(taskId: string): void
  reviseEstimate(row: YesterdayRow): void
}

export interface YesterdayPanelProps {
  data: { buckets: BucketedRows[]; previousStandupId?: string; previousStandupDate?: string }
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
  const [toast, setToast] = useState<string | null>(null)

  const hasYesterday = Boolean(data.previousStandupId)

  const statusOf = (row: YesterdayRow) => optimisticStatus[row.taskId] ?? row.currentStatus

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

  return (
    <section id="panel-2" aria-labelledby="panel-2-heading" className="flex flex-col gap-3">
      <h3 id="panel-2-heading" className="text-sm font-semibold">
        {standupStrings.yesterday.title()}
      </h3>

      {toast && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {toast}
        </p>
      )}

      {!hasYesterday && (
        <p className="text-sm text-muted-foreground">
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
                className="flex items-center gap-2 text-left text-sm font-medium"
              >
                <h4>{standupStrings.yesterday.bucketCount({ label: heading, count: bucket.rows.length })}</h4>
              </button>

              {!isCollapsed && (
                <ul id={bodyId} className="flex flex-col gap-2">
                  {bucket.rows.length === 0 && (
                    <li className="text-xs text-muted-foreground">
                      {standupStrings.yesterday.emptyBucket()}
                    </li>
                  )}

                  {bucket.rows.map((row) => (
                    <li
                      key={row.allocationId ?? `${row.memberId}:${row.taskId}`}
                      data-testid={`yesterday-row-${row.taskKey ?? row.taskId}`}
                      className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{row.taskKey ?? row.taskId}</span>
                      <span className="text-muted-foreground">{row.title}</span>
                      <span aria-label={row.memberName} className="text-xs text-muted-foreground">
                        {initialsOf(row.memberName)}
                      </span>

                      <span data-testid="previous-status" className="text-xs text-muted-foreground">
                        {standupStrings.yesterday.previousStatus()} {row.previousStatus}
                      </span>

                      <label className="sr-only" htmlFor={`status-${row.taskId}`}>
                        {`Status for ${row.taskKey ?? row.taskId}`}
                      </label>
                      <select
                        id={`status-${row.taskId}`}
                        data-testid="current-status"
                        aria-label={`Status for ${row.taskKey ?? row.taskId}`}
                        value={statusOf(row)}
                        disabled={disabled}
                        onChange={(event) => changeStatus(row, event.target.value)}
                        className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                      >
                        {statusOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>

                      <span data-testid="planned">
                        {formatMinutesAsHours(row.plannedMinutes, { locale })}
                      </span>
                      <span data-testid="logged">
                        {formatMinutesAsHours(row.loggedMinutes, { locale })}
                      </span>
                      <span data-testid="day-variance">
                        {formatMinutesAsHours(row.dayVarianceMinutes, { locale, signed: true })}
                      </span>
                      <span data-testid="remaining">
                        {formatMinutesAsHours(row.remainingEstimateMinutes, { locale })}
                      </span>

                      {row.ageInStandups > 1 && (
                        <span data-testid="age-badge" className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {standupStrings.yesterday.ageBadge({ standups: row.ageInStandups })}
                        </span>
                      )}

                      {row.unplanned && (
                        <span
                          title={standupStrings.yesterday.unplannedHint()}
                          className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
                        >
                          {standupStrings.yesterday.unplannedBadge()}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => api.reviseEstimate(row)}
                        disabled={disabled}
                        className="text-xs underline"
                      >
                        {standupStrings.variance.reviseTitle()}
                      </button>

                      <button
                        type="button"
                        onClick={() => api.openTask(row.taskId)}
                        className="text-xs underline"
                      >
                        {`Open ${row.taskKey ?? row.taskId}`}
                      </button>
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
                  className="self-start rounded-md border border-border px-2 py-1 text-xs"
                >
                  {standupStrings.yesterday.markAllConfirmed()}
                </button>
              )}
            </div>
          )
        })}
    </section>
  )
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
