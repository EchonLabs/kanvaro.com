/**
 * Capacity computation (spec §11.1, ALO-1 / ALO-3).
 *
 * The order of operations is specified exactly and every number here ends up on
 * the capacity board, so both the arithmetic and the itemised breakdown are
 * pinned. The §12.3 worked example is reproduced at the end under both overrun
 * policies, because those are the figures the spec designates as the primary QA
 * fixture.
 */
import { minutes, ZERO_MINUTES } from '../minutes'
import {
  allocationStatus,
  computeCapacity,
  selectCapacityAsOf,
  type ComputeCapacityInput
} from '../capacity'
import type { WorkingDayResolution } from '../working-day'

const EIGHT_HOURS = minutes(480)
const FOUR_HOURS = minutes(240)
const QUARTER_HOUR = minutes(15)

function workingDay(partial: Partial<WorkingDayResolution> = {}): WorkingDayResolution {
  return {
    date: '2026-08-27',
    isWorkingDay: true,
    reason: 'working',
    isPartialDay: false,
    standardMinutes: EIGHT_HOURS,
    fullStandardMinutes: EIGHT_HOURS,
    optionalHolidays: [],
    memberExceptions: [],
    ...partial
  }
}

function input(partial: Partial<ComputeCapacityInput> = {}): ComputeCapacityInput {
  return {
    memberId: 'kasun',
    date: '2026-08-27',
    resolution: workingDay(),
    nominalMinutes: EIGHT_HOURS,
    ...partial
  }
}

describe('a plain full day', () => {
  it('gives the member their nominal capacity with no adjustments', () => {
    const result = computeCapacity(input())

    expect(result.nominalMinutes).toBe(480)
    expect(result.adjustedMinutes).toBe(480)
    expect(result.effectiveMinutes).toBe(480)
    expect(result.adjustments).toHaveLength(0)
  })

  it('reports a full gap when nothing is allocated yet', () => {
    const result = computeCapacity(input())

    expect(result.gapMinutes).toBe(480)
    expect(result.status).toBe('zero')
  })

  it('respects a part-timer\'s own nominal', () => {
    const result = computeCapacity(input({ nominalMinutes: FOUR_HOURS }))

    expect(result.effectiveMinutes).toBe(240)
  })
})

describe('non-working days', () => {
  it('has no capacity and is unavailable', () => {
    const result = computeCapacity(
      input({ resolution: workingDay({ isWorkingDay: false, reason: 'org_holiday' }) })
    )

    expect(result.effectiveMinutes).toBe(0)
    expect(result.status).toBe('unavailable')
    expect(result.isUnavailable).toBe(true)
  })
})

