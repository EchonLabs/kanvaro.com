/**
 * Auto pre-fill (Phase 7, Task 3 — ALO-10, ALO-11, ALO-12, and §6.3 OB-11).
 *
 * This planner decides what the PM finds already on the board when they open
 * the stand-up. Two properties matter more than the arithmetic.
 *
 * The first is ALO-12: pre-fill must never take a member over their effective
 * capacity. It fills to the line and stops, leaving the remainder for the PM.
 * A planner that overshoots turns every morning into a correction exercise and
 * teaches the team to distrust the numbers.
 *
 * The second is OB-11. ALO-10's third case — "a recurring ceremony or fixed
 * overhead configured on the project" — must produce **no allocation at all**.
 * Ceremonies are already a `'ceremony'` capacity adjustment (DN-1). Allocating
 * them as well would deduct the same meeting twice and push a task-less,
 * estimate-less row into the variance engine and the debt ledger. The omission
 * is deliberate, so it is asserted rather than merely absent.
 */
import type { CapacityBreakdown } from '../capacity'
import { minutes, type Minutes } from '../minutes'
import { planPrefill, type PrefillCandidate } from '../prefill'

const m = minutes

const KASUN = 'kasun'
const AMAL = 'amal'
const DATE = '2026-08-06'

/**
 * A capacity breakdown with only the fields the planner reads.
 *
 * Built by hand rather than through `computeCapacity` so a test can state "this
 * member has three hours left" directly. The service layer passes the real
 * thing; the planner only ever touches `memberId`, `effectiveMinutes`,
 * `allocatedMinutes` and `gapMinutes`.
 */
function breakdown(memberId: string, gapMinutes: number): CapacityBreakdown {
  return {
    memberId,
    date: DATE,
    nominalMinutes: m(480),
    adjustments: [],
    adjustedMinutes: m(480),
    outstandingDebtMinutes: m(0),
    overrunPolicy: 'absorb',
    effectiveMinutes: m(480),
    allocatedMinutes: m(480 - gapMinutes),
    gapMinutes: m(gapMinutes),
    status: gapMinutes > 0 ? 'under' : 'full',
    isUnavailable: false,
    strandedMinutes: m(0)
  }
}

/** An unavailable member: no capacity, nothing may be placed. */
function absent(memberId: string): CapacityBreakdown {
  return {
    ...breakdown(memberId, 0),
    effectiveMinutes: m(0),
    adjustedMinutes: m(0),
    allocatedMinutes: m(0),
    gapMinutes: m(0),
    status: 'unavailable',
    isUnavailable: true
  }
}

function carried(
  taskId: string,
  memberId: string,
  remainingEstimateMinutes: Minutes,
  overrides: Partial<PrefillCandidate> = {}
): PrefillCandidate {
  return {
    kind: 'carried_from_yesterday',
    taskId,
    memberId,
    remainingEstimateMinutes,
    ...overrides
  }
}

