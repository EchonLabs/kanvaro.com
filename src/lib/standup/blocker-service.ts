/**
 * Blocker lifecycle: raise, update, resolve (spec RUN-14..18, phase 10).
 *
 * `blocker.ts` decides whether a blocker's fields are well-formed — pure, no
 * I/O. This module is the one write path that actually persists a
 * `StandupBlocker`, keeps the linked `Allocation`'s blocked flags in step
 * with it (RUN-15/16), opens and closes the linked `open_blocker`
 * carry-forward register row (RUN-17), and audits every mutation (SEC-3).
 */
import { StandupBlocker, type IStandupBlocker } from '@/models/StandupBlocker'
import { Allocation } from '@/models/Allocation'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { User } from '@/models/User'
import { isOverdue, validateBlockerFields } from './blocker'
import { StandupError } from './errors'
import { recordAudit } from './audit'
import { createOpenBlockerItem, resolveLinkedOpenBlockerItem } from './carry-forward-service'
import { isoOfStoredDate } from './calendar-dates'

export interface RaiseBlockerInput {
  standupId: string
  sprintId: string
  projectId: string
  organizationId: string
  raisedBy: string
  taskId?: string
  linkedAllocationId?: string
  description: string
  blockerType: string
  severity: string
  allocatedDespiteBlocked?: boolean
  blockedNote?: string
}

/**
 * RUN-14/15/17. Raises a blocker and, unless the PM chose to keep the linked
 * allocation active (RUN-16), excludes it from capacity — `computeCapacity()`
 * already reads `excludedFromCapacity`, this is the one write site that sets
 * it true for the blocker path. Also opens the `open_blocker` carry-forward
 * register row RUN-17 requires so it escalates the same way every other item
 * does.
 */
export async function raiseBlocker(input: RaiseBlockerInput): Promise<IStandupBlocker> {
  const check = validateBlockerFields({ description: input.description })
  if (!check.valid) throw new StandupError('VALIDATION_FAILED', check.message)

  if (input.allocatedDespiteBlocked && !(input.blockedNote ?? '').trim()) {
    throw new StandupError('VALIDATION_FAILED', 'RUN-16 requires a note when keeping a blocked task allocated.')
  }

  const blocker = await StandupBlocker.create({
    standup: input.standupId,
    sprint: input.sprintId,
    project: input.projectId,
    organization: input.organizationId,
    task: input.taskId,
    raisedBy: input.raisedBy,
    raisedAt: new Date(),
    description: input.description.trim(),
    blockerType: input.blockerType,
    severity: input.severity,
    status: 'open',
    linkedAllocation: input.linkedAllocationId
  })

  if (input.linkedAllocationId) {
    // AC-25/RUN-15: a blocked allocation is excluded from capacity unless the
    // PM explicitly kept it allocated (RUN-16), *or* the project has opted
    // blocked tasks into still consuming capacity via
    // `ProjectStandupSettings.blockedTasksConsumeCapacity`.
    const settings = await ProjectStandupSettings.findOne({ project: input.projectId })
      .select('blockedTasksConsumeCapacity')
      .lean<{ blockedTasksConsumeCapacity?: boolean } | null>()

    await Allocation.updateOne(
      { _id: input.linkedAllocationId },
      {
        $set: {
          isBlocked: true,
          allocatedDespiteBlocked: Boolean(input.allocatedDespiteBlocked),
          excludedFromCapacity: !input.allocatedDespiteBlocked && !settings?.blockedTasksConsumeCapacity,
          blockedNote: input.blockedNote
        }
      }
    )
  }

  const item = await createOpenBlockerItem({
    standupId: input.standupId,
    sprintId: input.sprintId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    taskId: input.taskId
  })
  await StandupBlocker.updateOne({ _id: blocker._id }, { $set: { linkedCarryForwardId: item._id } })
  blocker.linkedCarryForwardId = item._id as any

  await recordAudit({
    actor: { type: 'user', userId: input.raisedBy },
    organizationId: input.organizationId,
    action: 'standup_blocker_raised',
    entityType: 'standup_blocker',
    entityId: String(blocker._id),
    projectId: input.projectId,
    after: { blockerType: blocker.blockerType, severity: blocker.severity, status: blocker.status }
  })

  return blocker
}

export interface UpdateBlockerInput {
  blockerId: string
  /**
   * The stand-up id from the route's own `:id` param (Critical 1 of the
   * final-review fix wave). `withStandupIdPermission` only org-isolates the
   * stand-up named in the URL — it says nothing about whether `:blockerId` is
   * actually a child of that stand-up. Without this, any caller with
   * `STANDUP_BLOCKER_RAISE` on *some* stand-up in their own org could PATCH
   * any `StandupBlocker` document in the entire database by guessing/probing
   * ids. Scoping the lookup by both `_id` and `standup` closes that.
   */
  standupId: string
  updatedBy: string
  organizationId: string
  projectId: string
  owner?: string
  targetResolutionDate?: string
  severity?: string
  status?: 'open' | 'in_progress' | 'resolved' | 'wont_resolve'
  resolutionNote?: string
}

/**
 * PATCH path for owner/target-date assignment (feeding CC-9), status moves,
 * and RUN-16's isBlocked-clears auto-close (Phase 9 left this as a known gap
 * — "no Blocker entity to check against" — this closes it).
 */
