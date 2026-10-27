/**
 * The Stand-up Analytics screen's arithmetic (§15.15), kept pure so every
 * widget's number is unit-testable without a database.
 *
 * Nothing here re-derives a rule the module already owns: debt goes through
 * `computeDebtPosition` (VAR-6), accuracy through `estimationAccuracy`
 * (VAR-17), the chronic carry-forward band through `CHRONIC_AGE_THRESHOLD`,
 * and chronic under-allocation uses the same three-override rule as
 * `countChronicUnderAllocationMembers` (OVR-9 / N7), so this screen can never
 * disagree with the run screen or the oversight rollup about the same sprint.
 *
 * No Mongoose import: the analytics page imports these types into the browser
 * bundle, and a model import would drag the database driver in with them.
 */
import type { LedgerEntryType } from '@/models/EstimateDebtLedger'

import { CHRONIC_AGE_THRESHOLD } from './carry-forward'
import { computeDebtPosition, estimationAccuracy } from './debt'
import { minutes, type Minutes } from './minutes'

export type AnalyticsView = 'full' | 'aggregate'

export interface DayHealth {
  standupId: string
  standupDate: string
  dayNumber: number
  effectiveMinutes: number
  /** Allocated hours that fit inside capacity. */
  fullMinutes: number
  /** Capacity left unallocated. */
  underMinutes: number
  /** Allocated hours beyond capacity. */
  overMinutes: number
}

/**
 * One stand-up day's allocation health, summed across members.
 *
 * Per member rather than on the day's totals: one member 60 minutes over and
 * another 60 under nets to "full" in aggregate, which is exactly the
 * imbalance this widget exists to show.
 */
export function computeDayHealth(input: {
  standupId: string
  standupDate: string
  dayNumber: number
  members: { memberId: string; effectiveMinutes: number; allocatedMinutes: number }[]
}): DayHealth {
  let effectiveMinutes = 0
  let fullMinutes = 0
  let underMinutes = 0
  let overMinutes = 0

  for (const member of input.members) {
    effectiveMinutes += member.effectiveMinutes
    fullMinutes += Math.min(member.allocatedMinutes, member.effectiveMinutes)
    underMinutes += Math.max(0, member.effectiveMinutes - member.allocatedMinutes)
    overMinutes += Math.max(0, member.allocatedMinutes - member.effectiveMinutes)
  }

  return {
    standupId: input.standupId,
    standupDate: input.standupDate,
    dayNumber: input.dayNumber,
    effectiveMinutes,
    fullMinutes,
    underMinutes,
    overMinutes
  }
}

export interface DebtTrendPoint {
  date: string
  outstandingMinutes: number
}

/**
 * The sprint's total outstanding debt as it stood at the end of each date.
 *
 * Summed per member, each floored at zero, the same way the oversight rollup
 * sums `MemberSprintDebtSummary` — a team-level balance would let one
 * member's surplus (E42, never negative debt) cancel another member's debt.
 */