describe('planPrefill', () => {
  describe('ALO-10 case 1 — a task carried from yesterday', () => {
    it('places the whole remainder when it fits', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [carried('KAN-214', KASUN, m(180))],
        capacity: [breakdown(KASUN, 480)]
      })

      expect(plan.allocations).toEqual([
        {
          taskId: 'KAN-214',
          memberId: KASUN,
          plannedMinutes: 180,
          source: 'auto_prefilled',
          carriedFromAllocationId: undefined,
          carryChainRootId: undefined
        }
      ])
      expect(plan.skipped).toEqual([])
    })

    it('prefers a revised remaining estimate over the original (ALO-10 row 1)', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [
          carried('KAN-214', KASUN, m(180), { revisedRemainingEstimateMinutes: m(300) })
        ],
        capacity: [breakdown(KASUN, 480)]
      })

      expect(plan.allocations[0].plannedMinutes).toBe(300)
    })

    it('carries the chain links forward so age is one read, not a walk', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [
          carried('KAN-214', KASUN, m(180), {
            allocationId: 'alloc-yesterday',
            carryChainRootId: 'alloc-day-one'
          })
        ],
        capacity: [breakdown(KASUN, 480)]
      })

      expect(plan.allocations[0].carriedFromAllocationId).toBe('alloc-yesterday')
      expect(plan.allocations[0].carryChainRootId).toBe('alloc-day-one')
    })

    it('roots the chain at itself when the carried row is the first in it', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [carried('KAN-214', KASUN, m(180), { allocationId: 'alloc-yesterday' })],
        capacity: [breakdown(KASUN, 480)]
      })

      expect(plan.allocations[0].carryChainRootId).toBe('alloc-yesterday')
    })
  })

  describe('ALO-12 — pre-fill never exceeds effective capacity', () => {
    it('truncates a task larger than the gap rather than overshooting', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [carried('KAN-302', KASUN, m(480))],
        capacity: [breakdown(KASUN, 180)]
      })

      expect(plan.allocations[0].plannedMinutes).toBe(180)
    })

    it('truncates the second task rather than dropping it — it fills to the line', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [carried('KAN-214', KASUN, m(180)), carried('KAN-231', KASUN, m(240))],
        capacity: [breakdown(KASUN, 300)]
      })

      expect(plan.allocations.map((a) => [a.taskId, a.plannedMinutes])).toEqual([
        ['KAN-214', 180],
        ['KAN-231', 120]
      ])
    })

    it('stops entirely once the gap is closed, and says why', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [carried('KAN-214', KASUN, m(180)), carried('KAN-231', KASUN, m(240))],
        capacity: [breakdown(KASUN, 180)]
      })

      expect(plan.allocations).toHaveLength(1)
      expect(plan.skipped).toEqual([
        { taskId: 'KAN-231', memberId: KASUN, reason: 'no_capacity_remaining' }
      ])
    })

    it('never places a fragment below the allocation step — a four-minute row helps nobody', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [carried('KAN-214', KASUN, m(180)), carried('KAN-231', KASUN, m(240))],
        capacity: [breakdown(KASUN, 184)]
      })

      expect(plan.allocations).toHaveLength(1)
      expect(plan.skipped[0].reason).toBe('no_capacity_remaining')
    })

    it('places nothing on a member with no capacity at all', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [carried('KAN-277', KASUN, m(180))],
        capacity: [absent(KASUN)]
      })

      expect(plan.allocations).toEqual([])
      expect(plan.skipped).toEqual([
        { taskId: 'KAN-277', memberId: KASUN, reason: 'member_unavailable' }
      ])
    })

    it('keeps each member’s budget separate', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [carried('KAN-214', KASUN, m(480)), carried('KAN-255', AMAL, m(120))],
        capacity: [breakdown(KASUN, 180), breakdown(AMAL, 480)]
      })

      expect(plan.allocations.map((a) => [a.memberId, a.plannedMinutes])).toEqual([
        [KASUN, 180],
        [AMAL, 120]
      ])
    })
  })

  describe('ALO-10 case 2 — a task pre-assigned in planning and starting today', () => {
    it('places it against the remaining gap', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [
          { kind: 'pre_assigned_starting_today', taskId: 'KAN-401', memberId: KASUN, remainingEstimateMinutes: m(240) }
        ],
        capacity: [breakdown(KASUN, 480)]
      })

      expect(plan.allocations[0]).toMatchObject({ taskId: 'KAN-401', plannedMinutes: 240 })
    })

    it('yields to carried work — yesterday’s commitment is placed first', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [
          { kind: 'pre_assigned_starting_today', taskId: 'KAN-401', memberId: KASUN, remainingEstimateMinutes: m(240) },
          carried('KAN-214', KASUN, m(180))
        ],
        capacity: [breakdown(KASUN, 300)]
      })

      expect(plan.allocations.map((a) => [a.taskId, a.plannedMinutes])).toEqual([
        ['KAN-214', 180],
        ['KAN-401', 120]
      ])
    })
  })

  describe('ALO-10 case 3 — a ceremony or fixed overhead (OB-11)', () => {
    it('produces no allocation, and records why', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [
          { kind: 'ceremony', taskId: 'support-rota', memberId: KASUN, remainingEstimateMinutes: m(120) }
        ],
        capacity: [breakdown(KASUN, 480)]
      })

      expect(plan.allocations).toEqual([])
      expect(plan.skipped).toEqual([
        {
          taskId: 'support-rota',
          memberId: KASUN,
          reason: 'ceremony_is_capacity_not_allocation'
        }
      ])
    })

    it('does not consume the member’s gap — the ceremony already reduced it', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [
          { kind: 'ceremony', taskId: 'support-rota', memberId: KASUN, remainingEstimateMinutes: m(120) },
          carried('KAN-214', KASUN, m(180))
        ],
        capacity: [breakdown(KASUN, 180)]
      })

      expect(plan.allocations).toEqual([
        expect.objectContaining({ taskId: 'KAN-214', plannedMinutes: 180 })
      ])
    })
  })

  describe('ALO-11 — every produced row is marked', () => {
    it('stamps source auto_prefilled on all of them', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [carried('KAN-214', KASUN, m(60)), carried('KAN-231', KASUN, m(60))],
        capacity: [breakdown(KASUN, 480)]
      })

      expect(plan.allocations.every((a) => a.source === 'auto_prefilled')).toBe(true)
    })
  })

  describe('determinism', () => {
    it('produces an identical plan when run twice — SCH-4 idempotence starts here', () => {
      const input = {
        date: DATE,
        candidates: [
          carried('KAN-214', KASUN, m(180)),
          carried('KAN-231', KASUN, m(240)),
          carried('KAN-255', AMAL, m(120))
        ],
        capacity: [breakdown(KASUN, 300), breakdown(AMAL, 480)]
      }

      expect(planPrefill(input)).toEqual(planPrefill(input))
    })

    it('skips a candidate whose member has no capacity row at all', () => {
      // A member who left the project between generation and the stand-up. The
      // planner must not invent a budget for them.
      const plan = planPrefill({
        date: DATE,
        candidates: [carried('KAN-214', 'departed', m(180))],
        capacity: [breakdown(KASUN, 480)]
      })

      expect(plan.allocations).toEqual([])
      expect(plan.skipped[0].reason).toBe('member_not_on_board')
    })

    it('skips an unestimated task rather than placing a zero row (CC-2, CC-5)', () => {
      const plan = planPrefill({
        date: DATE,
        candidates: [carried('KAN-999', KASUN, m(0))],
        capacity: [breakdown(KASUN, 480)]
      })

      expect(plan.allocations).toEqual([])
      expect(plan.skipped[0].reason).toBe('task_not_estimated')
    })
  })
})
