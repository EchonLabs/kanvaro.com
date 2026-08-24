/**
 * The stand-up lifecycle machine (spec §10.1, RUN-2..RUN-5, E51, E52).
 *
 * The transition table is asserted cell by cell rather than by looping over the
 * implementation — a loop over `ALLOWED_TRANSITIONS` would pass for any table,
 * including a wrong one. Every legal edge below is quoted from §10.1.
 */
import { STANDUP_STATUSES, type StandupStatus } from '@/models/Standup'

import {
  ALLOWED_TRANSITIONS,
  assertReopenable,
  assertStartable,
  assertTransition,
  canTransition,
  lateByMinutes
} from '../lifecycle'
import { isStandupError } from '../errors'

/** Every edge §10.1 permits. Anything not in this list must be refused. */
const LEGAL_EDGES: Array<[StandupStatus, StandupStatus]> = [
  ['Scheduled', 'Ready'],
  ['Scheduled', 'Missed'],
  ['Scheduled', 'Skipped_Holiday'],
  ['Scheduled', 'Cancelled'],
  ['Ready', 'In_Progress'],
  ['Ready', 'Missed'],
  ['Ready', 'Skipped_Holiday'],
  ['Ready', 'Cancelled'],
  ['In_Progress', 'Completed'],
  ['In_Progress', 'Cancelled'],
  ['Completed', 'Reopened'],
  ['Reopened', 'Completed'],
  ['Missed', 'Completed'], // back-fill (SCH-14)
  ['Missed', 'Skipped_Holiday'] // CAL-12 Missed row: skip and clear the flag
]

const isLegal = (from: StandupStatus, to: StandupStatus) =>
  LEGAL_EDGES.some(([f, t]) => f === from && t === to)

describe('the §10.1 transition table', () => {
  for (const from of STANDUP_STATUSES) {
    for (const to of STANDUP_STATUSES) {
      const expected = isLegal(from, to)

      it(`${expected ? 'allows' : 'refuses'} ${from} → ${to}`, () => {
        expect(canTransition(from, to)).toBe(expected)
      })
    }
  }

  it('leaves Skipped_Holiday and Cancelled terminal', () => {
    expect(ALLOWED_TRANSITIONS.Skipped_Holiday).toEqual([])
    expect(ALLOWED_TRANSITIONS.Cancelled).toEqual([])
  })

  it('refuses a transition to the same state — a no-op is the caller`s job', () => {
    expect(canTransition('Ready', 'Ready')).toBe(false)
  })

  it('throws a catalogue error naming both states', () => {
    try {
      assertTransition('Completed', 'In_Progress')
      throw new Error('expected assertTransition to throw')
    } catch (error) {
      expect(isStandupError(error)).toBe(true)
      expect((error as Error).message).toMatch(/Completed/)
      expect((error as Error).message).toMatch(/In_Progress/)
    }
  })
})

describe('assertStartable (RUN-2, E51, E52)', () => {
  const scheduledStartAt = new Date('2026-08-10T03:30:00.000Z') // 09:00 Asia/Colombo

  const input = (overrides: Record<string, unknown> = {}) => ({
    status: 'Ready' as StandupStatus,
    scheduledStartAt,
    readyLeadMinutes: 15,
    now: scheduledStartAt,
    timezone: 'Asia/Colombo',
    ...overrides
  })

  it('allows a start at the scheduled instant', () => {
    expect(() => assertStartable(input())).not.toThrow()
  })

  it('allows a start exactly at the lead boundary', () => {
    expect(() =>
      assertStartable(input({ now: new Date('2026-08-10T03:15:00.000Z') }))
    ).not.toThrow()
  })

  it('refuses one minute before the lead boundary, naming the local time (E51)', () => {
    try {
      assertStartable(input({ status: 'Scheduled', now: new Date('2026-08-10T03:14:00.000Z') }))
      throw new Error('expected assertStartable to throw')
    } catch (error) {
      expect((error as { code?: string }).code).toBe('STANDUP_NOT_STARTABLE')
      expect((error as Error).message).toMatch(/09:00/)
    }
  })

  it('allows a late start — RUN-3 never blocks one', () => {
    expect(() =>
      assertStartable(input({ now: new Date('2026-08-10T06:00:00.000Z') }))
    ).not.toThrow()
  })

  it('refuses when another stand-up in the sprint is already running, naming it (E52)', () => {
    try {
      assertStartable(input({ otherInProgressDate: '2026-08-07' }))
      throw new Error('expected assertStartable to throw')
    } catch (error) {
      expect((error as { code?: string }).code).toBe('STANDUP_NOT_STARTABLE')
      expect((error as Error).message).toMatch(/2026-08-07/)
    }
  })

  it('refuses a start from a status that cannot reach In_Progress', () => {
    expect(() => assertStartable(input({ status: 'Completed' }))).toThrow()
    expect(() => assertStartable(input({ status: 'Skipped_Holiday' }))).toThrow()
  })
})

describe('lateByMinutes (RUN-3)', () => {
  it('reports whole minutes late', () => {
    expect(
      lateByMinutes(new Date('2026-08-10T03:30:00.000Z'), new Date('2026-08-10T03:47:30.000Z'))
    ).toBe(17)
  })

  it('is zero, never negative, for an early start', () => {
    expect(
      lateByMinutes(new Date('2026-08-10T03:30:00.000Z'), new Date('2026-08-10T03:20:00.000Z'))
    ).toBe(0)
  })
})

describe('assertReopenable (RUN-4, RUN-5)', () => {
  const completedAt = new Date('2026-08-10T05:00:00.000Z')

  const input = (overrides: Record<string, unknown> = {}) => ({
    completedAt,
    now: new Date('2026-08-10T11:00:00.000Z'),
    reopenWindowHours: 24,
    reason: 'Logged hours were wrong for two members yesterday',
    isOrgAdmin: false,
    sprintCompleted: false,
    ...overrides
  })

  it('allows a PM to reopen inside the window', () => {
    expect(() => assertReopenable(input())).not.toThrow()
  })

  it('refuses a reason shorter than 20 characters', () => {
    try {
      assertReopenable(input({ reason: 'typo' }))
      throw new Error('expected assertReopenable to throw')
    } catch (error) {
      expect((error as { code?: string }).code).toBe('INVALID_JUSTIFICATION')
    }
  })

  it('refuses a PM outside the window', () => {
    try {
      assertReopenable(input({ now: new Date('2026-08-12T05:00:00.000Z') }))
      throw new Error('expected assertReopenable to throw')
    } catch (error) {
      expect((error as { code?: string }).code).toBe('REOPEN_WINDOW_EXPIRED')
    }
  })

  it('allows an org admin outside the window (RUN-5)', () => {
    expect(() =>
      assertReopenable(input({ now: new Date('2026-08-12T05:00:00.000Z'), isOrgAdmin: true }))
    ).not.toThrow()
  })

  it('refuses even an org admin once the sprint is Completed (RUN-5)', () => {
    try {
      assertReopenable(input({ isOrgAdmin: true, sprintCompleted: true }))
      throw new Error('expected assertReopenable to throw')
    } catch (error) {
      expect((error as { code?: string }).code).toBe('REOPEN_WINDOW_EXPIRED')
    }
  })
})