export async function updateBlocker(input: UpdateBlockerInput): Promise<IStandupBlocker> {
  const blocker = await StandupBlocker.findOne({
    _id: input.blockerId,
    standup: input.standupId,
    organization: input.organizationId
  })
  if (!blocker) throw new StandupError('NOT_FOUND', 'Blocker not found.')

  const closing = input.status === 'resolved' || input.status === 'wont_resolve'
  if (closing && (input.resolutionNote ?? '').trim().length < 10) {
    throw new StandupError('VALIDATION_FAILED', 'A resolution note needs at least 10 characters when resolving a blocker.')
  }

  Object.assign(blocker, {
    ...(input.owner !== undefined ? { owner: input.owner } : {}),
    ...(input.targetResolutionDate !== undefined ? { targetResolutionDate: input.targetResolutionDate } : {}),
    ...(input.severity !== undefined ? { severity: input.severity } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.resolutionNote !== undefined ? { resolutionNote: input.resolutionNote } : {})
  })
  await blocker.save()

  if (closing) {
    if (blocker.linkedAllocation) {
      await Allocation.updateOne(
        { _id: blocker.linkedAllocation },
        { $set: { isBlocked: false, excludedFromCapacity: false } }
      )
    }
    if (blocker.linkedCarryForwardId) {
      await resolveLinkedOpenBlockerItem({
        itemId: String(blocker.linkedCarryForwardId),
        resolvedBy: input.updatedBy,
        resolutionType: input.status === 'resolved' ? 'done' : 'other',
        comment: input.resolutionNote
      })
    }
  }

  await recordAudit({
    actor: { type: 'user', userId: input.updatedBy },
    organizationId: input.organizationId,
    action: 'standup_blocker_updated',
    entityType: 'standup_blocker',
    entityId: String(blocker._id),
    projectId: input.projectId,
    after: { status: blocker.status }
  })

  return blocker
}

// --- Panel 6 read model (RUN-14..18) ---------------------------------------

export interface BlockerPanelRow {
  blockerId: string
  taskKey?: string
  description: string
  blockerType: string
  severity: string
  status: string
  owner?: string
  targetResolutionDate?: string
  overdue: boolean
  freedMinutes?: number
  blockerLabel: string
}

/**
 * Panel 6's read (RUN-14..18). Every blocker raised on this stand-up,
 * assembled the same way `loadCarryForwardPanel` assembles Panel 4: load the
 * stand-up for its `standupDate` (this module's "today" for RUN-18's overdue
 * check, the same reference date every other panel-assembly function in this
 * file uses), batch-load the related tasks/owners/allocations rather than
 * one query per blocker, then map.
 *
 * Two fields are purely computed, never stored:
 * - `overdue` reuses `isOverdue` from `blocker.ts` (RUN-18) — the same pure
 *   function `blocker.test.ts` already exercises — comparing the blocker's
 *   `targetResolutionDate` against the stand-up's own calendar date.
 * - `blockerLabel` is `'BLK-' + ` the blocker's own `_id`'s last 6 hex
 *   characters, uppercased. No counter, no extra storage — every read derives
 *   the same label from the id that already uniquely identifies the row.
 */
export async function loadBlockerPanel(standupId: string): Promise<BlockerPanelRow[]> {
  const standup = (await Standup.findById(standupId).select('standupDate').lean()) as any
  if (!standup) {
    throw new StandupError('NOT_FOUND', 'That stand-up no longer exists.', { standupId })
  }

  const blockers = (await StandupBlocker.find({ standup: standup._id }).lean()) as any[]

  const taskIds = Array.from(new Set(blockers.filter((b) => b.task).map((b) => String(b.task))))
  const ownerIds = Array.from(new Set(blockers.filter((b) => b.owner).map((b) => String(b.owner))))
  const allocationIds = Array.from(
    new Set(blockers.filter((b) => b.linkedAllocation).map((b) => String(b.linkedAllocation)))
  )

  const [tasks, owners, allocations] = await Promise.all([
    taskIds.length
      ? (Task.find({ _id: { $in: taskIds } }).select('displayId').lean() as Promise<any[]>)
      : Promise.resolve([]),
    ownerIds.length
      ? (User.find({ _id: { $in: ownerIds } }).select('firstName lastName email').lean() as Promise<any[]>)
      : Promise.resolve([]),
    allocationIds.length
      ? (Allocation.find({ _id: { $in: allocationIds } })
          .select('plannedMinutes excludedFromCapacity')
          .lean() as Promise<any[]>)
      : Promise.resolve([])
  ])

  const taskById = new Map(tasks.map((task) => [String(task._id), task]))
  const ownerNameById = new Map(
    owners.map((owner) => [
      String(owner._id),
      [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email
    ])
  )
  const allocationById = new Map(allocations.map((allocation) => [String(allocation._id), allocation]))

  return blockers.map((blocker): BlockerPanelRow => {
    const task = blocker.task ? taskById.get(String(blocker.task)) : undefined
    const allocation = blocker.linkedAllocation
      ? allocationById.get(String(blocker.linkedAllocation))
      : undefined
    const targetResolutionDate = blocker.targetResolutionDate
      ? isoOfStoredDate(blocker.targetResolutionDate)
      : undefined

    return {
      blockerId: String(blocker._id),
      ...(task?.displayId ? { taskKey: task.displayId } : {}),
      description: blocker.description,
      blockerType: blocker.blockerType,
      severity: blocker.severity,
      status: blocker.status,
      ...(blocker.owner ? { owner: ownerNameById.get(String(blocker.owner)) } : {}),
      ...(targetResolutionDate ? { targetResolutionDate } : {}),
      overdue: isOverdue(targetResolutionDate, standup.standupDate),
      ...(allocation?.excludedFromCapacity ? { freedMinutes: allocation.plannedMinutes } : {}),
      blockerLabel: `BLK-${String(blocker._id).slice(-6).toUpperCase()}`
    }
  })
}
