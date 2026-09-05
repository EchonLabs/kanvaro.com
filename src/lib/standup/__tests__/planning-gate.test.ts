/**
 * The planning gate and waiver (spec PLN-2/16/17/18/19, AC-5, AC-7, E15).
 */
import type { ChecklistItem } from '../planning-checklist'
import {
  MIN_WAIVER_JUSTIFICATION_LENGTH,
  assertPlanningGate,
  assertTaskAllocatable,
  buildWaiver,
  describeWaiver,
  evaluatePlanningGate,
  isWaiverActive,
  waivedChecks,
  type PlanningWaiver
} from '../planning-gate'

const NOW = new Date('2026-08-24T09:00:00Z')

const blocker = (checkId: string): ChecklistItem => ({
  checkId,
  kind: 'mandatory',
  passed: false,
  message: `${checkId} failed`
})

const waiver = (overrides: Partial<PlanningWaiver> = {}): PlanningWaiver => ({
  waivedCheckIds: ['PC-4'],
  justification: 'Client signed off verbally; written acceptance criteria follow on Monday.',
  issuedBy: 'admin',
  issuedAt: NOW,
  expiresAt: new Date('2026-08-31T09:00:00Z'),
  ...overrides
})

const gate = (overrides: Record<string, any> = {}) => ({
  sprintState: 'active' as const,
  sprintStartDate: '2026-08-24',
  today: '2026-08-24',
  blockers: [] as ChecklistItem[],
  now: NOW,
  ...overrides
})

describe('AC-5 — a stand-up cannot run without completed planning', () => {
  it('refuses while the sprint is still planning', () => {
    const result = evaluatePlanningGate(gate({ sprintState: 'planning' }))
    expect(result.passed).toBe(false)
  })

  it('refuses a draft sprint', () => {
    expect(evaluatePlanningGate(gate({ sprintState: 'draft' })).passed).toBe(false)
  })

  it('throws with the code and every failing item', () => {
    try {
      assertPlanningGate(gate({ sprintState: 'planning', blockers: [blocker('PC-3')] }))
      throw new Error('should have thrown')
    } catch (error: any) {
      expect(error.code).toBe('PLANNING_GATE_NOT_PASSED')
      expect(error.status).toBe(409)
      expect(error.details.failingChecks).toHaveLength(1)
      expect(error.details.failingChecks[0].checkId).toBe('PC-3')
    }
  })

  it('passes for an active sprint with nothing failing', () => {
    expect(evaluatePlanningGate(gate()).passed).toBe(true)
    expect(() => assertPlanningGate(gate())).not.toThrow()
  })

  it('separates "not planned" from "too early"', () => {
    // A perfectly planned sprint can still be refused for being in the future,
    // and the two are not interchangeable.
    const tooEarly = evaluatePlanningGate(
      gate({ sprintState: 'planned', today: '2026-08-20' })
    )
    expect(tooEarly.passed).toBe(false)
    expect(tooEarly.remainingBlockers).toEqual([])
  })

  it('lets a planned sprint run on its start date', () => {
    expect(
      evaluatePlanningGate(gate({ sprintState: 'planned', today: '2026-08-24' })).passed
    ).toBe(true)
  })
})

describe('PLN-16/18 — an active waiver excuses the checks it names', () => {
  it('lets the gate pass despite a failing check', () => {
    const result = evaluatePlanningGate(
      gate({ blockers: [blocker('PC-4')], waiver: waiver() })
    )

    expect(result.passed).toBe(true)
    expect(result.waivedBlockers.map((item) => item.checkId)).toEqual(['PC-4'])
    expect(result.remainingBlockers).toEqual([])
  })

  it('does not excuse a check it does not name', () => {
    const result = evaluatePlanningGate(
      gate({ blockers: [blocker('PC-4'), blocker('PC-5')], waiver: waiver() })
    )

    expect(result.passed).toBe(false)
    expect(result.remainingBlockers.map((item) => item.checkId)).toEqual(['PC-5'])
  })

  it('stops excusing anything once expired', () => {
    const expired = waiver({ expiresAt: new Date('2026-08-20T09:00:00Z') })

    expect(isWaiverActive(expired, NOW)).toBe(false)
    expect(waivedChecks(expired, NOW)).toEqual([])
    expect(evaluatePlanningGate(gate({ blockers: [blocker('PC-4')], waiver: expired })).passed).toBe(
      false
    )
  })

  it('stops excusing anything once revoked', () => {
    const revoked = waiver({ revokedAt: NOW })
    expect(isWaiverActive(revoked, NOW)).toBe(false)
  })

  it('treats a missing waiver as no waiver', () => {
    expect(isWaiverActive(null, NOW)).toBe(false)
    expect(isWaiverActive(undefined, NOW)).toBe(false)
  })

  it('never excuses the sprint state', () => {
    // A waiver covers checklist items, not the state machine. A sprint still in
    // planning does not run stand-ups because someone waived PC-4.
    const result = evaluatePlanningGate(
      gate({ sprintState: 'planning', blockers: [blocker('PC-4')], waiver: waiver() })
    )
    expect(result.passed).toBe(false)
  })
})

