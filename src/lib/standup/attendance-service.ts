/**
 * Attendance, and RUN-7's detachment half (spec §10.2 step 1; plan §6.4 OB-13).
 *
 * RUN-7 as written says marking a member absent moves their allocations "into
 * the carry forward register with tag owner_absent". The register is Phase 9
 * and attendance is Phase 7, so the plan splits the requirement at the seam:
 *
 *   Phase 7 (here)  — detach: `excludedFromCapacity` + `detachedReason:
 *                     'owner_absent'` on every one of that member's rows, then
 *                     raise the reassign prompt.
 *   Phase 9         — sweep those rows into the register with the tag.
 *
 * The rows are **tagged, never deleted**. Phase 9 needs them to build the
 * register, Phase 8 needs them to know it must post zero ledger entries for
 * somebody who was not there (V11), and the audit trail needs them to explain
 * where six hours of planned work went.
 *
 * Between the absence and the reassignment the hours are *stranded*:
 * `computeCapacity` reports them as `strandedMinutes`, and the board must show
 * that as an alert (OB-12). `allocationStatus` decides `unavailable` from
 * effective capacity before it ever looks at what is allocated, so without that
 * field an absent member holding six hours renders identically to an empty day.
 */
import { Allocation, type IAllocation } from '@/models/Allocation'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'

import { createAllocation, unclaimedDetachedMinutes } from './allocation-service'
import { recordAudit, type AuditActor } from './audit'
import { loadCapacityContext, type CapacityContext } from './capacity-context'
import type { AttendanceStatus, CapacityBreakdown } from './capacity'
import { ALLOCATION_STEP_MINUTES } from './allocation'
import { StandupError, immutableCompletedStandup, staleStandup } from './errors'
import { minutes, sumMinutes, type Minutes } from './minutes'

/** The states that remove a member's whole day and therefore detach their work. */
const ABSENT_STATES = new Set<AttendanceStatus>(['absent_planned', 'absent_unplanned'])

const MUTABLE_STATUSES = new Set(['Scheduled', 'Ready', 'In_Progress', 'Reopened'])

export interface DetachedAllocation {
  allocationId: string
  taskId: string
  key?: string
  title?: string
  plannedMinutes: Minutes
}

export interface ReassignPrompt {
  memberId: string
  /** "Reassign X's N open tasks?" — N. */
  taskCount: number
  totalMinutes: Minutes
  tasks: DetachedAllocation[]
}

export interface SetAttendanceResult {
  capacity: CapacityBreakdown
  /** Rows detached by this call. Empty unless the member became absent. */
  detached: DetachedAllocation[]
  /** Rows re-attached by this call, when an absence was reverted. */
  reattached: number
  reassignPrompt: ReassignPrompt | null
  standupVersion: number
}

export interface SetAttendanceInput {
  standupId: string
  memberId: string
  state: AttendanceStatus
  /** Required when `state` is `partial` (RUN-6). */
  partialMinutes?: Minutes
  /** RUN-8's optional reason, meaningful for an unplanned absence. */
  reason?: string
  note?: string
  expectedVersion: number
  actor: { userId: string }
}

export async function setAttendance(
  input: SetAttendanceInput
): Promise<SetAttendanceResult> {
  const context = await loadMutableContext(input.standupId, input.expectedVersion)

  if (!context.memberIds.includes(input.memberId)) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'That person is not expected at this stand-up.',
      { memberId: input.memberId }
    )
  }

  // The nominal day, needed to bound the partial entry. Computed with no
  // attendance override so it reports the day the member would otherwise have.
  const nominalToday = context.computeFor(input.memberId, { attendance: 'present' })

  if (input.state === 'partial') {
    assertPartialMinutes(input.partialMinutes, nominalToday.adjustedMinutes)
  }

  const before = await readAttendance(input.standupId, input.memberId)

  await Standup.updateOne(
    { _id: input.standupId },
    { $pull: { attendance: { user: input.memberId } } }
  )
  await Standup.updateOne(
    { _id: input.standupId },
    {
      $push: {
        attendance: {
          user: input.memberId,
          state: input.state,
          ...(input.state === 'partial' ? { partialMinutes: input.partialMinutes } : {}),
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.note ? { note: input.note } : {})
        }
      }
    }
  )

  // RUN-7. Any absent state detaches; anything else re-attaches what this
  // member still holds. `partial` deliberately does neither: a partial day
  // still has hours in it, and the member may well be over-allocated as a
  // result — which is the PM's decision to make, loudly, not this service's to
  // make silently by removing rows.
  let detached: DetachedAllocation[] = []
  let reattached = 0

  if (ABSENT_STATES.has(input.state)) {
    detached = await detachAllocations(input.standupId, input.memberId)
  } else if (input.state === 'present') {
    reattached = await reattachAllocations(input.standupId, input.memberId)
  }

  const standupVersion = await bumpVersion(input.standupId)

  await recordAudit({
    actor: userActor(input.actor),
    organizationId: context.organizationId,
    projectId: context.projectId,
    action: 'standup_attendance_set',
    entityType: 'standup',
    entityId: context.standupId,
    before,
    after: {
      state: input.state,
      ...(input.partialMinutes === undefined ? {} : { partialMinutes: input.partialMinutes }),
      ...(input.reason ? { reason: input.reason } : {})
    },
    context: {
      memberId: input.memberId,
      date: context.date,
      detachedCount: detached.length,
      reattachedCount: reattached
    }
  })

  // Recomputed against the attendance just written, so the caller never has to
  // apply the change itself to know what the day now looks like.
  const capacity = await recompute(input.standupId, input.memberId, {
    attendance: input.state,
    attendancePartialMinutes: input.partialMinutes
  })

  return {
    capacity,
    detached,
    reattached,
    reassignPrompt: detached.length
      ? {
          memberId: input.memberId,
          taskCount: detached.length,
          totalMinutes: sumMinutes(detached, (row) => row.plannedMinutes),
          tasks: detached
        }
      : null,
    standupVersion
  }
}

