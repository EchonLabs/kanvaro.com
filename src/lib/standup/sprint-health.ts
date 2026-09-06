import type { Minutes } from './minutes'

export interface SprintHealthInput {
  /** Sum of every open task's remaining estimate, sprint-wide. */
  remainingEstimateMinutes: Minutes
  /** Sum of every member's remaining capacity for the rest of the sprint (today plus future working days). */
  remainingCapacityMinutes: Minutes
}

export interface SprintHealthResult {
  exceedsCapacity: boolean
  overageMinutes: Minutes
}

/** CC-11 (soft) / N12. §10.3's "remaining estimates do not exceed remaining sprint capacity". */
export function computeSprintHealth(input: SprintHealthInput): SprintHealthResult {
  const overage = Math.max(0, input.remainingEstimateMinutes - input.remainingCapacityMinutes)
  return { exceedsCapacity: overage > 0, overageMinutes: overage as Minutes }
}
