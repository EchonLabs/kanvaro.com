/**
 * Shapes the Stand-up Analytics response (§15.15) for one of its two
 * audiences, from inputs the loader (`analytics-service.ts`) has already read.
 *
 * The split is NFR-13 and decision D2: individual estimate debt, accuracy and
 * override justifications are visible to the PM and admins only (callers
 * holding `standup:view_debt`); everyone else with `standup:view_analytics`
 * sees team aggregates. The aggregate payload is **built from scratch**, never
 * copied from the full one and then pruned, so a field added to the full view
 * later cannot leak into the aggregate one by default.
 *
 * Pure and Mongoose-free: the page imports these types.
 */
import type { LedgerEntryType } from '@/models/EstimateDebtLedger'

import {
  ageHistogram,
  chronicUnderAllocation,
  computeAccuracy,
  computeDayHealth,
  computeDebtTrend,
  computeDiscipline,
  debtChange,
  spillChains,
  type AccuracyRow,
  type AgeBucket,
  type AnalyticsView,
  type DayHealth,
  type DebtTrendPoint,
  type Discipline,
  type MemberAccuracyRow,
  type SpillChain
} from './analytics'

export type { AnalyticsView }

/** Stand-up states in which the meeting actually ran, so its snapshot is a real plan. */
const RAN_STATUSES = ['In_Progress', 'Completed', 'Reopened']
/** States of a day that has happened, ran or not — the debt trend's x-axis. */
const ELAPSED_STATUSES = [...RAN_STATUSES, 'Missed']

export interface AnalyticsInputs {
  sprint: {
    id: string
    name: string
    projectId: string
    projectName: string
    startDate: string | null
    endDate: string | null
  }
  standups: {
    standupId: string
    standupDate: string
    dayNumber: number
    status: string
    wasBackfilled: boolean
    actualDurationMinutes?: number
    /** Each member's effective capacity from the frozen snapshot; `null` when none was built. */
    capacity: { memberId: string; effectiveMinutes: number }[] | null
  }[]
  allocations: {
    allocationId: string
    standupId: string
    memberId: string
    taskId: string
    plannedMinutes: number
    carryChainRoot?: string
    /** False for excluded-from-capacity and after-completion allocations. */
    countsTowardCapacity: boolean
  }[]
  /** Completed tasks, one row per (task, member), latest variance figures. */
  completedTasks: {
    taskId: string
    memberId: string
    originalEstimateMinutes: number
    totalLoggedMinutesOnTask: number
  }[]
  /** Latest variance figures per task, for spill chains. */
  taskTotals: { taskId: string; originalEstimateMinutes: number; totalLoggedMinutesOnTask: number }[]
  ledger: { memberId: string; entryType: LedgerEntryType; minutes: number; standupDate: string }[]
  overrides: {
    overrideId: string
    standupId: string
    standupDate: string
    type: string
    reasonCode: string
    justification: string
    affectedMemberIds: string[]
    issuedAt: string
  }[]
  /** Open items only. */
  carryForward: { itemId: string; taskId?: string; memberId?: string; ageInStandups: number; status: string }[]
  tasks: Record<string, { key?: string; title: string; assigneeId?: string }>
  memberNames: Record<string, string>
}

export interface AnalyticsHeadline {
  onTimeRate: number | null
  missedCount: number
  outstandingDebtMinutes: number
  debtChangeMinutes7d: number
  overrideCount: number
  topOverrideType: string | null
  chronicCarryForwardCount: number
}

export interface DisciplineRow {
  standupId: string
  standupDate: string
  dayNumber: number
  status: string
  backfilled: boolean
  durationMinutes: number | null
}

interface SharedPayload {
  sprint: AnalyticsInputs['sprint']
  headline: AnalyticsHeadline
  allocationHealth: DayHealth[]
  debtTrend: DebtTrendPoint[]
  ageing: { buckets: AgeBucket[]; chronicCount: number }
  discipline: Discipline & { standups: DisciplineRow[] }
  overrideCountsByType: Record<string, number>
  overrideCountsByReason: Record<string, number>
}