describe('ALO-1 step order', () => {
  it('scales nominal by the partial-day factor', () => {
    // Half day for the project: 480 -> 240. Factor 0.5.
    const result = computeCapacity(
      input({
        resolution: workingDay({ isPartialDay: true, standardMinutes: FOUR_HOURS })
      })
    )

    expect(result.adjustedMinutes).toBe(240)
    expect(result.adjustments).toEqual([
      expect.objectContaining({ type: 'partial_day', minutes: 240 })
    ])
  })

  it('applies the partial-day factor to the member\'s own nominal, not the project\'s', () => {
    // A 4h part-timer on a project half day gets 2h, not 4h.
    const result = computeCapacity(
      input({
        nominalMinutes: FOUR_HOURS,
        resolution: workingDay({ isPartialDay: true, standardMinutes: FOUR_HOURS })
      })
    )

    expect(result.adjustedMinutes).toBe(120)
  })

  it('subtracts leave that covers the date', () => {
    const result = computeCapacity(
      input({
        leave: [{ startDate: '2026-08-26', endDate: '2026-08-28' }]
      })
    )

    expect(result.adjustedMinutes).toBe(0)
    expect(result.adjustments).toEqual([
      expect.objectContaining({ type: 'leave', minutes: 480 })
    ])
  })

  it('ignores leave outside the date', () => {
    const result = computeCapacity(
      input({ leave: [{ startDate: '2026-09-01', endDate: '2026-09-05' }] })
    )

    expect(result.adjustedMinutes).toBe(480)
    expect(result.adjustments).toHaveLength(0)
  })

  it('subtracts a half-day leave entry', () => {
    const result = computeCapacity(
      input({
        leave: [{ startDate: '2026-08-27', endDate: '2026-08-27', minutesPerDay: 240 }]
      })
    )

    expect(result.adjustedMinutes).toBe(240)
  })

  it('zeroes capacity for a planned absence', () => {
    const result = computeCapacity(input({ attendance: 'absent_planned' }))

    expect(result.effectiveMinutes).toBe(0)
    expect(result.status).toBe('unavailable')
    expect(result.adjustments).toEqual([
      expect.objectContaining({ type: 'attendance', minutes: 480 })
    ])
  })

  it('zeroes capacity for an unplanned absence too', () => {
    expect(computeCapacity(input({ attendance: 'absent_unplanned' })).effectiveMinutes).toBe(0)
  })

  it('removes only the unworked part of a partial attendance', () => {
    const result = computeCapacity(
      input({ attendance: 'partial', attendancePartialMinutes: minutes(180) })
    )

    // Working 3h of an 8h day: 5h removed.
    expect(result.adjustedMinutes).toBe(180)
    expect(result.adjustments).toEqual([
      expect.objectContaining({ type: 'attendance', minutes: 300 })
    ])
  })

  it('subtracts a recurring commitment on matching weekdays', () => {
    // 2026-08-27 is a Thursday (day 4).
    const result = computeCapacity(
      input({
        nonProjectCommitments: [
          { label: 'Support rota', minutesPerDay: 60, daysOfWeek: [4] }
        ]
      })
    )

    expect(result.adjustedMinutes).toBe(420)
    expect(result.adjustments).toEqual([
      expect.objectContaining({ type: 'non_project_commitment', label: 'Support rota' })
    ])
  })

  it('skips a commitment that does not fall on this weekday', () => {
    const result = computeCapacity(
      input({
        nonProjectCommitments: [{ label: 'Monday sync', minutesPerDay: 60, daysOfWeek: [1] }]
      })
    )

    expect(result.adjustedMinutes).toBe(480)
    expect(result.adjustments).toHaveLength(0)
  })

  it('treats an empty daysOfWeek as every working day', () => {
    const result = computeCapacity(
      input({
        nonProjectCommitments: [{ label: 'Daily standup', minutesPerDay: 15, daysOfWeek: [] }]
      })
    )

    expect(result.adjustedMinutes).toBe(465)
  })

  it('itemises every adjustment so the board can explain the number', () => {
    const result = computeCapacity(
      input({
        leave: [{ startDate: '2026-08-27', endDate: '2026-08-27', minutesPerDay: 120 }],
        nonProjectCommitments: [{ label: 'Support rota', minutesPerDay: 60, daysOfWeek: [] }]
      })
    )

    expect(result.adjustedMinutes).toBe(300)
    expect(result.adjustments.map((a) => a.type)).toEqual([
      'leave',
      'non_project_commitment'
    ])
    // The itemised list must account for the whole difference from nominal.
    const totalRemoved = result.adjustments.reduce((sum, a) => sum + a.minutes, 0)
    expect(result.nominalMinutes - totalRemoved).toBe(result.adjustedMinutes)
  })

  it('floors at zero rather than going negative', () => {
    const result = computeCapacity(
      input({
        leave: [{ startDate: '2026-08-27', endDate: '2026-08-27', minutesPerDay: 600 }]
      })
    )

    expect(result.adjustedMinutes).toBe(0)
  })
})

describe('CAL-4 — member-scoped calendar overrides reduce only those members', () => {
  const conference = {
    id: 'conf',
    name: 'Kasun at a conference',
    isPartialDay: false,
    memberIds: ['kasun']
  }

  it('zeroes capacity for a named member', () => {
    const result = computeCapacity(
      input({ resolution: workingDay({ memberExceptions: [conference] }) })
    )

    expect(result.adjustedMinutes).toBe(0)
    expect(result.status).toBe('unavailable')
    expect(result.adjustments).toContainEqual({
      type: 'member_exception',
      label: 'Kasun at a conference',
      minutes: 480
    })
  })

  it('leaves everyone else untouched on the same date', () => {
    const result = computeCapacity(
      input({ memberId: 'amal', resolution: workingDay({ memberExceptions: [conference] }) })
    )

    expect(result.adjustedMinutes).toBe(480)
    expect(result.adjustments).toHaveLength(0)
  })

  it('removes only the unworked part of a partial exception', () => {
    const result = computeCapacity(
      input({
        resolution: workingDay({
          memberExceptions: [{ ...conference, isPartialDay: true, minutesIfPartial: 180 }]
        })
      })
    )

    // Works 3h of an 8h day, so 5h is removed.
    expect(result.adjustedMinutes).toBe(180)
    expect(result.adjustments[0].minutes).toBe(300)
  })

  it('scales against the member’s own day, not the project’s', () => {
    const result = computeCapacity(
      input({
        nominalMinutes: FOUR_HOURS,
        resolution: workingDay({
          memberExceptions: [{ ...conference, isPartialDay: true, minutesIfPartial: 60 }]
        })
      })
    )

    // A 4h part-timer working 1h loses 3h, not 7h.
    expect(result.adjustedMinutes).toBe(60)
    expect(result.adjustments[0].minutes).toBe(180)
  })

  it('stacks with leave rather than double-counting it away', () => {
    const result = computeCapacity(
      input({
        resolution: workingDay({
          memberExceptions: [{ ...conference, isPartialDay: true, minutesIfPartial: 240 }]
        }),
        leave: [{ startDate: '2026-08-27', endDate: '2026-08-27', minutesPerDay: 120 }]
      })
    )

    // 8h less 4h of exception less 2h of leave.
    expect(result.adjustedMinutes).toBe(120)
    expect(result.adjustments).toHaveLength(2)
  })

  it('floors at zero when exceptions exceed the day', () => {
    const result = computeCapacity(
      input({
        resolution: workingDay({
          memberExceptions: [conference, { ...conference, id: 'conf2', name: 'Also out' }]
        })
      })
    )

    expect(result.adjustedMinutes).toBe(0)
  })
})

