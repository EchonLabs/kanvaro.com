/**
 * The only writer of `Allocation` (spec §11.2, ALO-4 … ALO-16; RUN-15/16/23).
 *
 * Three invariants hold across every function here.
 *
 * **One writer.** Nothing else in the module creates, edits or deletes an
 * allocation. Routes call this; jobs call this; the attendance service calls
 * this. The moment a second writer exists, the audit trail has a hole in it and
 * the version guard can be walked around.
 *
 * **Every write returns the recomputed breakdown.** Not the request echoed
 * back, and not an increment applied to what the client already had — a fresh
 * `computeCapacity()` over what is actually in the database, through the same
 * `capacity-context.ts` the snapshot and the completion checks use. A client
 * that re-derives its own meter will eventually disagree with the server that
 * decides whether the stand-up may complete, and the PM will have no way to
 * tell which number is the real one.
 *
 * **Every write is version-guarded and audited.** RUN-23 and SEC-3. The guard
 * is not advisory: two PMs on the same board is the normal case, not the edge
 * case, and a lost update here is a member's day silently rewritten.
 */
import { Allocation, type IAllocation } from '@/models/Allocation'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { User } from '@/models/User'

import {
  defaultPlannedMinutes,
  partitionPool,
  type PoolPartition,
  type PoolTask
} from './allocation'
import { recordAudit, type AuditActor } from './audit'
import { loadCapacityContext, type CapacityContext } from './capacity-context'
import type { CapacityBreakdown } from './capacity'
import {
  StandupError,
  immutableCompletedStandup,
  staleStandup,
  taskNotEstimated
} from './errors'
import { minutes, sumMinutes, ZERO_MINUTES, type Minutes } from './minutes'

/** Statuses in which allocations may be written at all. */
const MUTABLE_STATUSES = new Set(['Scheduled', 'Ready', 'In_Progress', 'Reopened'])

/** The audited fields of an allocation. Whole documents make entries unreadable. */
const AUDITED_FIELDS = [
  'plannedMinutes',
  'source',
  'isBlocked',
  'allocatedDespiteBlocked',
  'excludedFromCapacity',
  'excludeReason',
  'detachedReason',
  'pairedDeliberately',
  'note'
] as const

export interface AllocationWriteResult {
  allocation: IAllocation
  /** The member's day, recomputed from the database after the write. */
  capacity: CapacityBreakdown
  /** The stand-up's new version. The client must send this on its next write. */
  standupVersion: number
}

export interface CreateAllocationInput {
  standupId: string
  memberId: string
  taskId: string
  /** Omitted means ALO-5's default against the member's current gap. */
  plannedMinutes?: Minutes
  source?: IAllocation['source']
  note?: string
  pairedDeliberately?: boolean
  carriedFromAllocationId?: string
  carryChainRootId?: string
  expectedVersion: number
  actor: { userId: string }
  /**
   * ALO-22 top-up. Present means the caller intends to add to an already
   * completed stand-up, and the reason is mandatory — an unexplained edit to
   * history is worse than no edit at all, because Phase 8's variance numbers
   * are computed from exactly these rows.
   */
  topUp?: { reason: string }
  /**
   * ALO-23 self-select. The member is adding to their *own* day, which is a
   * different permission and a different `source`.
   */
  selfSelect?: boolean
}

