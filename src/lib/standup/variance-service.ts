/**
 * The variance engine's writer (spec §12.2–§12.4, AC-13..AC-19).
 *
 * **The classifier runs twice, over identical inputs.** VAR-2 says
 * classification happens when the next stand-up completes, but AC-13 requires
 * the panel to show the numbers when the board is built and AC-15/16 require
 * capacity to already reflect the debt. So `loadVariancePanel` classifies
 * provisionally, for display, and `classifyAndPost` classifies again at
 * completion and writes. Both take their inputs from
 * `assembleClassifyInputs()` — one function, one set of facts — which is what
 * makes "what the PM saw at 09:15 is what the ledger recorded at 09:30" a
 * property of the structure rather than a hope.
 *
 * **Idempotency is the safety mechanism, not transactions.** The platform does
 * not guarantee multi-document transactions, so `classifyAndPost` is written to
 * be safely re-runnable (VAR-3): ledger entries are keyed `(allocation,
 * entryType)`, variance rows are keyed on `allocation`, and an entry that
 * already exists is skipped rather than retried. A crashed half-run is
 * completed by running it again; nothing is ever posted twice.
 *
 * The order inside `classifyAndPost` follows from that. Accruals and credits
 * are posted first and settlements second, because a settlement is sized from
 * the debt position *including* today's accruals — that is the debt the board
 * showed and the debt the reduce policy took out of today's capacity.
 */
import { AllocationVariance } from '@/models/AllocationVariance'
import { EstimateDebtLedger, type LedgerEntryType } from '@/models/EstimateDebtLedger'
import { User } from '@/models/User'

import { recordAudit, type AuditActor } from './audit'
import { loadCapacityContext } from './capacity-context'
import { computeDebtPosition, settlementMinutes, type DebtPosition } from './debt'
import {
  assembleClassifyInputs,
  loadDebtPositions,
  type AssembledInputs
} from './debt-position'
import { StandupError } from './errors'
import { minutes, ZERO_MINUTES, type Minutes } from './minutes'
import { refreshDebtSummary } from './debt-summary'
import { standupStrings } from './strings'
import { classifyAll, type ClassifyInput, type VarianceComputation } from './variance'

export interface VarianceRow extends VarianceComputation {
  taskId: string
  taskKey?: string
  title: string
  memberId: string
  memberName: string
  plannedMinutes: Minutes
  loggedMinutesOnDay: Minutes
  originalEstimateMinutes: Minutes
  totalLoggedMinutesOnTask: Minutes
  remainingBeforeMinutes: Minutes
  /** VAR-14 — how many stand-ups this task has spilled across. */
  spillChainLength: number
  chronicSpill: boolean
  /** Already answered: a revision or a reason has been recorded on this row. */
  revisedRemainingMinutes?: Minutes
  notStartedReason?: string
  /** §15.8.5's plain-language sentence. A requirement, not decoration. */
  explanation: string
}

/** VAR-13's per-member strip. */
export interface MemberVarianceRollUp {
  memberId: string
  memberName: string
  plannedMinutes: Minutes
  loggedMinutesOnDay: Minutes
  dayVarianceMinutes: Minutes
  outstandingDebtMinutes: Minutes
  surplusMinutes: Minutes
  needingRevision: number
}

export interface VariancePanel {
  standupId: string
  /** The stand-up being classified — the previous one in the sprint. */
  previousStandupId?: string
  previousStandupDate?: string
  rows: VarianceRow[]
  members: MemberVarianceRollUp[]
  /** True once `classifyAndPost` has run for this stand-up. */
  persisted: boolean
  computedAt: string
}

/** VAR-14: three stand-ups or more is chronic. */
export const CHRONIC_SPILL_THRESHOLD = 3

/**
 * Panel 3 as the server sees it, computed without writing anything.
 *
 * Safe to call on every board load and on every poll: it reads, classifies in
 * memory, and returns. Nothing here mutates.
 */
