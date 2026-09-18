/**
 * The planning screen's step gates (UI-6).
 *
 * Pure, and exported for the same reason `resolveDrop` is: the rule that
 * decides whether a PM can open a poker round is worth testing as a table
 * rather than by driving a 1000-line component.
 *
 * Every gate here reads the **server's** checklist rather than recomputing the
 * rule from raw tasks. The server re-evaluates on completion anyway, so a
 * second client-side implementation could only ever drift from it — and the
 * drift would show up as a button that looks enabled and then fails.
 */
import { standupStrings } from '@/lib/standup/strings'

import { type ChecklistItemView } from '../PlanningChecklist'

export type StepId = 'scope' | 'assign' | 'estimate' | 'complete'
export type StepState = 'locked' | 'current' | 'done'

export interface GateInput {
  hasSession: boolean
  scopeCount: number
  items: ChecklistItemView[]
  blockers: ChecklistItemView[]
  /** Tasks still needing a poker round: unlocked and not yet covered. */
  unpokeredCount: number
}

export interface GateVerdict {
  enabled: boolean
  reason: string
}

export function checkById(
  items: ChecklistItemView[],
  checkId: string
): ChecklistItemView | undefined {
  return items.find((item) => item.checkId === checkId)
}

/** Whether a check is known to have passed. An absent check is not a pass. */
function passed(items: ChecklistItemView[], checkId: string): boolean {
  return checkById(items, checkId)?.passed === true
}

/**
 * Can a planning poker round open?
 *
 * PC-8 is the gate: every task needs an owner before the round starts, so the
 * room can see whose estimate each card is for. An intern and a senior need
 * different numbers for the same task, and that conversation is impossible
 * when nobody knows who is taking it.
 */
export function pokerGate(input: GateInput): GateVerdict {
  const { planning } = standupStrings

  if (!input.hasSession) return { enabled: false, reason: planning.stepNoSession() }
  if (input.scopeCount === 0) return { enabled: false, reason: planning.stepScopeEmpty() }

  const pc8 = checkById(input.items, 'PC-8')
  if (pc8 && !pc8.passed) {
    return { enabled: false, reason: pc8.message ?? planning.pc8({ count: 1 }) }
  }

  if (input.unpokeredCount === 0) {
    return { enabled: false, reason: planning.pokerNothingToEstimate() }
  }

  return { enabled: true, reason: planning.pokerReady() }
}

/**
 * Can planning complete?
 *
 * Names the first blocking check, which is UI-6's contract: a count of
 * failures without saying which is exactly the hunting the checklist exists
 * to eliminate.
 */
export function completeGate(input: GateInput): GateVerdict {
  const { planning } = standupStrings

  if (!input.hasSession) return { enabled: false, reason: planning.stepNoSession() }

  const first = input.blockers[0]
  if (first) {
    return {
      enabled: false,
      reason: `${first.checkId}: ${first.message ?? 'This check must pass first.'}`
    }
  }

  return { enabled: true, reason: planning.completeReady() }
}

/**
 * How far along the rail the PM is.
 *
 * A step is `done` once its own check passes, `current` for the first one that
 * does not, and `locked` after that. Only one step is ever current, so the rail
 * reads as a position rather than a set of independent badges.
 */
export function stepStates(input: GateInput): Record<StepId, StepState> {
  const scopeDone = input.hasSession && input.scopeCount > 0
  const assignDone = scopeDone && passed(input.items, 'PC-8')
  const estimateDone =
    assignDone && passed(input.items, 'PC-3') && passed(input.items, 'PC-9')
  const completeDone = estimateDone && input.blockers.length === 0

  const order: Array<[StepId, boolean]> = [
    ['scope', scopeDone],
    ['assign', assignDone],
    ['estimate', estimateDone],
    ['complete', completeDone]
  ]

  const states = {} as Record<StepId, StepState>
  let currentTaken = false
  for (const [id, done] of order) {
    if (done) {
      states[id] = 'done'
    } else if (!currentTaken) {
      states[id] = 'current'
      currentTaken = true
    } else {
      states[id] = 'locked'
    }
  }
  return states
}