export async function createAllocation(
  input: CreateAllocationInput
): Promise<AllocationWriteResult> {
  const topUpReason = input.topUp ? assertTopUpReason(input.topUp.reason) : undefined

  const context = await loadMutableContext(input.standupId, input.expectedVersion, {
    allowCompleted: Boolean(input.topUp)
  })

  // ALO-23. Two independent conditions, and both are refusals rather than
  // silent downgrades to an ordinary allocation: a member who thinks they
  // self-selected and actually did not has been told the wrong thing.
  if (input.selfSelect) {
    if (context.settings?.allowSelfSelect !== true) {
      throw new StandupError(
        'VALIDATION_FAILED',
        'Self-select is turned off for this project.',
        { setting: 'allowSelfSelect' }
      )
    }
    if (input.memberId !== input.actor.userId) {
      throw new StandupError(
        'VALIDATION_FAILED',
        'You can only add work to your own day.',
        { memberId: input.memberId }
      )
    }
  }

  if (!context.memberIds.includes(input.memberId)) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'That person is not expected at this stand-up.',
      { memberId: input.memberId }
    )
  }

  const task = (await Task.findById(input.taskId).lean()) as any
  if (!task) {
    throw new StandupError('NOT_FOUND', 'That task no longer exists.', {
      taskId: input.taskId
    })
  }
  if (String(task.sprint ?? '') !== context.sprintId) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'That task is not in this sprint, so it cannot be planned on this stand-up.',
      { taskId: input.taskId }
    )
  }

  // CC-2 refused here rather than only at completion. Allocating an unestimated
  // task produces a row the variance engine cannot classify and the debt ledger
  // cannot value, and the PM does not find out until the meeting is over.
  const remaining = remainingEstimateOf(task)
  if (remaining <= ZERO_MINUTES) {
    throw taskNotEstimated(input.taskId, task.displayId)
  }

  const allocated = await allocatedMinutesFor(input.standupId, input.memberId)
  const breakdown = context.computeFor(input.memberId, { allocatedMinutes: allocated })

  const plannedMinutes =
    input.plannedMinutes === undefined
      ? defaultPlannedMinutes({
          remainingEstimateMinutes: remaining,
          gapMinutes: breakdown.gapMinutes,
          nominalMinutes: breakdown.nominalMinutes
        })
      : assertPlannable(input.plannedMinutes)

  let allocation: IAllocation
  try {
    allocation = await Allocation.create({
      standup: context.standupId,
      sprint: context.sprintId,
      project: context.projectId,
      organization: context.organizationId,
      member: input.memberId,
      task: input.taskId,
      plannedMinutes,
      source: input.selfSelect ? 'self_selected' : input.source ?? 'assigned_in_standup',
      note: input.note,
      pairedDeliberately: input.pairedDeliberately ?? false,
      // Phase 8 reads this to separate V7 from V12; only this moment knows it.
      taskStatusAtAllocation: task.status,
      carriedFromAllocation: input.carriedFromAllocationId,
      carryChainRoot: input.carryChainRootId,
      ...(topUpReason
        ? {
            addedAfterCompletion: true,
            addedAfterCompletionAt: new Date(),
            addedAfterCompletionReason: topUpReason
          }
        : {}),
      createdBy: input.actor.userId
    })
  } catch (error) {
    // DAT-3's index is the authority on duplicates, not a prior read: two PMs
    // dropping the same task on the same member race, and only the index sees
    // both.
    if (isDuplicateKey(error)) {
      throw new StandupError(
        'VALIDATION_FAILED',
        'That task is already planned for this person today.',
        { taskId: input.taskId, memberId: input.memberId }
      )
    }
    throw error
  }

  // ALO-16. Dragging an unassigned task onto a member assigns it to them —
  // otherwise the pool's two tabs disagree with the board about who owns it.
  if (!task.assignedTo?.length) {
    await Task.updateOne(
      { _id: input.taskId },
      { $set: { assignedTo: [{ user: input.actor.userId, assignedAt: new Date() }] } }
    )
    await Task.updateOne(
      { _id: input.taskId },
      { $set: { 'assignedTo.0.user': input.memberId } }
    )
  }

  const standupVersion = await bumpVersion(context.standupId)

  await recordAudit({
    actor: userActor(input.actor),
    organizationId: context.organizationId,
    projectId: context.projectId,
    action: 'allocation_created',
    entityType: 'allocation',
    entityId: String(allocation._id),
    entityName: task.displayId,
    before: null,
    after: auditView(allocation),
    context: { standupId: context.standupId, date: context.date, memberId: input.memberId }
  })

  return {
    allocation,
    capacity: await recompute(context, input.memberId),
    standupVersion
  }
}