export async function loadVariancePanel(standupId: string): Promise<VariancePanel> {
  const assembled = await assembleClassifyInputs(standupId)
  const computations = classifyAll(assembled.inputs)

  const [positions, persistedRows, names] = await Promise.all([
    loadDebtPositions(standupId),
    AllocationVariance.find({
      allocation: { $in: assembled.inputs.map((row) => row.allocationId) }
    }).lean() as Promise<any[]>,
    resolveNames(assembled)
  ])

  const persistedByAllocation = new Map(
    persistedRows.map((row) => [String(row.allocation), row])
  )

  const rows = computations.map((computed) => {
    const input = inputFor(assembled, computed.allocationId)
    const allocation = assembled.context.allocationById.get(computed.allocationId)
    const task = assembled.context.taskById.get(input.taskId)
    const persistedRow = persistedByAllocation.get(computed.allocationId)

    const spillChainLength = spillLengthOf(task, allocation)

    const rawRevision =
      allocation?.revisedRemainingMinutes ?? persistedRow?.revisedRemainingMinutes
    const answeredRevision = rawRevision === undefined ? undefined : minutes(rawRevision)
    const answeredReason = allocation?.notStartedReason ?? persistedRow?.notStartedReason

    return {
      ...computed,
      taskId: input.taskId,
      taskKey: task?.displayId,
      title: task?.title ?? '',
      memberId: input.memberId,
      memberName: names.get(input.memberId) ?? input.memberId,
      plannedMinutes: input.plannedMinutes,
      loggedMinutesOnDay: input.loggedMinutesOnDay,
      originalEstimateMinutes: input.originalEstimateMinutes,
      totalLoggedMinutesOnTask: input.totalLoggedMinutesOnTask,
      remainingBeforeMinutes: input.remainingBeforeMinutes,
      spillChainLength,
      chronicSpill: spillChainLength >= CHRONIC_SPILL_THRESHOLD,
      // The live allocation wins over the persisted row: a PM who revised the
      // estimate this morning must see their own answer, not the one frozen
      // when the row was written.
      ...(answeredRevision === undefined ? {} : { revisedRemainingMinutes: answeredRevision }),
      ...(answeredReason ? { notStartedReason: answeredReason } : {}),
      explanation: explain(computed, input)
    } as VarianceRow
  })

  return {
    standupId,
    ...(assembled.previousStandupId ? { previousStandupId: assembled.previousStandupId } : {}),
    ...(assembled.previousStandupDate
      ? { previousStandupDate: assembled.previousStandupDate }
      : {}),
    rows: sortRows(rows),
    members: rollUp(rows, positions, names, assembled),
    persisted: persistedRows.length > 0 && persistedRows.length === assembled.inputs.length,
    computedAt: new Date().toISOString()
  }
}

export interface ClassifyAndPostResult {
  classified: number
  entriesPosted: number
  skipped: number
}

/**
 * Persists classification for the previous stand-up and posts its ledger
 * entries. Idempotent (VAR-3): a second run writes nothing and reports what it
 * skipped. Phase 10's completion saga calls this.
 */
export async function classifyAndPost(input: {
  standupId: string
  actor: { userId: string }
}): Promise<ClassifyAndPostResult> {
  const assembled = await assembleClassifyInputs(input.standupId)
  if (!assembled.previousStandupId || assembled.inputs.length === 0) {
    return { classified: 0, entriesPosted: 0, skipped: 0 }
  }

  const standup = assembled.context.standup
  const previous = assembled.context.previousStandup
  const computations = classifyAll(assembled.inputs)

  const scope = {
    project: standup.project,
    sprint: standup.sprint,
    organization: standup.organization,
    sourceStandup: standup._id,
    createdBy: input.actor.userId
  }

  let entriesPosted = 0
  let skipped = 0

  // 1 — accruals and credits, keyed by (allocation, entryType).
  for (const computed of computations) {
    const row = inputFor(assembled, computed.allocationId)
    if (computed.overrunMinutes > 0) {
      const posted = await postEntry({
        ...scope,
        member: row.memberId,
        entryType: 'accrual',
        minutes: computed.overrunMinutes,
        sourceAllocation: computed.allocationId
      })
      posted ? (entriesPosted += 1) : (skipped += 1)
    }
    if (computed.creditMinutes > 0) {
      const posted = await postEntry({
        ...scope,
        member: row.memberId,
        entryType: 'credit',
        minutes: computed.creditMinutes,
        sourceAllocation: computed.allocationId
      })
      posted ? (entriesPosted += 1) : (skipped += 1)
    }
  }

  // 2 — settlements, sized from the debt the board actually showed, which
  // includes step 1's entries. Under the absorb policy this posts nothing.
  const context = await loadCapacityContext(input.standupId, standup)
  const positions = await loadPersistedPositions(String(standup.sprint))
  const policy = assembled.context.settings?.overrunPolicy ?? 'absorb'

  for (const memberId of context.memberIds) {
    const position = positions.get(memberId)
    if (!position || position.outstandingMinutes <= 0) continue

    const breakdown = context.computeFor(memberId, {
      outstandingDebtMinutes: position.outstandingMinutes
    })
    const settle = settlementMinutes({
      outstandingMinutes: position.outstandingMinutes,
      adjustedMinutes: breakdown.adjustedMinutes,
      policy
    })
    if (settle <= 0) continue

    const posted = await postEntry({
      ...scope,
      member: memberId,
      entryType: 'settlement',
      minutes: settle
    })
    posted ? (entriesPosted += 1) : (skipped += 1)
  }

  // 3 — the variance rows themselves.
  let classified = 0
  for (const computed of computations) {
    const row = inputFor(assembled, computed.allocationId)
    const written = await writeVarianceRow({
      computed,
      input: row,
      standup,
      previous,
      allocation: assembled.context.allocationById.get(computed.allocationId)
    })
    if (written) classified += 1
  }

  // 4 — refresh the read model for everybody this touched (DAT-5).
  const touched = new Set(assembled.inputs.map((row) => row.memberId))
  await Promise.all(
    Array.from(touched).map((memberId) =>
      refreshDebtSummary({
        projectId: String(standup.project),
        sprintId: String(standup.sprint),
        organizationId: String(standup.organization),
        memberId
      })
    )
  )

  await recordAudit({
    actor: userActor(input.actor),
    organizationId: String(standup.organization),
    projectId: String(standup.project),
    action: 'variance_computed',
    entityType: 'standup',
    entityId: String(standup._id),
    before: null,
    after: { classified, entriesPosted, skipped },
    context: {
      standupId: String(standup._id),
      previousStandupId: assembled.previousStandupId,
      date: standup.standupDate
    }
  })

  return { classified, entriesPosted, skipped }
}

