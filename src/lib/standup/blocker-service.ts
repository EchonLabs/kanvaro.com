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
import { validateBlockerFields } from './blocker'
import { StandupError } from './errors'
import { recordAudit } from './audit'
import { createOpenBlockerItem, resolveLinkedOpenBlockerItem } from './carry-forward-service'

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
    await Allocation.updateOne(
      { _id: input.linkedAllocationId },
      {
        $set: {
          isBlocked: true,
          allocatedDespiteBlocked: Boolean(input.allocatedDespiteBlocked),
          excludedFromCapacity: !input.allocatedDespiteBlocked,
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
  const blocker = await StandupBlocker.findById(input.blockerId)
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