describe('PLN-19 / AC-7 / E15 — an unestimated task is never allocatable', () => {
  it('refuses a task with no estimate', () => {
    try {
      assertTaskAllocatable({ id: 'task-1', key: 'KAN-500' })
      throw new Error('should have thrown')
    } catch (error: any) {
      expect(error.code).toBe('TASK_NOT_ESTIMATED')
      expect(error.status).toBe(422)
      expect(error.message).toContain('KAN-500')
    }
  })

  it('refuses a zero estimate', () => {
    expect(() =>
      assertTaskAllocatable({ id: 'task-1', originalEstimateMinutes: 0 })
    ).toThrow(/no estimate/)
  })

  it('refuses a null estimate', () => {
    expect(() =>
      assertTaskAllocatable({ id: 'task-1', originalEstimateMinutes: null })
    ).toThrow(/no estimate/)
  })

  it('allows an estimated task', () => {
    expect(() =>
      assertTaskAllocatable({ id: 'task-1', originalEstimateMinutes: 360 })
    ).not.toThrow()
  })

  it('AC-7 — a waiver covering PC-3 cannot be passed in at all', () => {
    // The function takes no waiver parameter, so there is no input that makes
    // an unestimated task allocatable. This asserts the shape, which is the
    // guarantee: a future caller cannot weaken it without changing the
    // signature, which the compiler would flag.
    expect(assertTaskAllocatable.length).toBe(1)
    expect(() => assertTaskAllocatable({ id: 'task-1' })).toThrow(/no estimate/)
  })
})

describe('buildWaiver — PLN-17', () => {
  const base = {
    waivedCheckIds: ['PC-4'],
    justification: 'Client signed off verbally; written acceptance criteria follow on Monday.',
    issuedBy: 'admin',
    sprintEndDate: new Date('2026-09-04T00:00:00Z'),
    now: NOW
  }

  it('builds a waiver with the default seven-day expiry', () => {
    const result = buildWaiver(base)
    expect(result.expiresAt).toEqual(new Date('2026-08-31T09:00:00Z'))
    expect(result.waivedCheckIds).toEqual(['PC-4'])
  })

  it('caps expiry at the sprint end date', () => {
    // A waiver outliving its sprint would silently carry into the next one.
    const result = buildWaiver({
      ...base,
      expiresAt: new Date('2026-12-31T00:00:00Z')
    })
    expect(result.expiresAt).toEqual(base.sprintEndDate)
  })

  it('rejects a justification under 30 characters', () => {
    try {
      buildWaiver({ ...base, justification: 'Client approved it' })
      throw new Error('should have thrown')
    } catch (error: any) {
      expect(error.code).toBe('INVALID_JUSTIFICATION')
      expect(error.details.required).toBe(MIN_WAIVER_JUSTIFICATION_LENGTH)
    }
  })

  it('does not count whitespace towards the minimum', () => {
    expect(() => buildWaiver({ ...base, justification: `${' '.repeat(40)}short` })).toThrow()
  })

  it('rejects a waiver naming no checks', () => {
    expect(() => buildWaiver({ ...base, waivedCheckIds: [] })).toThrow(/at least one check/)
  })

  it('rejects an expiry in the past', () => {
    expect(() =>
      buildWaiver({ ...base, expiresAt: new Date('2026-08-01T00:00:00Z') })
    ).toThrow(/cannot expire in the past/)
  })

  it('deduplicates repeated check ids', () => {
    const result = buildWaiver({ ...base, waivedCheckIds: ['PC-4', 'PC-4', 'PC-5'] })
    expect(result.waivedCheckIds).toEqual(['PC-4', 'PC-5'])
  })

  it('trims the justification it stores', () => {
    const result = buildWaiver({ ...base, justification: `  ${base.justification}  ` })
    expect(result.justification).toBe(base.justification)
  })
})

describe('describeWaiver — PLN-18 banner', () => {
  it('names the waived checks and the expiry date', () => {
    const text = describeWaiver(waiver({ waivedCheckIds: ['PC-4', 'PC-5'] }), NOW)
    expect(text).toBe('Planning waiver active for PC-4, PC-5. It expires on 2026-08-31.')
  })

  it('says nothing when there is no active waiver', () => {
    expect(describeWaiver(null, NOW)).toBeNull()
    expect(describeWaiver(waiver({ expiresAt: new Date('2026-08-01') }), NOW)).toBeNull()
  })
})