export interface UpdateAllocationInput {
  standupId: string
  allocationId: string
  plannedMinutes?: Minutes
  isBlocked?: boolean
  allocatedDespiteBlocked?: boolean
  blockedNote?: string
  excludedFromCapacity?: boolean
  excludeReason?: string
  note?: string
  pairedDeliberately?: boolean
  expectedVersion: number
  actor: { userId: string }
  /** ALO-22. Additions only — see {@link updateAllocation}. */
  topUp?: { reason: string }
}

export async function updateAllocation(
  input: UpdateAllocationInput
): Promise<AllocationWriteResult> {
  const topUpReason = input.topUp ? assertTopUpReason(input.topUp.reason) : undefined

  const context = await loadMutableContext(input.standupId, input.expectedVersion, {
    allowCompleted: Boolean(input.topUp)
  })
  const allocation = await findAllocation(input.allocationId, context.standupId)

  const before = auditView(allocation)

  // ALO-22's asymmetry. On a completed stand-up an allocation may grow and may
  // never shrink: "top up" means the member did *more* than was planned, and a
  // reduction after the fact is a rewrite of what the team committed to.
  if (topUpReason) {
    const reducing =
      input.plannedMinutes !== undefined && input.plannedMinutes < allocation.plannedMinutes
    if (reducing) {
      throw immutableCompletedStandup([context.date])
    }
    allocation.addedAfterCompletion = true
    allocation.addedAfterCompletionAt = new Date()
    allocation.addedAfterCompletionReason = topUpReason
  }

  if (input.plannedMinutes !== undefined) {
    allocation.plannedMinutes = assertPlannable(input.plannedMinutes)
  }
  if (input.isBlocked !== undefined) allocation.isBlocked = input.isBlocked
  if (input.allocatedDespiteBlocked !== undefined) {
    allocation.allocatedDespiteBlocked = input.allocatedDespiteBlocked
  }
  if (input.blockedNote !== undefined) allocation.blockedNote = input.blockedNote
  if (input.excludedFromCapacity !== undefined) {
    allocation.excludedFromCapacity = input.excludedFromCapacity
  }
  if (input.excludeReason !== undefined) allocation.excludeReason = input.excludeReason
  if (input.note !== undefined) allocation.note = input.note
  if (input.pairedDeliberately !== undefined) {
    allocation.pairedDeliberately = input.pairedDeliberately
  }

  // RUN-16. Keeping a blocked task allocated is a judgement call the PM is
  // allowed to make and required to justify — the note is what tomorrow's
  // stand-up reads when the task has not moved.
  if (allocation.allocatedDespiteBlocked && !(allocation.blockedNote ?? '').trim()) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'Add a note explaining why this blocked task stays allocated.',
      { allocationId: input.allocationId }
    )
  }

  allocation.updatedBy = input.actor.userId as any
  await allocation.save()

  const standupVersion = await bumpVersion(context.standupId)

  await recordAudit({
    actor: userActor(input.actor),
    organizationId: context.organizationId,
    projectId: context.projectId,
    action: 'allocation_updated',
    entityType: 'allocation',
    entityId: String(allocation._id),
    before,
    after: auditView(allocation),
    context: { standupId: context.standupId, date: context.date }
  })

  return {
    allocation,
    capacity: await recompute(context, String(allocation.member)),
    standupVersion
  }
}

export interface RemoveAllocationInput {
  standupId: string
  allocationId: string
  expectedVersion: number
  actor: { userId: string }
}

export async function removeAllocation(
  input: RemoveAllocationInput
): Promise<Omit<AllocationWriteResult, 'allocation'>> {
  const context = await loadMutableContext(input.standupId, input.expectedVersion)
  const allocation = await findAllocation(input.allocationId, context.standupId)

  const memberId = String(allocation.member)
  const before = auditView(allocation)

  await Allocation.deleteOne({ _id: allocation._id })

  const standupVersion = await bumpVersion(context.standupId)

  await recordAudit({
    actor: userActor(input.actor),
    organizationId: context.organizationId,
    projectId: context.projectId,
    action: 'allocation_removed',
    entityType: 'allocation',
    entityId: String(allocation._id),
    before,
    after: null,
    context: { standupId: context.standupId, date: context.date, memberId }
  })

  return { capacity: await recompute(context, memberId), standupVersion }
}

