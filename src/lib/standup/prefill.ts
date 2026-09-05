/**
 * Auto pre-fill (spec §11.3, ALO-10 … ALO-12; plan §6.3 OB-11).
 *
 * What the PM finds already on the board when they open the stand-up. Pure: it
 * takes yesterday's open work, today's pre-assigned starts, and each member's
 * capacity, and returns a plan. The service layer writes it.
 *
 * Two rules dominate the design.
 *
 * **ALO-12 — fill to the line and stop.** Pre-fill may never take a member over
 * effective capacity. It truncates the task that straddles the line rather than
 * dropping it, because a member with three hours left and a four-hour task
 * genuinely has three hours of that task to do today; the remainder carries.
 *
 * **OB-11 — a ceremony is capacity, never an allocation.** ALO-10's third case
 * reads "a recurring ceremony or fixed overhead configured on the project, for
 * example 2h support rota", which looks like an instruction to allocate it.
 * Doing so would be a double deduction — `ceremonies.ts` has already removed
 * those minutes from `effectiveMinutes` (DN-1) — and it would put a row with no
 * task and no estimate in front of the variance engine and the debt ledger.
 * The candidate is therefore recorded as skipped, with the reason, so the
 * omission is a decision on the record rather than a hole somebody re-fills in
 * six months.
 */
import { ALLOCATION_STEP_MINUTES } from './allocation'
import type { CapacityBreakdown } from './capacity'
import type { AllocationSource } from '@/models/Allocation'
import { clampToZero, minMinutes, minutes, subtractMinutes, type Minutes } from './minutes'

/** Which ALO-10 row a candidate came from. Decides both order and treatment. */
export type PrefillKind =
  | 'carried_from_yesterday'
  | 'pre_assigned_starting_today'
  | 'ceremony'

/** Why a candidate produced no allocation. Every skip is explicable. */
export type PrefillSkipReason =
  | 'ceremony_is_capacity_not_allocation'
  | 'no_capacity_remaining'
  | 'member_unavailable'
  | 'member_not_on_board'
  | 'task_not_estimated'

export interface PrefillCandidate {
  kind: PrefillKind
  taskId: string
  memberId: string
  remainingEstimateMinutes: Minutes
  /** ALO-10 row 1 prefers this when present. */
  revisedRemainingEstimateMinutes?: Minutes
  /** The allocation this one continues, when the candidate is carried work. */
  allocationId?: string
  /** The chain's first allocation, if this is not already it. */
  carryChainRootId?: string
}

export interface PlannedAllocation {
  taskId: string
  memberId: string
  plannedMinutes: Minutes
  /** ALO-11's mark. Always this value — that is what makes the row removable in one click. */
  source: Extract<AllocationSource, 'auto_prefilled'>
  carriedFromAllocationId?: string
  carryChainRootId?: string
}

export interface PrefillSkip {
  taskId: string
  memberId: string
  reason: PrefillSkipReason
}

export interface PrefillPlan {
  allocations: PlannedAllocation[]
  skipped: PrefillSkip[]
}

export interface PlanPrefillInput {
  date: string
  candidates: readonly PrefillCandidate[]
  /** One entry per member on the board, from `computeCapacity`. */
  capacity: readonly CapacityBreakdown[]
}

/**
 * ALO-10's ordering.
 *
 * Carried work is placed before pre-assigned starts because yesterday's
 * commitment outranks today's intention: when the two compete for the last two
 * hours of a day, the half-finished task is the one that should keep them.
 */
const KIND_ORDER: Record<PrefillKind, number> = {
  carried_from_yesterday: 0,
  pre_assigned_starting_today: 1,
  ceremony: 2
}

export function planPrefill(input: PlanPrefillInput): PrefillPlan {
  const allocations: PlannedAllocation[] = []
  const skipped: PrefillSkip[] = []

  /** Remaining room per member, decremented as the plan is built. */
  const budget = new Map<string, Minutes>()
  for (const breakdown of input.capacity) {
    budget.set(breakdown.memberId, clampToZero(breakdown.gapMinutes))
  }

  const unavailable = new Set(
    input.capacity.filter((breakdown) => breakdown.effectiveMinutes <= 0).map((b) => b.memberId)
  )

  // A stable sort by ALO-10 row, preserving the caller's order within a row so
  // the plan is reproducible — the idempotence the generator depends on.
  const ordered = [...input.candidates].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
  )

  for (const candidate of ordered) {
    const skip = (reason: PrefillSkipReason) => {
      skipped.push({ taskId: candidate.taskId, memberId: candidate.memberId, reason })
    }

    // OB-11 first, and before any capacity test: a ceremony is not competing
    // for the gap, it is one of the reasons the gap is the size it is.
    if (candidate.kind === 'ceremony') {
      skip('ceremony_is_capacity_not_allocation')
      continue
    }

    if (!budget.has(candidate.memberId)) {
      skip('member_not_on_board')
      continue
    }

    if (unavailable.has(candidate.memberId)) {
      skip('member_unavailable')
      continue
    }

    const wanted = clampToZero(
      candidate.revisedRemainingEstimateMinutes ?? candidate.remainingEstimateMinutes
    )
    if (wanted <= 0) {
      skip('task_not_estimated')
      continue
    }

    const available = budget.get(candidate.memberId) as Minutes

    // Below one step there is no useful row left to place. A four-minute
    // allocation is not a plan, it is noise on the board and a rounding error
    // in tomorrow's variance.
    if (available < ALLOCATION_STEP_MINUTES) {
      skip('no_capacity_remaining')
      continue
    }

    const plannedMinutes = minMinutes(wanted, available)

    allocations.push({
      taskId: candidate.taskId,
      memberId: candidate.memberId,
      plannedMinutes,
      source: 'auto_prefilled',
      carriedFromAllocationId: candidate.allocationId,
      // A carried row with no recorded root *is* the root — the chain starts at
      // the first day the task was allocated, and storing it now saves Phase 9
      // walking the chain to age the register item.
      carryChainRootId: candidate.carryChainRootId ?? candidate.allocationId
    })

    budget.set(candidate.memberId, subtractMinutes(available, plannedMinutes))
  }

  return { allocations, skipped }
}

/** Total minutes a plan would place. For the caller's audit line. */
export function plannedTotal(plan: PrefillPlan): Minutes {
  return minutes(
    plan.allocations.reduce<number>((total, row) => total + row.plannedMinutes, 0)
  )
}