/**
 * E40 — time logged retrospectively against a day whose stand-up already
 * completed.
 *
 * The variance row is recomputed and flagged, and the ledger is corrected by a
 * **compensating entry**, never by editing the original (DAT-4). The
 * compensating entry deliberately carries no `sourceAllocation`: that key is
 * already taken by the first accrual, and re-using it would collide with the
 * unique index that makes re-runs safe.
 */
export async function recomputeAfterCompletion(input: {
  standupId: string
  actor: { userId: string }
}): Promise<{ adjusted: VarianceRow[] }> {
  const assembled = await assembleClassifyInputs(input.standupId)
  if (assembled.inputs.length === 0) return { adjusted: [] }

  const standup = assembled.context.standup
  const computations = classifyAll(assembled.inputs)
  const existing = (await AllocationVariance.find({
    allocation: { $in: assembled.inputs.map((row) => row.allocationId) }
  }).lean()) as any[]
  const byAllocation = new Map(existing.map((row) => [String(row.allocation), row]))

  const names = await resolveNames(assembled)
  const adjusted: VarianceRow[] = []

  for (const computed of computations) {
    const previousRow = byAllocation.get(computed.allocationId)
    if (!previousRow) continue

    const row = inputFor(assembled, computed.allocationId)
    const loggedChanged = previousRow.loggedMinutesOnDay !== row.loggedMinutesOnDay
    if (!loggedChanged && previousRow.outcome === computed.outcome) continue

    await AllocationVariance.updateOne(
      { allocation: computed.allocationId },
      {
        $set: {
          loggedMinutesOnDay: row.loggedMinutesOnDay,
          dayVarianceMinutes: computed.dayVarianceMinutes,
          totalLoggedMinutesOnTask: row.totalLoggedMinutesOnTask,
          taskVarianceMinutes: computed.taskVarianceMinutes,
          remainingAfterMinutes: computed.remainingAfterMinutes,
          outcome: computed.outcome,
          overrunMinutes: computed.overrunMinutes,
          creditMinutes: computed.creditMinutes,
          recomputedAfterCompletion: true,
          computedAt: new Date()
        }
      }
    )

    // The difference between what was posted and what is now true, as its own
    // entry. Never an edit: yesterday's number was quoted in a meeting.
    const delta = computed.overrunMinutes - (previousRow.overrunMinutes ?? 0)
    if (delta !== 0) {
      await EstimateDebtLedger.create({
        project: standup.project,
        sprint: standup.sprint,
        organization: standup.organization,
        member: row.memberId,
        entryType: delta > 0 ? 'accrual' : 'credit',
        minutes: Math.abs(delta),
        sourceStandup: standup._id,
        reason: `Correction for allocation ${computed.allocationId} after time was logged retrospectively.`,
        createdBy: input.actor.userId
      })
    }

    adjusted.push({
      ...computed,
      taskId: row.taskId,
      taskKey: assembled.context.taskById.get(row.taskId)?.displayId,
      title: assembled.context.taskById.get(row.taskId)?.title ?? '',
      memberId: row.memberId,
      memberName: names.get(row.memberId) ?? row.memberId,
      plannedMinutes: row.plannedMinutes,
      loggedMinutesOnDay: row.loggedMinutesOnDay,
      originalEstimateMinutes: row.originalEstimateMinutes,
      totalLoggedMinutesOnTask: row.totalLoggedMinutesOnTask,
      remainingBeforeMinutes: row.remainingBeforeMinutes,
      spillChainLength: 0,
      chronicSpill: false,
      explanation: explain(computed, row)
    } as VarianceRow)
  }

  if (adjusted.length > 0) {
    const touched = new Set(adjusted.map((row) => row.memberId))
    await Promise.all(
      Array.from(touched).map((memberId) =>
        refreshDebtSummary({
          projectId: String(standup.project),
          sprintId: String(standup.sprint),
          organizationId: String(standup.organization),
          memberId
        })
      )
    )
  }

  return { adjusted }
}