export interface TaskSpillChain extends SpillChain {
  taskKey?: string
  title: string
}

export interface AgeingItem {
  itemId: string
  taskKey?: string
  title?: string
  ageInStandups: number
  status: string
}

export interface OverrideRow {
  overrideId: string
  standupId: string
  standupDate: string
  type: string
  reasonCode: string
  justification: string
  memberNames: string[]
  issuedAt: string
}

export interface FullAnalyticsPayload extends SharedPayload {
  view: 'full'
  accuracy: { team: AccuracyRow; members: (MemberAccuracyRow & { name: string })[] }
  overrides: OverrideRow[]
  chronicMembers: { memberId: string; name: string; count: number }[]
  spillChains: (TaskSpillChain & { assigneeName?: string })[]
  ageingItems: (AgeingItem & { memberName?: string })[]
}

export interface AggregateAnalyticsPayload extends SharedPayload {
  view: 'aggregate'
  accuracy: { team: AccuracyRow }
  chronicMemberCount: number
  spillChains: TaskSpillChain[]
  ageingItems: AgeingItem[]
}

export type AnalyticsPayload = FullAnalyticsPayload | AggregateAnalyticsPayload

function countBy<T>(rows: readonly T[], key: (row: T) => string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) counts[key(row)] = (counts[key(row)] ?? 0) + 1
  return counts
}

function largest(counts: Record<string, number>): string | null {
  let best: string | null = null
  for (const [key, count] of Object.entries(counts)) {
    if (best === null || count > counts[best]) best = key
  }
  return best
}

function allocationHealthFor(inputs: AnalyticsInputs): DayHealth[] {
  return inputs.standups
    .filter((standup) => standup.capacity !== null && RAN_STATUSES.includes(standup.status))
    .sort((a, b) => a.standupDate.localeCompare(b.standupDate))
    .map((standup) => {
      const allocated = new Map<string, number>()
      for (const allocation of inputs.allocations) {
        if (allocation.standupId !== standup.standupId || !allocation.countsTowardCapacity) continue
        allocated.set(allocation.memberId, (allocated.get(allocation.memberId) ?? 0) + allocation.plannedMinutes)
      }

      // A member allocated work but missing from the snapshot still counts —
      // their whole allocation is over capacity, not invisible.
      const memberIds = new Set<string>()
      for (const row of standup.capacity ?? []) memberIds.add(row.memberId)
      allocated.forEach((_minutes, memberId) => memberIds.add(memberId))
      const effective = new Map((standup.capacity ?? []).map((row) => [row.memberId, row.effectiveMinutes]))

      return computeDayHealth({
        standupId: standup.standupId,
        standupDate: standup.standupDate,
        dayNumber: standup.dayNumber,
        members: Array.from(memberIds).map((memberId) => ({
          memberId,
          effectiveMinutes: effective.get(memberId) ?? 0,
          allocatedMinutes: allocated.get(memberId) ?? 0
        }))
      })
    })
}

function sharedPayload(inputs: AnalyticsInputs): SharedPayload {
  const standups = [...inputs.standups].sort((a, b) => a.standupDate.localeCompare(b.standupDate))

  const debtTrend = computeDebtTrend(
    inputs.ledger,
    standups.filter((standup) => ELAPSED_STATUSES.includes(standup.status)).map((standup) => standup.standupDate)
  )
  const discipline = computeDiscipline(standups)
  const ageing = ageHistogram(inputs.carryForward.map((item) => item.ageInStandups))
  const overrideCountsByType = countBy(inputs.overrides, (row) => row.type)

  return {
    sprint: { ...inputs.sprint },
    headline: {
      onTimeRate: discipline.onTimeRate,
      missedCount: discipline.missedCount,
      outstandingDebtMinutes: debtTrend.length > 0 ? debtTrend[debtTrend.length - 1].outstandingMinutes : 0,
      debtChangeMinutes7d: debtChange(debtTrend),
      overrideCount: inputs.overrides.length,
      topOverrideType: largest(overrideCountsByType),
      chronicCarryForwardCount: ageing.chronicCount
    },
    allocationHealth: allocationHealthFor(inputs),
    debtTrend,
    ageing,
    discipline: {
      ...discipline,
      standups: standups.map((standup) => ({
        standupId: standup.standupId,
        standupDate: standup.standupDate,
        dayNumber: standup.dayNumber,
        status: standup.status,
        backfilled: standup.wasBackfilled,
        durationMinutes: standup.actualDurationMinutes ?? null
      }))
    },
    overrideCountsByType,
    overrideCountsByReason: countBy(inputs.overrides, (row) => row.reasonCode)
  }
}