export interface BoardAllocationRow {
  allocationId: string
  taskId: string
  taskKey?: string
  title: string
  plannedMinutes: Minutes
  /** The task's remaining estimate — CC-2 needs it, and so does ALO-7's split. */
  remainingEstimateMinutes: Minutes
  source: IAllocation['source']
  isBlocked: boolean
  excludedFromCapacity: boolean
  detachedReason?: string
  pairedDeliberately: boolean
  note?: string
}

export interface BoardMember {
  memberId: string
  /** Resolved here rather than by the client: a board of ids is unreadable. */
  name: string
  capacity: CapacityBreakdown
  allocations: BoardAllocationRow[]
}

export interface AllocationBoard {
  standupId: string
  date: string
  shape: string
  /** Working-day ordinal, never a calendar count (§15.8.2). */
  sprintDayNumber: number
  totalSprintDays: number
  status: string
  facilitatorName: string
  meetingUrl?: string
  standupVersion: number
  /** DN-6 / OB-10: false means the board must say ceremonies were not deducted. */
  ceremoniesConsumeCapacity: boolean
  members: BoardMember[]
  pool: PoolPartition
  /**
   * DAT-9. When the board was computed. The materialised board view is
   * descoped (register row 5), so this is always "now" — but keeping the field
   * means adding the view later is not a breaking API change (R7).
   */
  computedAt: string
}

/** The whole of Panel 5, in one read. */
export async function loadAllocationBoard(standupId: string): Promise<AllocationBoard> {
  const context = await loadCapacityContext(standupId)

  const [allocations, tasks, people] = await Promise.all([
    Allocation.find({ standup: standupId }).sort({ createdAt: 1 }).lean() as Promise<any[]>,
    Task.find({ sprint: context.sprintId, archived: { $ne: true } })
      .select(
        'displayId title status type priority labels epic remainingEstimateMinutes position assignedTo'
      )
      .sort({ position: 1, createdAt: 1 })
      .lean() as Promise<any[]>,
    User.find({
      _id: { $in: [...context.memberIds, context.standup.facilitator] }
    })
      .select('firstName lastName email')
      .lean() as Promise<any[]>
  ])

  const nameById = new Map(people.map((person) => [String(person._id), displayName(person)]))
  const taskById = new Map(tasks.map((task) => [String(task._id), task]))

  const byMember = new Map<string, any[]>()
  for (const row of allocations) {
    const key = String(row.member)
    const existing = byMember.get(key)
    if (existing) existing.push(row)
    else byMember.set(key, [row])
  }

  // Which tasks somebody live is holding, so a detached row that has been
  // reassigned stops counting as stranded.
  const claimed = new Set(
    allocations.filter((row) => !row.detachedReason).map((row) => String(row.task))
  )

  const members: BoardMember[] = context.memberIds.map((memberId) => {
    const rows = byMember.get(memberId) ?? []
    return {
      memberId,
      name: nameById.get(memberId) ?? memberId,
      capacity: context.computeFor(memberId, {
        allocatedMinutes: countableMinutes(rows),
        detachedMinutes: sumMinutes(
          rows.filter((row) => row.detachedReason && !claimed.has(String(row.task))),
          (row) => minutes(row.plannedMinutes)
        )
      }),
      allocations: rows.map((row) => toBoardRow(row, taskById.get(String(row.task))))
    }
  })

  const doneStatuses = context.settings?.doneStatuses ?? ['done', 'cancelled', 'released']

  return {
    standupId: context.standupId,
    date: context.date,
    shape: context.standup.shape,
    sprintDayNumber: context.standup.sprintDayNumber ?? 0,
    totalSprintDays: context.standup.totalSprintDays ?? 0,
    status: context.standup.status,
    facilitatorName: nameById.get(String(context.standup.facilitator)) ?? '',
    ...(context.standup.meetingUrl ? { meetingUrl: context.standup.meetingUrl } : {}),
    standupVersion: context.standup.version ?? 0,
    ceremoniesConsumeCapacity: context.ceremoniesConsumeCapacity,
    members,
    pool: partitionPool(
      tasks.map(toPoolTask),
      allocations.map((row) => ({
        taskId: String(row.task),
        memberId: String(row.member),
        excludedFromCapacity: row.excludedFromCapacity,
        detachedReason: row.detachedReason
      })),
      doneStatuses
    ),
    computedAt: new Date().toISOString()
  }
}