describe('CAL-9 — optional holidays reduce only observers', () => {
  const deepavali = {
    id: 'deepavali',
    name: 'Deepavali Festival Day',
    type: 'optional' as const,
    isFullDay: true
  }

  it('leaves a non-observer at full capacity', () => {
    const result = computeCapacity(
      input({ resolution: workingDay({ optionalHolidays: [deepavali] }) })
    )

    expect(result.effectiveMinutes).toBe(480)
    expect(result.adjustments).toHaveLength(0)
  })

  it('zeroes capacity for a member who observes it', () => {
    const result = computeCapacity(
      input({
        resolution: workingDay({ optionalHolidays: [deepavali] }),
        observedOptionalHolidayIds: ['deepavali']
      })
    )

    expect(result.effectiveMinutes).toBe(0)
    expect(result.adjustments).toEqual([
      expect.objectContaining({ type: 'optional_holiday', label: 'Deepavali Festival Day' })
    ])
  })

  it('E11 — half the team observing produces two different capacities on one working day', () => {
    const resolution = workingDay({ optionalHolidays: [deepavali] })

    const observer = computeCapacity(
      input({ memberId: 'ravi', resolution, observedOptionalHolidayIds: ['deepavali'] })
    )
    const nonObserver = computeCapacity(input({ memberId: 'kasun', resolution }))

    // The day itself is still a working day — the stand-up runs regardless.
    expect(resolution.isWorkingDay).toBe(true)
    expect(observer.effectiveMinutes).toBe(0)
    expect(nonObserver.effectiveMinutes).toBe(480)
  })

  it('reduces by only the partial amount for a half-day optional holiday', () => {
    const result = computeCapacity(
      input({
        resolution: workingDay({
          optionalHolidays: [{ ...deepavali, isFullDay: false, minutesIfPartial: 240 }]
        }),
        observedOptionalHolidayIds: ['deepavali']
      })
    )

    expect(result.adjustedMinutes).toBe(240)
  })
})

describe('overrun policy', () => {
  const TWO_HOURS_DEBT = minutes(120)

  it('absorb leaves capacity at nominal and only badges the debt', () => {
    const result = computeCapacity(
      input({ outstandingDebtMinutes: TWO_HOURS_DEBT, overrunPolicy: 'absorb' })
    )

    expect(result.effectiveMinutes).toBe(480)
    expect(result.outstandingDebtMinutes).toBe(120)
  })

  it('reduce lowers what can be allocated today', () => {
    const result = computeCapacity(
      input({ outstandingDebtMinutes: TWO_HOURS_DEBT, overrunPolicy: 'reduce' })
    )

    expect(result.adjustedMinutes).toBe(480)
    expect(result.effectiveMinutes).toBe(360)
  })

  it('E43 — reduce floors effective capacity at zero when debt exceeds a full day', () => {
    const result = computeCapacity(
      input({ outstandingDebtMinutes: minutes(600), overrunPolicy: 'reduce' })
    )

    expect(result.effectiveMinutes).toBe(0)
    expect(result.status).toBe('unavailable')
  })
})