export function computeDebtTrend(
  entries: { memberId: string; entryType: LedgerEntryType; minutes: number; standupDate: string }[],
  dates: string[]
): DebtTrendPoint[] {
  return [...dates].sort().map((date) => {
    const byMember = new Map<string, { entryType: LedgerEntryType; minutes: Minutes }[]>()
    for (const entry of entries) {
      if (entry.standupDate > date) continue
      const list = byMember.get(entry.memberId) ?? []
      list.push({ entryType: entry.entryType, minutes: minutes(entry.minutes) })
      byMember.set(entry.memberId, list)
    }

    let outstandingMinutes = 0
    byMember.forEach((memberEntries) => {
      outstandingMinutes += computeDebtPosition(memberEntries).outstandingMinutes
    })

    return { date, outstandingMinutes }
  })
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How far debt moved over the last `days` calendar days: the latest point
 * against the last point on or before `days` earlier, or against zero when
 * the sprint is younger than that.
 */
export function debtChange(trend: DebtTrendPoint[], days = 7): number {
  if (trend.length === 0) return 0
  const latest = trend[trend.length - 1]
  const cutoff = new Date(new Date(`${latest.date}T00:00:00Z`).getTime() - days * DAY_MS)
    .toISOString()
    .slice(0, 10)
  const earlier = trend.filter((point) => point.date <= cutoff)
  const baseline = earlier.length > 0 ? earlier[earlier.length - 1].outstandingMinutes : 0
  return latest.outstandingMinutes - baseline
}

export interface AccuracyRow {
  taskCount: number
  estimatedMinutes: number
  loggedMinutes: number
  /** `null`, never zero, when there is nothing to divide by (see `estimationAccuracy`). */
  percent: number | null
}

export interface MemberAccuracyRow extends AccuracyRow {
  memberId: string
}

type AccuracyInput = {
  taskId: string
  memberId: string
  originalEstimateMinutes: number
  totalLoggedMinutesOnTask: number
}

function accuracyRow(rows: readonly AccuracyInput[]): AccuracyRow {
  const percent = estimationAccuracy(
    rows.map((row) => ({
      originalEstimateMinutes: minutes(row.originalEstimateMinutes),
      totalLoggedMinutesOnTask: minutes(row.totalLoggedMinutesOnTask)
    }))
  )

  return {
    taskCount: rows.length,
    estimatedMinutes: rows.reduce((sum, row) => sum + row.originalEstimateMinutes, 0),
    loggedMinutes: rows.reduce((sum, row) => sum + row.totalLoggedMinutesOnTask, 0),
    percent: percent ?? null
  }
}

/** Estimated versus logged for completed tasks. Rows must already be one per (task, member). */
export function computeAccuracy(rows: AccuracyInput[]): {
  team: AccuracyRow
  members: MemberAccuracyRow[]
} {
  const byMember = new Map<string, AccuracyInput[]>()
  for (const row of rows) {
    const list = byMember.get(row.memberId) ?? []
    list.push(row)
    byMember.set(row.memberId, list)
  }

  return {
    team: accuracyRow(rows),
    members: Array.from(byMember).map(([memberId, memberRows]) => ({ memberId, ...accuracyRow(memberRows) }))
  }
}

export interface AgeBucket {
  label: string
  min: number
  max: number | null
  count: number
  chronic: boolean
}

const AGE_BUCKETS: readonly { label: string; min: number; max: number | null }[] = [
  { label: '1', min: 1, max: 1 },
  { label: '2', min: 2, max: 2 },
  { label: '3', min: 3, max: 3 },
  { label: '4-5', min: 4, max: 5 },
  { label: '6-7', min: 6, max: CHRONIC_AGE_THRESHOLD - 1 },
  { label: `${CHRONIC_AGE_THRESHOLD}+`, min: CHRONIC_AGE_THRESHOLD, max: null }
]

/** Open carry-forward items by age in stand-ups, with the chronic band (E63) flagged. */
export function ageHistogram(ages: number[]): { buckets: AgeBucket[]; chronicCount: number } {
  const buckets = AGE_BUCKETS.map((bucket) => ({
    ...bucket,
    count: ages.filter((age) => age >= bucket.min && (bucket.max === null || age <= bucket.max)).length,
    chronic: bucket.min >= CHRONIC_AGE_THRESHOLD
  }))

  return { buckets, chronicCount: ages.filter((age) => age >= CHRONIC_AGE_THRESHOLD).length }
}

/** The same threshold `countChronicUnderAllocationMembers` uses (OVR-9). */
export const CHRONIC_UNDER_ALLOCATION_THRESHOLD = 3

export function chronicUnderAllocation(
  overrides: { type: string; affectedMemberIds: string[] }[],
  threshold: number = CHRONIC_UNDER_ALLOCATION_THRESHOLD
): { memberId: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const override of overrides) {
    if (override.type !== 'under_allocation') continue
    for (const memberId of override.affectedMemberIds) {
      counts.set(memberId, (counts.get(memberId) ?? 0) + 1)
    }
  }

  return Array.from(counts)
    .filter(([, count]) => count >= threshold)
    .map(([memberId, count]) => ({ memberId, count }))
    .sort((a, b) => b.count - a.count)
}

export interface Discipline {
  completedCount: number
  missedCount: number
  /** 0–100; `null` when no stand-up has yet completed or been missed. */
  onTimeRate: number | null
  medianDurationMinutes: number | null
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/**
 * On time means completed live: a backfilled stand-up was completed, but
 * after the fact, which is the discipline lapse this widget measures.
 * Skipped, cancelled and not-yet-run days are neither on time nor missed.
 */
export function computeDiscipline(
  standups: { status: string; wasBackfilled: boolean; actualDurationMinutes?: number }[]
): Discipline {
  const completed = standups.filter((standup) => standup.status === 'Completed')
  const missedCount = standups.filter((standup) => standup.status === 'Missed').length
  const onTime = completed.filter((standup) => !standup.wasBackfilled).length
  const measured = completed.length + missedCount

  return {
    completedCount: completed.length,
    missedCount,
    onTimeRate: measured === 0 ? null : (onTime / measured) * 100,
    medianDurationMinutes: median(
      completed
        .map((standup) => standup.actualDurationMinutes)
        .filter((value): value is number => typeof value === 'number')
    )
  }
}

export interface SpillChain {
  taskId: string
  chainLength: number
  originalEstimateMinutes: number
  loggedMinutes: number
}

/**
 * The longest-carried tasks. A chain is every allocation sharing a
 * `carryChainRoot` (the root itself has none), measured in distinct stand-ups
 * so a pair allocation on one day is not counted as a spill.
 */
export function spillChains(
  allocations: { allocationId: string; carryChainRoot?: string; taskId: string; standupId: string }[],
  taskTotals: Map<string, { originalEstimateMinutes: number; totalLoggedMinutesOnTask: number }>,
  limit = 10
): SpillChain[] {
  const chains = new Map<string, { taskId: string; standups: Set<string> }>()
  for (const allocation of allocations) {
    const key = allocation.carryChainRoot ?? allocation.allocationId
    const chain = chains.get(key) ?? { taskId: allocation.taskId, standups: new Set<string>() }
    chain.standups.add(allocation.standupId)
    chains.set(key, chain)
  }

  return Array.from(chains.values())
    .filter((chain) => chain.standups.size >= 2)
    .map((chain) => {
      const totals = taskTotals.get(chain.taskId)
      return {
        taskId: chain.taskId,
        chainLength: chain.standups.size,
        originalEstimateMinutes: totals?.originalEstimateMinutes ?? 0,
        loggedMinutes: totals?.totalLoggedMinutesOnTask ?? 0
      }
    })
    .sort((a, b) => b.chainLength - a.chainLength || b.loggedMinutes - a.loggedMinutes)
    .slice(0, limit)
}