export interface ReassignDetachedInput {
  standupId: string
  fromMemberId: string
  toMemberId: string
  /** Omitted means every detached row. */
  allocationIds?: string[]
  expectedVersion: number
  actor: { userId: string }
}

export interface ReassignDetachedResult {
  moved: number
  fromCapacity: CapacityBreakdown
  toCapacity: CapacityBreakdown
  standupVersion: number
}

/**
 * The bulk action behind "Reassign X's N open tasks?".
 *
 * Creates fresh live allocations for the receiving member and **leaves the
 * detached originals in place**. They are the evidence of what was planned
 * before the absence: Phase 9 turns them into register items tagged
 * `owner_absent`, and Phase 8's classifier reads the tag to know it must not
 * accrue estimate debt against somebody who was not there.
 */
export async function reassignDetached(
  input: ReassignDetachedInput
): Promise<ReassignDetachedResult> {
  const context = await loadMutableContext(input.standupId, input.expectedVersion)

  if (!context.memberIds.includes(input.toMemberId)) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'That person is not expected at this stand-up.',
      { memberId: input.toMemberId }
    )
  }

  const receiving = context.computeFor(input.toMemberId)
  if (receiving.effectiveMinutes <= 0) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'That person has no capacity today, so the work would be stranded again.',
      { memberId: input.toMemberId }
    )
  }

  const filter: Record<string, unknown> = {
    standup: input.standupId,
    member: input.fromMemberId,
    detachedReason: 'owner_absent'
  }
  if (input.allocationIds?.length) filter._id = { $in: input.allocationIds }

  const rows = (await Allocation.find(filter).lean()) as any[]

  let version = input.expectedVersion
  let moved = 0

  for (const row of rows) {
    // Through the service, so the receiving member's task gets the ALO-16
    // assignment, the estimate is re-checked, and the move is audited like any
    // other allocation.
    const result = await createAllocation({
      standupId: input.standupId,
      memberId: input.toMemberId,
      taskId: String(row.task),
      plannedMinutes: minutes(row.plannedMinutes),
      source: 'assigned_in_standup',
      note: row.note,
      expectedVersion: version,
      actor: input.actor
    })
    version = result.standupVersion
    moved += 1
  }

  return {
    moved,
    fromCapacity: await recompute(input.standupId, input.fromMemberId),
    toCapacity: await recompute(input.standupId, input.toMemberId),
    standupVersion: version
  }
}

/* --- internals ----------------------------------------------------------- */

async function detachAllocations(
  standupId: string,
  memberId: string
): Promise<DetachedAllocation[]> {
  const rows = (await Allocation.find({
    standup: standupId,
    member: memberId,
    detachedReason: { $exists: false }
  }).lean()) as any[]

  if (rows.length === 0) return []

  await Allocation.updateMany(
    { _id: { $in: rows.map((row) => row._id) } },
    { $set: { detachedReason: 'owner_absent', excludedFromCapacity: true } }
  )

  const tasks = (await Task.find({ _id: { $in: rows.map((row) => row.task) } })
    .select('displayId title')
    .lean()) as any[]
  const byId = new Map(tasks.map((task) => [String(task._id), task]))

  return rows.map((row) => ({
    allocationId: String(row._id),
    taskId: String(row.task),
    key: byId.get(String(row.task))?.displayId,
    title: byId.get(String(row.task))?.title,
    plannedMinutes: minutes(row.plannedMinutes)
  }))
}

