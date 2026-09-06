/**
 * Sprint state machine (spec §8.1).
 *
 * The additive-migration claim — that adding `draft` and `planned` cannot
 * invalidate an existing row — is asserted here rather than assumed, because
 * every sprint in every deployed database depends on it being true.
 */
import {
  LEGACY_SPRINT_STATES,
  LIVE_SPRINT_STATES,
  SPRINT_STATES,
  STARTABLE_SPRINT_STATES,
  TERMINAL_SPRINT_STATES,
  assertTransition,
  canRunStandup,
  canRunStandupOn,
  canTransition,
  hasStandups,
  isSprintState
} from '../sprint-states'

describe('the additive migration', () => {
  it('keeps every state Kanvaro already had', () => {
    for (const state of LEGACY_SPRINT_STATES) {
      expect(SPRINT_STATES).toContain(state)
    }
  })

  it('adds exactly draft and planned', () => {
    const added = SPRINT_STATES.filter(
      (state) => !LEGACY_SPRINT_STATES.includes(state)
    )
    expect(added.sort()).toEqual(['draft', 'planned'])
  })

  it('still treats planning and active as live', () => {
    // The `['planning', 'active']` filters scattered through the existing code
    // must remain a subset of what "live" means, or existing sprints vanish
    // from pickers.
    expect(LIVE_SPRINT_STATES).toEqual(expect.arrayContaining(['planning', 'active']))
  })
})

describe('canTransition — §8.1', () => {
  it('walks the happy path', () => {
    expect(canTransition('draft', 'planning')).toBe(true)
    expect(canTransition('planning', 'planned')).toBe(true)
    expect(canTransition('planned', 'active')).toBe(true)
    expect(canTransition('active', 'completed')).toBe(true)
  })

  it('allows cancelling from every non-terminal state', () => {
    for (const state of SPRINT_STATES) {
      if (TERMINAL_SPRINT_STATES.includes(state)) continue
      expect(canTransition(state, 'cancelled')).toBe(true)
    }
  })

  it('E20 — planning may be reopened after stand-ups have run', () => {
    expect(canTransition('active', 'planning')).toBe(true)
    expect(canTransition('planned', 'planning')).toBe(true)
  })

  it('refuses to skip the planning gate', () => {
    expect(canTransition('draft', 'active')).toBe(false)
    expect(canTransition('draft', 'planned')).toBe(false)
    expect(canTransition('planning', 'active')).toBe(false)
  })

  it('refuses to leave a terminal state', () => {
    for (const terminal of TERMINAL_SPRINT_STATES) {
      for (const target of SPRINT_STATES) {
        expect(canTransition(terminal, target)).toBe(false)
      }
    }
  })

  it('refuses to reopen a completed sprint', () => {
    expect(canTransition('completed', 'active')).toBe(false)
    expect(canTransition('cancelled', 'planning')).toBe(false)
  })
})

describe('assertTransition', () => {
  it('passes a legal move silently', () => {
    expect(() => assertTransition('planning', 'planned')).not.toThrow()
  })

  it('treats a no-op as legal', () => {
    expect(() => assertTransition('active', 'active')).not.toThrow()
    expect(() => assertTransition('completed', 'completed')).not.toThrow()
  })

  it('names both states so a log entry is actionable', () => {
    expect(() => assertTransition('draft', 'active')).toThrow(/from draft to active/)
  })

  it('explains a terminal state differently', () => {
    expect(() => assertTransition('completed', 'active')).toThrow(/is completed and cannot change/)
  })

  it('carries the allowed set in details', () => {
    try {
      assertTransition('draft', 'active')
      throw new Error('should have thrown')
    } catch (error: any) {
      expect(error.code).toBe('VALIDATION_FAILED')
      expect(error.details.allowed).toEqual(['planning', 'cancelled'])
    }
  })
})

describe('hasStandups — §8.1 table', () => {
  it('is true from planned onwards', () => {
    expect(hasStandups('planned')).toBe(true)
    expect(hasStandups('active')).toBe(true)
    expect(hasStandups('completed')).toBe(true)
  })

  it('is false before planning completes', () => {
    expect(hasStandups('draft')).toBe(false)
    expect(hasStandups('planning')).toBe(false)
  })
})

describe('PLN-2 — when a stand-up may run', () => {
  it('never runs before planning completes', () => {
    expect(canRunStandup('draft')).toBe(false)
    expect(canRunStandup('planning')).toBe(false)
  })

  it('runs while active', () => {
    expect(canRunStandup('active')).toBe(true)
  })

  it('does not run once the sprint is finished', () => {
    expect(canRunStandup('completed')).toBe(false)
    expect(canRunStandup('cancelled')).toBe(false)
  })

  describe('canRunStandupOn — planned plus the start-date rule', () => {
    it('blocks a planned sprint before its start date', () => {
      expect(canRunStandupOn('planned', '2026-08-24', '2026-08-20')).toBe(false)
    })

    it('allows a planned sprint on its start date', () => {
      // Day one must not be blocked by scheduler latency in flipping to active.
      expect(canRunStandupOn('planned', '2026-08-24', '2026-08-24')).toBe(true)
    })

    it('allows a planned sprint after its start date', () => {
      expect(canRunStandupOn('planned', '2026-08-24', '2026-08-26')).toBe(true)
    })

    it('ignores the date entirely once active', () => {
      expect(canRunStandupOn('active', '2026-08-24', '2026-08-01')).toBe(true)
    })

    it('never allows a sprint still in planning, whatever the date', () => {
      expect(canRunStandupOn('planning', '2026-08-24', '2026-09-01')).toBe(false)
    })
  })
})

describe('STARTABLE_SPRINT_STATES', () => {
  it('includes planned, or a planned sprint could never start', () => {
    expect(STARTABLE_SPRINT_STATES).toContain('planned')
  })

  it('keeps planning startable, preserving existing behaviour', () => {
    expect(STARTABLE_SPRINT_STATES).toContain('planning')
  })

  it('excludes everything else', () => {
    expect(STARTABLE_SPRINT_STATES.sort()).toEqual(['planned', 'planning'])
  })
})

describe('isSprintState', () => {
  it('accepts every declared state', () => {
    for (const state of SPRINT_STATES) expect(isSprintState(state)).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isSprintState('Planned')).toBe(false)
    expect(isSprintState('')).toBe(false)
    expect(isSprintState(null)).toBe(false)
    expect(isSprintState(2)).toBe(false)
  })
})
