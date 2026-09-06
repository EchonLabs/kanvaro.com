/**
 * The two answers a stand-up demands (spec VAR-15, VAR-16, AC-17, AC-18).
 *
 * When yesterday's plan did not survive contact with the day, the PM owes one
 * of two answers before the stand-up can complete (CC-3):
 *
 *   "How much longer?"  — a revised remaining estimate, with a reason.
 *   "Why did that not happen?" — a reason for planned time nobody spent.
 *
 * **The original estimate is never touched** (VAR-16, AC-17, INV-4). The whole
 * variance engine rests on that separation: the sprint report has to be able to
 * say "you estimated six and it took eleven", which is impossible if the
 * estimate is quietly edited every time reality disagrees with it. The revision
 * appends to `Task.estimateRevisions` and sets `remainingEstimateMinutes` in
 * the *same* write, because the DAT-7 model hook refuses either alone.
 *
 * Both answers are also written onto the allocation, where Panel 3 and CC-3
 * read them. The stand-up is hours away from completing when they are given,
 * and the `AllocationVariance` row that will freeze them does not exist yet.
 */
import { Allocation } from '@/models/Allocation'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'

import { recordAudit, type AuditActor } from './audit'
import { findPreviousStandup } from './debt-position'
import { StandupError } from './errors'
import { REVISION_REASONS, MIN_REVISION_DETAIL_LENGTH, type RevisionReason } from './estimates'
import { minutes, type Minutes } from './minutes'
import { loadTotalLoggedOnTasks } from './time-logs'

/** §15.8.5: the revised remaining estimate is entered in 0.25h steps. */
export const REVISION_STEP_MINUTES = 15
/** §15.8.5: 0 to 999 hours. */
export const MAX_REVISION_MINUTES = 999 * 60
/**
 * AC-18's reason floor. Ten characters, the same floor a carry-forward note
 * carries in Phase 9 — enough to be a sentence, short enough not to invite
 * padding.
 */
export const MIN_NOT_STARTED_REASON_LENGTH = 10

export interface ReviseRemainingEstimateInput {
  standupId: string
  allocationId: string
  newRemainingMinutes: Minutes | number
  reason: RevisionReason
  detail?: string
  expectedVersion: number
  actor: { userId: string }
}

export interface ReviseRemainingEstimateResult {
  task: {
    taskId: string
    originalEstimateMinutes: Minutes
    remainingEstimateMinutes: Minutes
  }
  /** §15.11's projected-total line: what this task will have cost if the revision holds. */
  projectedTotalMinutes: Minutes
  standupVersion: number
}

export async function reviseRemainingEstimate(
  input: ReviseRemainingEstimateInput
): Promise<ReviseRemainingEstimateResult> {
  const newRemaining = assertRevisable(input.newRemainingMinutes)
  const reason = assertReason(input.reason, input.detail)

  const { standup, allocation } = await loadTarget(
    input.standupId,
    input.allocationId,
    input.expectedVersion
  )

  const task = await Task.findById(allocation.task).lean() as any
  if (!task) {
    throw new StandupError('NOT_FOUND', 'That task no longer exists.', {
      taskId: String(allocation.task)
    })
  }

  const previousRemaining = Number(task.remainingEstimateMinutes ?? 0)

  // VAR-16 / DAT-7: the set and the history entry are one write. The model hook
  // rejects a bare `remainingEstimateMinutes` update precisely so a revision
  // can never happen without leaving a trace of who changed it and why.
  await Task.updateOne(
    { _id: task._id },
    {
      $set: { remainingEstimateMinutes: newRemaining },
      $push: {
        estimateRevisions: {
          previousRemainingMinutes: previousRemaining,
          newRemainingMinutes: newRemaining,
          reason: reason.reason,
          ...(reason.detail ? { detail: reason.detail } : {}),
          revisedBy: input.actor.userId,
          revisedAt: new Date(),
          standup: input.standupId
        }
      }
    }
  )

  await Allocation.updateOne(
    { _id: allocation._id },
    {
      $set: {
        revisedRemainingMinutes: newRemaining,
        revisionReason: reason.reason,
        ...(reason.detail ? { revisionDetail: reason.detail } : {}),
        updatedBy: input.actor.userId
      }
    }
  )

  const standupVersion = await bumpVersion(input.standupId)

  await recordAudit({
    actor: userActor(input.actor),
    organizationId: String(standup.organization),
    projectId: String(standup.project),
    action: 'estimate_revised',
    entityType: 'task',
    entityId: String(task._id),
    entityName: task.displayId,
    before: { remainingEstimateMinutes: previousRemaining },
    after: {
      remainingEstimateMinutes: newRemaining,
      reason: reason.reason,
      detail: reason.detail
    },
    context: { standupId: input.standupId, allocationId: input.allocationId }
  })

  const originalEstimateMinutes = minutes(Number(task.originalEstimateMinutes ?? 0))

  // Aggregated from the time entries, not read off `Task.totalLoggedMinutes`.
  // That mirror is maintained by the time-tracking module and can lag, and this
  // number is the one §15.11 says decides whether the PM splits the task or
  // descopes it — "11.0h against a 6.0h estimate" is the whole point of the
  // line, and a stale mirror would quietly render it as 3.0h.
  const totalLogged =
    (await loadTotalLoggedOnTasks([String(task._id)])).get(String(task._id)) ?? 0

  return {
    task: {
      taskId: String(task._id),
      originalEstimateMinutes,
      remainingEstimateMinutes: newRemaining
    },
    // §15.11 calls this line a requirement: seeing "11.0h against a 6.0h
    // estimate" is the moment a PM decides whether to split or descope.
    projectedTotalMinutes: minutes(totalLogged + newRemaining),
    standupVersion
  }
}