/**
 * Reverses a detachment when the absence turns out to be wrong.
 *
 * Only rows whose task is not already live on this stand-up come back. Once the
 * PM has answered the reassign prompt the work belongs to somebody else, and
 * resurrecting the original would put two people on one task — CC-10's failure,
 * discovered at completion rather than here.
 */
async function reattachAllocations(standupId: string, memberId: string): Promise<number> {
  const detached = (await Allocation.find({
    standup: standupId,
    member: memberId,
    detachedReason: 'owner_absent'
  }).lean()) as any[]

  if (detached.length === 0) return 0

  const live = (await Allocation.find({
    standup: standupId,
    task: { $in: detached.map((row) => row.task) },
    detachedReason: { $exists: false }
  })
    .select('task')
    .lean()) as any[]
  const taken = new Set(live.map((row) => String(row.task)))

  const restorable = detached.filter((row) => !taken.has(String(row.task)))
  if (restorable.length === 0) return 0

  await Allocation.updateMany(
    { _id: { $in: restorable.map((row) => row._id) } },
    { $unset: { detachedReason: '' }, $set: { excludedFromCapacity: false } }
  )

  return restorable.length
}

async function loadMutableContext(
  standupId: string,
  expectedVersion: number
): Promise<CapacityContext> {
  const context = await loadCapacityContext(standupId)
  const status = context.standup.status

  if (status === 'Completed') throw immutableCompletedStandup([context.date])
  if (!MUTABLE_STATUSES.has(status)) {
    throw new StandupError(
      'STANDUP_NOT_STARTABLE',
      `This stand-up is ${String(status).toLowerCase()}, so attendance cannot be changed.`,
      { status }
    )
  }

  const current = context.standup.version ?? 0
  if (current !== expectedVersion) {
    throw staleStandup(current, { standupId, status, date: context.date })
  }

  return context
}

/**
 * RUN-6's bound: a partial day is at least one step and at most the member's
 * day less one step.
 *
 * Zero is refused on purpose. "Available for none of the day" is an absence,
 * and recording it as a partial would leave the allocations attached — the
 * exact silent stranding this module exists to prevent.
 */
function assertPartialMinutes(value: Minutes | undefined, nominalMinutes: Minutes): void {
  if (value === undefined || !Number.isInteger(value)) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'Enter how many hours this person is available today.',
      { partialMinutes: value }
    )
  }
  if (value < ALLOCATION_STEP_MINUTES) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'A partial day must be at least fifteen minutes. Mark the person absent instead.',
      { partialMinutes: value }
    )
  }
  if (value > nominalMinutes - ALLOCATION_STEP_MINUTES) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'That is the whole day or more. Mark the person present instead.',
      { partialMinutes: value, nominalMinutes }
    )
  }
}

async function readAttendance(
  standupId: string,
  memberId: string
): Promise<Record<string, unknown> | null> {
  const standup = (await Standup.findById(standupId).select('attendance').lean()) as any
  const entry = (standup?.attendance ?? []).find(
    (row: any) => String(row.user) === memberId
  )
  if (!entry) return null
  return {
    state: entry.state,
    ...(entry.partialMinutes === undefined ? {} : { partialMinutes: entry.partialMinutes }),
    ...(entry.reason ? { reason: entry.reason } : {})
  }
}

async function recompute(
  standupId: string,
  memberId: string,
  overrides: {
    attendance?: AttendanceStatus
    attendancePartialMinutes?: Minutes
  } = {}
): Promise<CapacityBreakdown> {
  // Re-read the context: attendance and the allocations have both moved, and a
  // stale context would report the day as it was before this call.
  const context = await loadCapacityContext(standupId)

  const rows = (await Allocation.find({ standup: standupId, member: memberId })
    .select('plannedMinutes excludedFromCapacity detachedReason')
    .lean()) as any[]

  const allocatedMinutes = sumMinutes(
    rows.filter((row) => !row.excludedFromCapacity && !row.detachedReason),
    (row) => minutes(row.plannedMinutes)
  )

  return context.computeFor(memberId, {
    allocatedMinutes,
    detachedMinutes: await unclaimedDetachedMinutes(standupId, memberId),
    ...overrides
  })
}

async function bumpVersion(standupId: string): Promise<number> {
  const updated = await Standup.findOneAndUpdate(
    { _id: standupId },
    { $inc: { version: 1 } },
    { new: true, projection: { version: 1 } }
  ).lean()
  return (updated as any)?.version ?? 0
}

const userActor = (actor: { userId: string }): AuditActor => ({
  type: 'user',
  userId: actor.userId
})

export type { IAllocation }