// --- internals --------------------------------------------------------------

function inputFor(assembled: AssembledInputs, allocationId: string): ClassifyInput {
  const found = assembled.inputs.find((row) => row.allocationId === allocationId)
  if (!found) {
    throw new StandupError('NOT_FOUND', 'That allocation is not part of this classification.', {
      allocationId
    })
  }
  return found
}

/**
 * Posts one ledger entry, or reports that its key was already taken.
 *
 * The unique index is the authority on "already posted", not a prior read: two
 * completions racing would both read an empty ledger and both write.
 */
async function postEntry(entry: {
  project: unknown
  sprint: unknown
  organization: unknown
  member: string
  entryType: LedgerEntryType
  minutes: Minutes | number
  sourceStandup: unknown
  sourceAllocation?: string
  createdBy: string
}): Promise<boolean> {
  try {
    await EstimateDebtLedger.create(entry)
    return true
  } catch (error) {
    if (isDuplicateKey(error)) return false
    throw error
  }
}

async function writeVarianceRow(args: {
  computed: VarianceComputation
  input: ClassifyInput
  standup: any
  previous: any
  allocation: any
}): Promise<boolean> {
  const { computed, input, standup, previous, allocation } = args
  try {
    await AllocationVariance.create({
      allocation: computed.allocationId,
      standup: previous._id,
      computedAtStandup: standup._id,
      sprint: standup.sprint,
      member: input.memberId,
      task: input.taskId,
      project: standup.project,
      organization: standup.organization,
      plannedMinutes: input.plannedMinutes,
      loggedMinutesOnDay: input.loggedMinutesOnDay,
      dayVarianceMinutes: computed.dayVarianceMinutes,
      originalEstimateMinutes: input.originalEstimateMinutes,
      totalLoggedMinutesOnTask: input.totalLoggedMinutesOnTask,
      taskVarianceMinutes: computed.taskVarianceMinutes,
      remainingBeforeMinutes: input.remainingBeforeMinutes,
      remainingAfterMinutes: computed.remainingAfterMinutes,
      ...(allocation?.revisedRemainingMinutes === undefined
        ? {}
        : { revisedRemainingMinutes: allocation.revisedRemainingMinutes }),
      ...(allocation?.revisionReason ? { revisionReason: allocation.revisionReason } : {}),
      ...(allocation?.revisionDetail ? { revisionDetail: allocation.revisionDetail } : {}),
      ...(allocation?.notStartedReason
        ? { notStartedReason: allocation.notStartedReason }
        : {}),
      taskStatusAtClose: input.taskStatusAtClose,
      outcome: computed.outcome,
      overrunMinutes: computed.overrunMinutes,
      creditMinutes: computed.creditMinutes,
      sharedContribution: computed.sharedContribution,
      computedAt: new Date()
    })
    return true
  } catch (error) {
    // One row per allocation. A re-run finds its own row and moves on.
    if (isDuplicateKey(error)) return false
    throw error
  }
}

async function loadPersistedPositions(sprintId: string): Promise<Map<string, DebtPosition>> {
  const entries = (await EstimateDebtLedger.find({ sprint: sprintId }).lean()) as any[]
  const byMember = new Map<string, { entryType: LedgerEntryType; minutes: Minutes }[]>()
  for (const entry of entries) {
    const key = String(entry.member)
    const list = byMember.get(key) ?? []
    list.push({ entryType: entry.entryType, minutes: minutes(entry.minutes) })
    byMember.set(key, list)
  }
  const positions = new Map<string, DebtPosition>()
  for (const [memberId, list] of Array.from(byMember.entries())) {
    positions.set(memberId, computeDebtPosition(list))
  }
  return positions
}