function taskChains(inputs: AnalyticsInputs): SpillChain[] {
  return spillChains(
    inputs.allocations.map((allocation) => ({
      allocationId: allocation.allocationId,
      carryChainRoot: allocation.carryChainRoot,
      taskId: allocation.taskId,
      standupId: allocation.standupId
    })),
    new Map(inputs.taskTotals.map((row) => [row.taskId, row]))
  )
}

function ageingItem(inputs: AnalyticsInputs, item: AnalyticsInputs['carryForward'][number]): AgeingItem {
  const task = item.taskId ? inputs.tasks[item.taskId] : undefined
  return {
    itemId: item.itemId,
    taskKey: task?.key,
    title: task?.title,
    ageInStandups: item.ageInStandups,
    status: item.status
  }
}

const byAgeDescending = (a: { ageInStandups: number }, b: { ageInStandups: number }) =>
  b.ageInStandups - a.ageInStandups

export function buildAnalyticsPayload(inputs: AnalyticsInputs, view: AnalyticsView): AnalyticsPayload {
  const shared = sharedPayload(inputs)
  const accuracy = computeAccuracy(inputs.completedTasks)
  const chains = taskChains(inputs)
  const task = (taskId: string) => inputs.tasks[taskId]

  if (view === 'aggregate') {
    return {
      ...shared,
      view: 'aggregate',
      accuracy: { team: accuracy.team },
      chronicMemberCount: chronicUnderAllocation(inputs.overrides).length,
      spillChains: chains.map((chain) => ({
        ...chain,
        taskKey: task(chain.taskId)?.key,
        title: task(chain.taskId)?.title ?? ''
      })),
      ageingItems: inputs.carryForward.map((item) => ageingItem(inputs, item)).sort(byAgeDescending)
    }
  }

  const nameOf = (memberId: string) => inputs.memberNames[memberId] ?? 'Unknown member'

  return {
    ...shared,
    view: 'full',
    accuracy: {
      team: accuracy.team,
      members: accuracy.members.map((row) => ({ ...row, name: nameOf(row.memberId) }))
    },
    overrides: [...inputs.overrides]
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
      .map((row) => ({
        overrideId: row.overrideId,
        standupId: row.standupId,
        standupDate: row.standupDate,
        type: row.type,
        reasonCode: row.reasonCode,
        justification: row.justification,
        memberNames: row.affectedMemberIds.map(nameOf),
        issuedAt: row.issuedAt
      })),
    chronicMembers: chronicUnderAllocation(inputs.overrides).map((row) => ({ ...row, name: nameOf(row.memberId) })),
    spillChains: chains.map((chain) => {
      const assigneeId = task(chain.taskId)?.assigneeId
      return {
        ...chain,
        taskKey: task(chain.taskId)?.key,
        title: task(chain.taskId)?.title ?? '',
        assigneeName: assigneeId ? nameOf(assigneeId) : undefined
      }
    }),
    ageingItems: inputs.carryForward
      .map((item) => ({
        ...ageingItem(inputs, item),
        memberName: item.memberId ? nameOf(item.memberId) : undefined
      }))
      .sort(byAgeDescending)
  }
}
