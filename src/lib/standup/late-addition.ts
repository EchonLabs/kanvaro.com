/**
 * The rule for estimating a task added to a sprint that has already left
 * planning (spec E14, PLN-15, DAT-6).
 *
 * Two routes apply it: the inline estimate (`POST /api/tasks/:id/estimate`) and
 * planning poker opened on a running sprint. Keeping the rule here means the two
 * cannot drift apart — poker must not become a way round what the manual path
 * enforces.
 */
import { StandupError } from './errors'
import { hasStandups, type SprintState } from './sprint-states'

/** A late-addition reason shorter than this does not explain anything. */
export const MIN_LATE_ADDITION_REASON_LENGTH = 10

/** The sprint has left planning, so anything estimated now is a late addition. */
export function isPastPlanning(sprintStatus: string | null | undefined): boolean {
  return !!sprintStatus && hasStandups(sprintStatus as SprintState)
}

/**
 * A task poker may estimate once the sprint is past planning: no estimate of
 * any kind and not frozen.
 *
 * "Has an estimate" is either field. The create-task form stores its
 * "Estimated Hours" only in the legacy `estimatedHours` — `POST /api/tasks`
 * never sets `originalEstimateMinutes`, and only an edit mirrors one into the
 * other. Reading `originalEstimateMinutes` alone would call a task estimated at
 * creation unestimated, offer it to poker, and have finalize overwrite it.
 * `estimateMethod` is no help either: a task estimated at creation carries none.
 */
export function isUnestimated(task: {
  originalEstimateMinutes?: number | null
  estimatedHours?: number | null
  estimateLockedAt?: Date | string | null
}): boolean {
  return (
    !((task.originalEstimateMinutes ?? 0) > 0) &&
    !((task.estimatedHours ?? 0) > 0) &&
    !task.estimateLockedAt
  )
}

/** Throws unless `reason` says why the task is being added and estimated now. */
export function assertLateAdditionReason(reason: string | undefined | null): string {
  const trimmed = (reason ?? '').trim()
  if (trimmed.length < MIN_LATE_ADDITION_REASON_LENGTH) {
    throw new StandupError(
      'VALIDATION_FAILED',
      `This sprint has already been planned. Say why this task is being added and estimated now (at least ${MIN_LATE_ADDITION_REASON_LENGTH} characters).`
    )
  }
  return trimmed
}
