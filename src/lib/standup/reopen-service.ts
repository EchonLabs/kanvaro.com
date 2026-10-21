/**
 * Reopening a completed stand-up (spec RUN-4, RUN-5, §17.6).
 *
 * The reason/window/org-admin rule this needs already exists, fully tested,
 * in `lifecycle.ts`'s `assertReopenable` (built in the Phase 5 lifecycle work,
 * before this module had a route to call it from — see plan risk OB-7). This
 * service is deliberately thin: it loads the stand-up, defers to
 * `assertReopenable` rather than re-deriving its checks, applies the
 * transition, and reports which later stand-ups now need recomputing.
 *
 * RUN-5's "sprint not Completed" half is **not** this service's concern.
 * `assertReopenable` accepts a `sprintCompleted` flag, but the route
 * (`/api/standups/[id]/reopen`) already loads the sprint to run its own
 * permission check and refuses before ever calling this function — so this
 * service always calls `assertReopenable` with `sprintCompleted: false` and
 * relies on the route as the sole gate for that rule. Keeping the sprint
 * lookup out of this module mirrors `carry-forward.ts`'s `AgeThresholds`
 * shape: settings and cross-entity facts are resolved by the caller and
 * handed in, not looked up here.
 *
 * What this function deliberately does **not** do: re-run the downstream
 * stand-ups' variance/carry-forward computation. RUN-4 requires that a
 * successor already Completed be recomputed once its predecessor reopens, but
 * this task's scope is only to report which stand-ups those are
 * (`affectedDownstreamStandupIds`) — actually re-invoking Phase 8/9's
 * recompute entry points for each of them belongs to whichever caller owns
 * that orchestration, not to this function.
 */
import { Standup } from '@/models/Standup'

import { assertReopenable } from './lifecycle'
import { StandupError, staleStandup } from './errors'
import { recordAudit } from './audit'

export interface ReopenInput {
  standupId: string
  reopenedBy: string
  isOrgAdmin: boolean
  reason: string
  organizationId: string
  projectId: string
  /** RUN-4: from `ProjectStandupSettings.reopenWindowHours` (default 24), looked up by the caller. */
  reopenWindowHours: number
  /** RUN-23 optimistic concurrency — the version the caller last read. */
  expectedVersion: number
}

export interface ReopenResult {
  standup: InstanceType<typeof Standup>
  /**
   * Later stand-ups in the same sprint that are already Completed, oldest
   * first, excluding the one just reopened. RUN-4 requires these be
   * recomputed; producing the list is this function's job, running the
   * recompute is the caller's.
   */
  affectedDownstreamStandupIds: string[]
}

/** RUN-4/5: reopens a Completed stand-up and reports its downstream successors. */
export async function reopenStandup(input: ReopenInput): Promise<ReopenResult> {
  const standup = await Standup.findById(input.standupId)
  if (!standup) throw new StandupError('NOT_FOUND', 'Stand-up not found.')

  if (standup.status !== 'Completed') {
    throw new StandupError('VALIDATION_FAILED', 'Only a completed stand-up can be reopened.')
  }

  if (standup.version !== input.expectedVersion) {
    throw staleStandup(standup.version, { standupId: input.standupId, status: standup.status })
  }

  if (!standup.completedAt) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'This stand-up has no completion time recorded, so its reopen window cannot be evaluated.'
    )
  }

  // See the module docblock: the sprint-Completed half of RUN-5 is the
  // route's job, so it is never true here.
  assertReopenable({
    completedAt: standup.completedAt,
    now: new Date(),
    reopenWindowHours: input.reopenWindowHours,
    reason: input.reason,
    isOrgAdmin: input.isOrgAdmin,
    sprintCompleted: false
  })

  standup.status = 'Reopened'
  standup.version += 1
  await standup.save()

  // RUN-4: successors already Completed need recomputing once this stand-up's
  // data can change again. Only the list is produced here — see the
  // docblock's scope note.
  const downstream = await Standup.find({
    sprint: standup.sprint,
    status: 'Completed',
    standupDate: { $gt: standup.standupDate }
  })
    .sort({ standupDate: 1 })
    .select('_id')
    .lean()

  await recordAudit({
    actor: { type: 'user', userId: input.reopenedBy },
    organizationId: input.organizationId,
    action: 'standup_reopened',
    entityType: 'standup',
    entityId: input.standupId,
    projectId: input.projectId,
    after: { reason: input.reason }
  })

  return {
    standup,
    affectedDownstreamStandupIds: downstream.map((doc) => String(doc._id))
  }
}
