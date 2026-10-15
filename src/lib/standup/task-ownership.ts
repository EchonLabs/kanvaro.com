/**
 * Which allocation carries a task's variance (plan decision D-D).
 *
 * A task has one original estimate and, if it overruns, one task-scope
 * overrun — but it may have several allocations, because two people can work
 * the same task on the same day (ALO-9's deliberate pairing) or on different
 * days. Day variance belongs to each of them: everybody owns the hours they
 * personally burned. Task variance belongs to exactly one, or the sprint
 * report counts the same overrun twice and the debt ledger accrues it twice.
 *
 * `assignedTo` cannot settle it on its own. It is an array whose order nothing
 * in the product promises to preserve, so "the first assignee" is a tiebreak,
 * not a decision. `Task.standupOwner` is where a decision is recorded, and it
 * is set only when somebody makes one — the fallback below is what runs until
 * then, and it is deterministic, which is what the classifier actually needs.
 *
 * Pure by design: strings in, answer out. The classifier is re-runnable
 * (VAR-3) and cannot depend on a lookup that might answer differently later.
 */

export interface TaskOwnershipInput {
  /** An explicit choice, when somebody has made one. */
  standupOwner?: string
  /** The tiebreak, in stored order. */
  assignedTo?: string[]
}

/**
 * D-D. The member whose allocation carries the task-scope variance.
 *
 * `undefined` for a task nobody is assigned and nobody owns — an unassigned
 * task's overrun belongs to no individual's ledger, and inventing an owner for
 * it would put debt on somebody who never agreed to the work.
 */
export function resolveStandupOwner(task: TaskOwnershipInput): string | undefined {
  if (task.standupOwner) return task.standupOwner
  return task.assignedTo?.[0]
}

/** True when this allocation is the one that owns the task's variance. */
export function ownsTaskVariance(
  allocation: { memberId: string },
  task: TaskOwnershipInput
): boolean {
  const owner = resolveStandupOwner(task)
  return owner !== undefined && owner === allocation.memberId
}