async function resolveNames(assembled: AssembledInputs): Promise<Map<string, string>> {
  const memberIds = Array.from(new Set(assembled.inputs.map((row) => row.memberId)))
  const expected = (assembled.context.standup.expectedAttendees ?? []).map((id: unknown) =>
    String(id)
  )
  const ids = Array.from(new Set([...memberIds, ...expected]))
  if (ids.length === 0) return new Map()

  const people = (await User.find({ _id: { $in: ids } })
    .select('firstName lastName email')
    .lean()) as any[]

  return new Map(
    people.map((person) => [
      String(person._id),
      [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email
    ])
  )
}

/**
 * VAR-14's chain length. `Task.standupSpillCount` is maintained by Phase 9's
 * register; until that exists the carry chain on the allocation is the honest
 * answer, and one allocation with no chain is a chain of one.
 */
function spillLengthOf(task: any, allocation: any): number {
  if (Number.isInteger(task?.standupSpillCount) && task.standupSpillCount > 0) {
    return task.standupSpillCount
  }
  return allocation?.carryChainRoot ? 2 : 1
}

/** §15.8.5's sentence, per outcome. All copy comes from the catalogue (NFR-19). */
function explain(computed: VarianceComputation, input: ClassifyInput): string {
  const copy = standupStrings.variance
  const planned = input.plannedMinutes
  const logged = input.loggedMinutesOnDay
  const over = computed.overrunMinutes
  const under = minutes(Math.max(0, planned - logged))

  switch (computed.outcome) {
    case 'delivered_under':
      return copy.deliveredUnder({ planned, logged, under: computed.creditMinutes })
    case 'delivered_on_estimate':
      return copy.deliveredOnEstimate({ planned, logged })
    case 'delivered_over':
      return copy.deliveredOver({ planned, logged, over })
    case 'open_under_consumed':
      return copy.openUnderConsumed({ planned, logged, under })
    case 'open_fully_consumed':
      return copy.openFullyConsumed({ planned, logged })
    case 'open_over_consumed':
      return copy.openOverConsumed({
        planned,
        logged,
        over,
        totalOnTask: input.totalLoggedMinutesOnTask,
        estimate: input.originalEstimateMinutes,
        taskOver: computed.taskVarianceMinutes
      })
    case 'not_started':
      return copy.notStarted({ planned })
    case 'blocked':
      return copy.blocked({ planned })
    case 'descoped':
      return copy.descoped()
    case 'reassigned':
      return copy.reassigned({ logged })
    case 'owner_absent':
      return copy.ownerAbsent()
    case 'no_time_logged_but_progressed':
      return copy.noTimeLoggedButProgressed()
  }
}

/**
 * VAR-14: a chronic spill is pinned to the top of the panel regardless of the
 * sort, because it is the row the PM most needs to see and the one they are
 * most likely to scroll past.
 */
function sortRows(rows: VarianceRow[]): VarianceRow[] {
  return [...rows].sort((a, b) => {
    if (a.chronicSpill !== b.chronicSpill) return a.chronicSpill ? -1 : 1
    if (a.memberName !== b.memberName) return a.memberName.localeCompare(b.memberName)
    return (a.taskKey ?? '').localeCompare(b.taskKey ?? '')
  })
}

function rollUp(
  rows: VarianceRow[],
  positions: Map<string, DebtPosition>,
  names: Map<string, string>,
  assembled: AssembledInputs
): MemberVarianceRollUp[] {
  const expected: string[] = (assembled.context.standup.expectedAttendees ?? []).map(
    (id: unknown) => String(id)
  )
  const memberIds = Array.from(new Set([...expected, ...rows.map((row) => row.memberId)]))

  return memberIds.map((memberId) => {
    const mine = rows.filter((row) => row.memberId === memberId)
    const position = positions.get(memberId)
    const planned = mine.reduce((total, row) => total + row.plannedMinutes, 0)
    const logged = mine.reduce((total, row) => total + row.loggedMinutesOnDay, 0)

    return {
      memberId,
      memberName: names.get(memberId) ?? memberId,
      plannedMinutes: minutes(planned),
      loggedMinutesOnDay: minutes(logged),
      dayVarianceMinutes: minutes(logged - planned),
      outstandingDebtMinutes: position?.outstandingMinutes ?? ZERO_MINUTES,
      surplusMinutes: position?.surplusMinutes ?? ZERO_MINUTES,
      needingRevision: mine.filter(
        (row) => row.requiresRevision && row.revisedRemainingMinutes === undefined
      ).length
    }
  })
}

const userActor = (actor: { userId: string }): AuditActor => ({
  type: 'user',
  userId: actor.userId
})

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ((error as { code?: number }).code === 11000 ||
      /E11000/.test(String((error as { message?: string }).message ?? '')))
  )
}