/* --- internals ----------------------------------------------------------- */

/**
 * Loads the capacity context and refuses the write if the stand-up cannot take
 * one, or if the caller is holding a stale version.
 *
 * Order matters: immutability is checked before the version, because "this
 * stand-up is finished" is a more useful thing to tell a PM than "somebody else
 * edited it", and a completed stand-up's version will keep moving under Phase
 * 10's completion saga.
 */
async function loadMutableContext(
  standupId: string,
  expectedVersion: number,
  options: { allowCompleted?: boolean } = {}
): Promise<CapacityContext> {
  const context = await loadCapacityContext(standupId)
  const status = context.standup.status

  if (status === 'Completed' && !options.allowCompleted) {
    throw immutableCompletedStandup([context.date])
  }
  if (status !== 'Completed' && !MUTABLE_STATUSES.has(status)) {
    throw new StandupError(
      'STANDUP_NOT_STARTABLE',
      `This stand-up is ${String(status).toLowerCase()}, so its allocations cannot be changed.`,
      { status }
    )
  }

  const current = context.standup.version ?? 0
  if (current !== expectedVersion) {
    throw staleStandup(current, { standupId, status, date: context.date })
  }

  return context
}

async function findAllocation(allocationId: string, standupId: string) {
  const allocation = await Allocation.findById(allocationId)
  if (!allocation || String(allocation.standup) !== standupId) {
    throw new StandupError('NOT_FOUND', 'That allocation no longer exists.', {
      allocationId
    })
  }
  return allocation
}

/**
 * Minutes that count against a member's capacity.
 *
 * Blocked-and-excluded rows (RUN-15) and rows detached by an absence (RUN-7)
 * are both on the board and neither is counted. `computeCapacity` documents
 * that it expects `allocatedMinutes` to already exclude them, so this is the
 * one place that exclusion is applied.
 */
function countableMinutes(rows: readonly any[]): Minutes {
  return sumMinutes(
    rows.filter((row) => !row.excludedFromCapacity && !row.detachedReason),
    (row) => minutes(row.plannedMinutes)
  )
}

/**
 * Minutes detached from this member that nobody has picked up.
 *
 * A detached row whose task now carries a live allocation has been reassigned —
 * the work is somebody's again, so it is no longer stranded. Anything else is
 * planned work with no owner, which is what OB-12's alert and its reassign
 * action exist for.
 *
 * This predicate is deliberately the same one `partitionPool` uses to decide
 * whether a task returns to the pool, and the same one `reattachAllocations`
 * uses to decide what a reverted absence may restore. All three are asking the
 * identical question, and answering it three different ways is how a board, a
 * pool and an alert end up disagreeing about the same six hours.
 */
async function unclaimedDetachedMinutes(
  standupId: string,
  memberId: string
): Promise<Minutes> {
  const detached = (await Allocation.find({
    standup: standupId,
    member: memberId,
    detachedReason: { $exists: true }
  })
    .select('plannedMinutes task')
    .lean()) as any[]

  if (detached.length === 0) return ZERO_MINUTES

  const live = (await Allocation.find({
    standup: standupId,
    task: { $in: detached.map((row) => row.task) },
    detachedReason: { $exists: false }
  })
    .select('task')
    .lean()) as any[]
  const claimed = new Set(live.map((row) => String(row.task)))

  return sumMinutes(
    detached.filter((row) => !claimed.has(String(row.task))),
    (row) => minutes(row.plannedMinutes)
  )
}