describe('ALO-3 allocation status', () => {
  const status = (allocated: number, effective = 480) =>
    allocationStatus({
      effectiveMinutes: minutes(effective),
      allocatedMinutes: minutes(allocated),
      gapMinutes: minutes(effective - allocated),
      underToleranceMinutes: QUARTER_HOUR,
      overToleranceMinutes: QUARTER_HOUR
    })

  it('is full when the gap is inside tolerance', () => {
    expect(status(480)).toBe('full')
    expect(status(470)).toBe('full') // 10 min under, within 15
    expect(status(490)).toBe('full') // 10 min over, within 15
  })

  it('is under beyond the under-tolerance', () => {
    expect(status(300)).toBe('under')
    expect(status(464)).toBe('under') // 16 min short
  })

  it('is over beyond the over-tolerance', () => {
    expect(status(600)).toBe('over')
    expect(status(496)).toBe('over') // 16 min over
  })

  it('is zero when nothing is allocated but capacity exists', () => {
    expect(status(0)).toBe('zero')
  })

  it('E22 — is unavailable when there is no capacity, never under', () => {
    // Someone on leave is not "under-allocated"; CC-1 must not apply to them.
    expect(status(0, 0)).toBe('unavailable')
  })
})

describe('DAT-1 — capacity is dated', () => {
  const records = [
    { effectiveFrom: '2026-01-01', effectiveTo: '2026-07-01', dailyCapacityMinutes: 480 },
    { effectiveFrom: '2026-07-01', dailyCapacityMinutes: 240 }
  ]

  it('picks the record in force on the given date, not the newest', () => {
    // A historical stand-up must see the hours that applied then.
    expect(selectCapacityAsOf(records, '2026-03-15')?.dailyCapacityMinutes).toBe(480)
    expect(selectCapacityAsOf(records, '2026-08-27')?.dailyCapacityMinutes).toBe(240)
  })

  it('treats effectiveTo as exclusive', () => {
    expect(selectCapacityAsOf(records, '2026-07-01')?.dailyCapacityMinutes).toBe(240)
    expect(selectCapacityAsOf(records, '2026-06-30')?.dailyCapacityMinutes).toBe(480)
  })

  it('returns nothing for a date before any record starts', () => {
    expect(selectCapacityAsOf(records, '2025-12-31')).toBeUndefined()
  })

  it('skips inactive records', () => {
    const withInactive = [{ ...records[1], isActive: false }]
    expect(selectCapacityAsOf(withInactive, '2026-08-27')).toBeUndefined()
  })
})

describe('§12.3 — the spec\'s worked example', () => {
  // Kasun's day 4, carrying 2.0h of estimate debt from day 3's overrun.
  const KASUN_DEBT = minutes(120)

  it('absorb: capacity stays 8.0h and the pre-filled 5.0h leaves a 3.0h gap (amber)', () => {
    const result = computeCapacity(
      input({
        outstandingDebtMinutes: KASUN_DEBT,
        overrunPolicy: 'absorb',
        // KAN-214 revised remaining 3.0h + KAN-231 carried 2.0h
        allocatedMinutes: minutes(300)
      })
    )

    expect(result.effectiveMinutes).toBe(480)
    expect(result.allocatedMinutes).toBe(300)
    expect(result.gapMinutes).toBe(180)
    expect(result.status).toBe('under')
  })

  it('absorb: adding the 3.0h task turns the meter green at 8.0h', () => {
    const result = computeCapacity(
      input({
        outstandingDebtMinutes: KASUN_DEBT,
        overrunPolicy: 'absorb',
        allocatedMinutes: minutes(480)
      })
    )

    expect(result.gapMinutes).toBe(0)
    expect(result.status).toBe('full')
  })

  it('reduce: capacity drops to 6.0h and the same 5.0h leaves a 1.0h gap', () => {
    const result = computeCapacity(
      input({
        outstandingDebtMinutes: KASUN_DEBT,
        overrunPolicy: 'reduce',
        allocatedMinutes: minutes(300)
      })
    )

    expect(result.adjustedMinutes).toBe(480)
    expect(result.effectiveMinutes).toBe(360)
    expect(result.gapMinutes).toBe(60)
    expect(result.status).toBe('under')
  })

  it('reduce: adding a 1.0h task turns the meter green at 6.0h of 6.0h', () => {
    const result = computeCapacity(
      input({
        outstandingDebtMinutes: KASUN_DEBT,
        overrunPolicy: 'reduce',
        allocatedMinutes: minutes(360)
      })
    )

    expect(result.gapMinutes).toBe(0)
    expect(result.status).toBe('full')
  })
})
