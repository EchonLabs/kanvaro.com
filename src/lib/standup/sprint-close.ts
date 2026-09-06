/**
 * Final-day sprint-close readiness (spec CC-8, CFW-9, §15.8.11).
 *
 * Pure, DB-free — `sprint-close-service.ts` loads the database rows and hands
 * them here, the same split `completion-checks.ts` and its `sprint-health.ts`
 * neighbour already use.
 */
import { ZERO_MINUTES, type Minutes } from './minutes'
import type { SprintCloseDispositionType } from '@/models/Task'

export type ProjectedOutcome = 'will_finish' | 'at_risk' | 'cannot_finish'

/**
 * `will_finish` when today's remaining hours cover what is left; `at_risk`
 * when they do not but are at least half of what remains (the gap could
 * plausibly close with an extra push); `cannot_finish` otherwise, including
 * when nothing is available today and work remains.
 */
export function computeProjectedOutcome(input: {
  remainingEstimateMinutes: Minutes
  hoursAvailableTodayMinutes: Minutes
}): ProjectedOutcome {
  const remaining = input.remainingEstimateMinutes
  if (remaining <= ZERO_MINUTES) return 'will_finish'

  const available = input.hoursAvailableTodayMinutes
  if (available >= remaining) return 'will_finish'
  if (available > ZERO_MINUTES && available * 2 >= remaining) return 'at_risk'
  return 'cannot_finish'
}

export interface OpenTaskReadiness {
  taskId: string
  taskKey?: string
  ownerName?: string
  remainingEstimateMinutes: Minutes
  hoursAvailableTodayMinutes: Minutes
  projectedOutcome: ProjectedOutcome
  disposition?: SprintCloseDispositionType
}

/** CC-8. Every open sprint task must carry a disposition before completion. */
export function evaluateTaskDispositions(
  tasks: readonly OpenTaskReadiness[]
): { offenders: OpenTaskReadiness[] } {
  return { offenders: tasks.filter((task) => task.disposition === undefined) }
}

export interface CarryForwardDispositionRow {
  itemId: string
  taskKey?: string
  status: string
  hasResolution: boolean
}

/**
 * `OPEN_CARRY_FORWARD_STATUSES` in `@/models/CarryForwardItem`, restated
 * rather than imported: this module is pure and DB-free by contract (a client
 * component imports it), and that constant lives in a Mongoose model file.
 */
const OPEN_STATUSES = new Set(['open', 'noted', 'escalated'])

/** CFW-9. Every still-open carry-forward item must be resolved before completion. */
export function evaluateFinalDayCarryForwardDisposition(
  items: readonly CarryForwardDispositionRow[]
): { offenders: CarryForwardDispositionRow[] } {
  return {
    offenders: items.filter(
      (item) => OPEN_STATUSES.has(item.status) && !item.hasResolution
    )
  }
}