export interface RecordNotStartedReasonInput {
  standupId: string
  allocationId: string
  reason: string
  expectedVersion: number
  actor: { userId: string }
}

export async function recordNotStartedReason(
  input: RecordNotStartedReasonInput
): Promise<{ standupVersion: number }> {
  const reason = (input.reason ?? '').trim()
  if (reason.length < MIN_NOT_STARTED_REASON_LENGTH) {
    throw new StandupError(
      'VALIDATION_FAILED',
      `Say why the planned time did not happen — at least ${MIN_NOT_STARTED_REASON_LENGTH} characters.`,
      { field: 'reason', minLength: MIN_NOT_STARTED_REASON_LENGTH }
    )
  }

  const { standup, allocation } = await loadTarget(
    input.standupId,
    input.allocationId,
    input.expectedVersion
  )

  await Allocation.updateOne(
    { _id: allocation._id },
    { $set: { notStartedReason: reason, updatedBy: input.actor.userId } }
  )

  const standupVersion = await bumpVersion(input.standupId)

  await recordAudit({
    actor: userActor(input.actor),
    organizationId: String(standup.organization),
    projectId: String(standup.project),
    action: 'allocation_updated',
    entityType: 'allocation',
    entityId: String(allocation._id),
    before: { notStartedReason: allocation.notStartedReason ?? null },
    after: { notStartedReason: reason },
    context: { standupId: input.standupId }
  })

  return { standupVersion }
}

// --- internals --------------------------------------------------------------

const MUTABLE_STATUSES = new Set(['Scheduled', 'Ready', 'In_Progress', 'Reopened'])

/**
 * Finds the allocation a revision is about, and guards the stand-up it is
 * being answered in.
 *
 * The row usually belongs to **yesterday** — that is whose plan is being
 * explained — while the version and the open/closed check belong to the
 * stand-up running now. Allowing today's own rows too covers the mid-day case
 * where an estimate is revised on work in flight.
 */
async function loadTarget(standupId: string, allocationId: string, expectedVersion: number) {
  const standup = (await Standup.findById(standupId).lean()) as any
  if (!standup) {
    throw new StandupError('NOT_FOUND', 'That stand-up no longer exists.', { standupId })
  }

  if (standup.status === 'Completed') {
    throw new StandupError(
      'IMMUTABLE_COMPLETED_STANDUP',
      'This stand-up is completed, so its numbers can no longer be changed.',
      { standupId, date: standup.standupDate }
    )
  }
  if (!MUTABLE_STATUSES.has(standup.status)) {
    throw new StandupError(
      'STANDUP_NOT_STARTABLE',
      `This stand-up is ${String(standup.status).toLowerCase()}, so its numbers cannot be changed.`,
      { status: standup.status }
    )
  }

  const current = standup.version ?? 0
  if (current !== expectedVersion) {
    throw new StandupError(
      'STALE_STANDUP',
      'Somebody else changed this stand-up while you were working.',
      { currentVersion: current, standupId, status: standup.status, date: standup.standupDate }
    )
  }

  const allocation = (await Allocation.findById(allocationId).lean()) as any
  if (!allocation) {
    throw new StandupError('NOT_FOUND', 'That allocation no longer exists.', { allocationId })
  }

  const previous = await findPreviousStandup(standup)
  const belongsHere =
    String(allocation.standup) === standupId ||
    (previous && String(allocation.standup) === String(previous._id))

  if (!belongsHere) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'That allocation belongs to a different stand-up.',
      { allocationId, standupId }
    )
  }

  return { standup, allocation }
}

function assertRevisable(value: Minutes | number): Minutes {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 0) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'The remaining estimate must be a whole number of minutes.',
      { field: 'newRemainingMinutes', value }
    )
  }
  if (numeric > MAX_REVISION_MINUTES) {
    throw new StandupError('VALIDATION_FAILED', 'That is more than 999 hours.', {
      field: 'newRemainingMinutes',
      value
    })
  }
  if (numeric % REVISION_STEP_MINUTES !== 0) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'Remaining estimates are entered in quarter-hour steps.',
      { field: 'newRemainingMinutes', value, stepMinutes: REVISION_STEP_MINUTES }
    )
  }
  return minutes(numeric)
}

function assertReason(
  reason: RevisionReason,
  detail?: string
): { reason: RevisionReason; detail?: string } {
  if (!REVISION_REASONS.includes(reason)) {
    throw new StandupError('VALIDATION_FAILED', 'That is not a revision reason.', {
      field: 'reason',
      reason
    })
  }

  const trimmed = (detail ?? '').trim()
  // VAR-15: `other` is the escape hatch, so it has to say something. A fixed
  // list exists so Phase 8's estimation-quality reporting can group by it, and
  // an unexplained "other" contributes nothing to that.
  if (reason === 'other' && trimmed.length < MIN_REVISION_DETAIL_LENGTH) {
    throw new StandupError(
      'VALIDATION_FAILED',
      `Say a little more — at least ${MIN_REVISION_DETAIL_LENGTH} characters.`,
      { field: 'detail', minLength: MIN_REVISION_DETAIL_LENGTH }
    )
  }

  return trimmed ? { reason, detail: trimmed } : { reason }
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