async function allocatedMinutesFor(standupId: string, memberId: string): Promise<Minutes> {
  const rows = (await Allocation.find({ standup: standupId, member: memberId })
    .select('plannedMinutes excludedFromCapacity detachedReason')
    .lean()) as any[]
  return countableMinutes(rows)
}

async function recompute(
  context: CapacityContext,
  memberId: string
): Promise<CapacityBreakdown> {
  const [allocatedMinutes, detachedMinutes] = await Promise.all([
    allocatedMinutesFor(context.standupId, memberId),
    unclaimedDetachedMinutes(context.standupId, memberId)
  ])
  return context.computeFor(memberId, { allocatedMinutes, detachedMinutes })
}

export { unclaimedDetachedMinutes }

/**
 * Bumps the version and returns it.
 *
 * `findOneAndUpdate` with `$inc` rather than a read-modify-write, so two writers
 * arriving together produce two distinct versions rather than the same one — the
 * guard would otherwise let the second through.
 */
async function bumpVersion(standupId: string): Promise<number> {
  const updated = await Standup.findOneAndUpdate(
    { _id: standupId },
    { $inc: { version: 1 } },
    { new: true, projection: { version: 1 } }
  ).lean()
  return (updated as any)?.version ?? 0
}

/**
 * ALO-22's mandatory justification.
 *
 * Twenty characters is Phase 10's threshold for an override; a top-up asks only
 * for something non-empty, because the act is smaller — adding work somebody
 * actually did — and a length gate here would mostly produce padding.
 */
function assertTopUpReason(reason: string): string {
  const trimmed = (reason ?? '').trim()
  if (!trimmed) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'Say why this is being added after the stand-up was completed.',
      { field: 'reason' }
    )
  }
  return trimmed
}

function assertPlannable(value: number): Minutes {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'Planned hours must be a positive whole number of minutes.',
      { plannedMinutes: value }
    )
  }
  return minutes(value)
}

function remainingEstimateOf(task: any): Minutes {
  const value = task.remainingEstimateMinutes ?? task.originalEstimateMinutes ?? 0
  return Number.isInteger(value) && value > 0 ? minutes(value) : ZERO_MINUTES
}

function toBoardRow(row: any, task: any): BoardAllocationRow {
  return {
    allocationId: String(row._id),
    taskId: String(row.task),
    taskKey: task?.displayId,
    title: task?.title ?? '',
    plannedMinutes: minutes(row.plannedMinutes),
    remainingEstimateMinutes: minutes(task?.remainingEstimateMinutes ?? 0),
    source: row.source,
    isBlocked: row.isBlocked ?? false,
    excludedFromCapacity: row.excludedFromCapacity ?? false,
    detachedReason: row.detachedReason,
    pairedDeliberately: row.pairedDeliberately ?? false,
    note: row.note
  }
}

/** Falls back to the email, then the id — a blank name row is unusable. */
function displayName(person: any): string {
  const full = [person.firstName, person.lastName].filter(Boolean).join(' ').trim()
  return full || person.email || String(person._id)
}

function toPoolTask(task: any): PoolTask {
  return {
    taskId: String(task._id),
    key: task.displayId,
    title: task.title,
    status: task.status,
    type: task.type,
    priority: task.priority,
    labels: task.labels ?? [],
    epicId: task.epic ? String(task.epic) : undefined,
    remainingEstimateMinutes: minutes(task.remainingEstimateMinutes ?? 0),
    position: task.position ?? 0,
    assigneeIds: (task.assignedTo ?? []).map((entry: any) => String(entry.user ?? entry))
  }
}

function auditView(allocation: IAllocation): Record<string, unknown> {
  const view: Record<string, unknown> = {}
  for (const field of AUDITED_FIELDS) {
    const value = (allocation as any)[field]
    if (value !== undefined) view[field] = value
  }
  view.task = String(allocation.task)
  view.member = String(allocation.member)
  return view
}

const userActor = (actor: { userId: string }): AuditActor => ({
  type: 'user',
  userId: actor.userId
})

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as any).code === 11000
}
