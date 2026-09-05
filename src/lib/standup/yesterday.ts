/**
 * Panel 2's four buckets (spec §10.2 step 2 — RUN-9, RUN-12).
 *
 * "Yesterday" always means **the previous stand-up in this sprint**, never the
 * previous calendar date: after a weekend, yesterday is Friday. That
 * resolution lives in `yesterday-service.ts`; this module is the pure
 * partition, so the bucket rules can be tested without a database.
 *
 * **All four buckets are always returned, empty ones included.** A PM who sees
 * three headings cannot tell "nothing is blocked" from "the blocked bucket did
 * not render", and the difference matters at 09:05 with eight people waiting.
 *
 * The one rule worth stating twice: a row with zero logged hours is only
 * `not_started` if its **status did not move**. A task somebody advanced
 * without logging time belongs in `in_progress` with a warning — the same
 * distinction the classifier draws between V7 and V12, applied to the same
 * facts, so the two panels can never disagree about one row.
 */
import type { TaskStatusSets } from './variance'
import type { Minutes } from './minutes'

export type YesterdayBucket = 'completed' | 'in_progress' | 'not_started' | 'blocked'

/** RUN-9's order. Fixed: it runs from "done" to "stuck", which is how a PM reads it. */
export const YESTERDAY_BUCKETS: YesterdayBucket[] = [
  'completed',
  'in_progress',
  'not_started',
  'blocked'
]

export interface YesterdayRow {
  /** Absent on an unplanned row (E39) — there was no allocation to carry it. */
  allocationId?: string
  taskId: string
  taskKey?: string
  title: string
  memberId: string
  memberName: string
  previousStatus: string
  currentStatus: string
  plannedMinutes: Minutes
  loggedMinutes: Minutes
  dayVarianceMinutes: Minutes
  remainingEstimateMinutes: Minutes
  /** RUN-12's age badge. 1 means it was planned for the first time yesterday. */
  ageInStandups: number
  /** E39 — time logged against a task nobody planned for this member. */
  unplanned: boolean
}

export interface BucketedRows {
  bucket: YesterdayBucket
  rows: YesterdayRow[]
}

const includesStatus = (statuses: readonly string[], status: string) =>
  statuses.some((candidate) => candidate.toLowerCase() === status.toLowerCase())

/** RUN-9. Every row lands in exactly one bucket, and every bucket is returned. */
export function partitionYesterday(input: {
  rows: readonly YesterdayRow[]
  statusSets: TaskStatusSets
}): BucketedRows[] {
  const byBucket = new Map<YesterdayBucket, YesterdayRow[]>(
    YESTERDAY_BUCKETS.map((bucket) => [bucket, []])
  )

  for (const row of input.rows) {
    byBucket.get(bucketOf(row, input.statusSets))!.push(row)
  }

  return YESTERDAY_BUCKETS.map((bucket) => ({ bucket, rows: byBucket.get(bucket)! }))
}

export function bucketOf(row: YesterdayRow, statusSets: TaskStatusSets): YesterdayBucket {
  // Blocked outranks everything: whatever else happened, the blocker is the
  // thing the stand-up has to deal with.
  if (includesStatus(statusSets.blocked, row.currentStatus)) return 'blocked'
  if (includesStatus(statusSets.done, row.currentStatus)) return 'completed'

  // RUN-9's third bucket is defined by *both* conditions — status unchanged
  // AND no hours logged. Either one alone means work happened.
  if (row.loggedMinutes === 0 && row.currentStatus === row.previousStatus) {
    return 'not_started'
  }

  return 'in_progress'
}

/** Bucket counts for the headings, computed once so the UI cannot disagree. */
export function bucketCounts(buckets: readonly BucketedRows[]): Record<YesterdayBucket, number> {
  const counts = { completed: 0, in_progress: 0, not_started: 0, blocked: 0 }
  for (const entry of buckets) counts[entry.bucket] = entry.rows.length
  return counts
}
