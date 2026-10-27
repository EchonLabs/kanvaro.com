/**
 * Runs the spec's §12.3 worked example end to end through the real engine.
 *
 * This is the fixture §12.3 designates as the primary QA fixture, and the point
 * of this suite is that every number comes from `fixtures/worked-example.ts`
 * rather than being retyped here. If the scenario ever changes, these
 * assertions follow it instead of silently going stale.
 *
 * Phase 1 covers the calendar, capacity and both overrun policies. The variance
 * classification and ledger assertions are listed at the end as the contract
 * Phase 5 must satisfy.
 */
import { computeCapacity } from '../capacity'
import { formatMinutesAsHours, hoursToMinutes, minutes } from '../minutes'
import { resolveWorkingDayFrom, resolveWorkingDaysFrom, workingDatesFrom } from '../working-day'
import type { CalendarContext, HolidayRecord } from '../working-day'
import {
  AMAL,
  DAY_4_ABSORB,
  DAY_4_REDUCE,
  FIXTURE_DAY_3,
  FIXTURE_DAY_4,
  FIXTURE_HOLIDAYS,
  FIXTURE_SPRINT,
  FIXTURE_STANDARD_MINUTES,
  FIXTURE_TIMEZONE,
  FIXTURE_WORKING_DAYS,
  KAN_214,
  KAN_231,
  KASUN,
  KASUN_DEBT_MINUTES
} from '../fixtures/worked-example'

/** Builds the calendar the fixture describes, including its two holidays. */
function fixtureContext(): CalendarContext {
  const holidaysByDate = new Map<string, HolidayRecord[]>()
  FIXTURE_HOLIDAYS.forEach((holiday, index) => {
    holidaysByDate.set(holiday.date, [
      {
        id: `holiday-${index}`,
        name: holiday.name,
        type: holiday.type as 'public',
        isFullDay: true
      }
    ])
  })

  return {
    timezone: FIXTURE_TIMEZONE,
    workingDaysOfWeek: [...FIXTURE_WORKING_DAYS],
    standardMinutesPerDay: FIXTURE_STANDARD_MINUTES,
    holidaysByDate,
    overridesByDate: new Map(),
    recurringOverridesByMonthDay: new Map()
  }
}

const workingDay = (date: string) => resolveWorkingDayFrom(date, fixtureContext())

describe('the sprint the example runs inside', () => {
  it('day 3 and day 4 are consecutive working days', () => {
    // If a weekend or Poya day fell between them, "yesterday" on day 4 would
    // not be day 3 and the whole example would be describing something else.
    expect(workingDay(FIXTURE_DAY_3).isWorkingDay).toBe(true)
    expect(workingDay(FIXTURE_DAY_4).isWorkingDay).toBe(true)

    const between = resolveWorkingDaysFrom(FIXTURE_DAY_3, FIXTURE_DAY_4, fixtureContext())
    expect(workingDatesFrom(between)).toEqual([FIXTURE_DAY_3, FIXTURE_DAY_4])
  })

  it('skips weekends and the two mid-sprint holidays', () => {
    const resolutions = resolveWorkingDaysFrom(
      FIXTURE_SPRINT.startDate,
      FIXTURE_SPRINT.endDate,
      fixtureContext()
    )
    const working = workingDatesFrom(resolutions)

    // Mon 17 - Fri 28 Aug is 10 weekdays, less Milad un-Nabi (26th) and
    // Nikini Poya (27th), leaving 8.
    expect(working).toHaveLength(8)
    expect(working).not.toContain('2026-08-26')
    expect(working).not.toContain('2026-08-27')
  })
})

describe('day 3 — the plan that looked green', () => {
  it('KAN-214 and KAN-231 together fill Kasun to capacity', () => {
    const allocated = minutes(KAN_214.plannedDay3Minutes + KAN_231.plannedDay3Minutes)

    expect(allocated).toBe(KASUN.nominalMinutes)

    const capacity = computeCapacity({
      memberId: KASUN.reference,
      date: FIXTURE_DAY_3,
      resolution: workingDay(FIXTURE_DAY_3),
      nominalMinutes: KASUN.nominalMinutes,
      allocatedMinutes: allocated
    })

    expect(capacity.gapMinutes).toBe(0)
    expect(capacity.status).toBe('full')
    expect(formatMinutesAsHours(capacity.effectiveMinutes)).toBe('8.0h')
  })
})

describe('what actually happened on day 3', () => {
  it('Kasun logged 8.0h on KAN-214 and nothing on KAN-231', () => {
    expect(formatMinutesAsHours(KAN_214.loggedDay3Minutes)).toBe('8.0h')
    expect(KAN_231.loggedDay3Minutes).toBe(0)
  })

  it('KAN-214 is 2.0h over its plan and 2.0h over its original estimate', () => {
    // Day variance: logged minus planned.
    expect(KAN_214.loggedDay3Minutes - KAN_214.plannedDay3Minutes).toBe(
      KAN_214.expectedDayVarianceMinutes
    )
    // Task variance: total logged minus the original estimate. Both happen to
    // be 2.0h here, which is exactly why the spec insists they are shown
    // separately rather than conflated.
    expect(KAN_214.loggedDay3Minutes - KAN_214.originalEstimateMinutes).toBe(
      KAN_214.expectedTaskVarianceMinutes
    )
  })

  it('KAN-231 has 2.0h of planned work that did not happen', () => {
    expect(KAN_231.loggedDay3Minutes - KAN_231.plannedDay3Minutes).toBe(
      KAN_231.expectedDayVarianceMinutes
    )
  })

  it('the overrun becomes exactly 2.0h of estimate debt', () => {
    expect(KASUN_DEBT_MINUTES).toBe(KAN_214.expectedDayVarianceMinutes)
    expect(formatMinutesAsHours(KASUN_DEBT_MINUTES)).toBe('2.0h')
  })
})

describe('day 4 under the absorb policy', () => {
  const capacity = computeCapacity({
    memberId: KASUN.reference,
    date: FIXTURE_DAY_4,
    resolution: workingDay(FIXTURE_DAY_4),
    nominalMinutes: KASUN.nominalMinutes,
    outstandingDebtMinutes: KASUN_DEBT_MINUTES,
    overrunPolicy: 'absorb',
    allocatedMinutes: DAY_4_ABSORB.allocatedMinutes
  })

  it('keeps capacity at 8.0h with the debt shown as a badge', () => {
    expect(capacity.effectiveMinutes).toBe(DAY_4_ABSORB.effectiveMinutes)
    expect(capacity.outstandingDebtMinutes).toBe(DAY_4_ABSORB.outstandingDebtMinutes)
    expect(formatMinutesAsHours(capacity.effectiveMinutes)).toBe('8.0h')
  })

  it('leaves a 3.0h gap after the carried work is pre-filled', () => {
    expect(capacity.gapMinutes).toBe(DAY_4_ABSORB.gapMinutes)
    expect(capacity.status).toBe(DAY_4_ABSORB.status)
    expect(formatMinutesAsHours(capacity.gapMinutes)).toBe('3.0h')
  })

  it('turns green once the PM adds a 3.0h task', () => {
    const toppedUp = computeCapacity({
      memberId: KASUN.reference,
      date: FIXTURE_DAY_4,
      resolution: workingDay(FIXTURE_DAY_4),
      nominalMinutes: KASUN.nominalMinutes,
      outstandingDebtMinutes: KASUN_DEBT_MINUTES,
      overrunPolicy: 'absorb',
      allocatedMinutes: minutes(
        DAY_4_ABSORB.allocatedMinutes + DAY_4_ABSORB.topUpMinutes
      )
    })

    expect(toppedUp.gapMinutes).toBe(0)
    expect(toppedUp.status).toBe('full')
  })
})

describe('day 4 under the reduce policy', () => {
  const capacity = computeCapacity({
    memberId: KASUN.reference,
    date: FIXTURE_DAY_4,
    resolution: workingDay(FIXTURE_DAY_4),
    nominalMinutes: KASUN.nominalMinutes,
    outstandingDebtMinutes: KASUN_DEBT_MINUTES,
    overrunPolicy: 'reduce',
    allocatedMinutes: DAY_4_REDUCE.allocatedMinutes
  })

  it('drops capacity from 8.0h to 6.0h', () => {
    // The adjusted figure is untouched — debt is applied after adjustments, so
    // the card can say "8.0h reduced to 6.0h by 2.0h of estimate debt".
    expect(capacity.adjustedMinutes).toBe(DAY_4_REDUCE.adjustedMinutes)
    expect(capacity.effectiveMinutes).toBe(DAY_4_REDUCE.effectiveMinutes)
    expect(formatMinutesAsHours(capacity.effectiveMinutes)).toBe('6.0h')
  })

  it('leaves a 1.0h gap against the reduced capacity', () => {
    expect(capacity.gapMinutes).toBe(DAY_4_REDUCE.gapMinutes)
    expect(formatMinutesAsHours(capacity.gapMinutes)).toBe('1.0h')
  })

  it('turns green at 6.0h of 6.0h once a 1.0h task is added', () => {
    const toppedUp = computeCapacity({
      memberId: KASUN.reference,
      date: FIXTURE_DAY_4,
      resolution: workingDay(FIXTURE_DAY_4),
      nominalMinutes: KASUN.nominalMinutes,
      outstandingDebtMinutes: KASUN_DEBT_MINUTES,
      overrunPolicy: 'reduce',
      allocatedMinutes: minutes(DAY_4_REDUCE.allocatedMinutes + DAY_4_REDUCE.topUpMinutes)
    })

    expect(toppedUp.gapMinutes).toBe(0)
    expect(toppedUp.status).toBe('full')
  })
})

describe('the two policies differ only in what can be allocated', () => {
  it('same debt, same pre-fill, different gap', () => {
    expect(DAY_4_ABSORB.outstandingDebtMinutes).toBe(DAY_4_REDUCE.outstandingDebtMinutes)
    expect(DAY_4_ABSORB.allocatedMinutes).toBe(DAY_4_REDUCE.allocatedMinutes)

    // Absorb asks Kasun to make the debt up on top of a full day; reduce takes
    // it out of the day. The difference is exactly the debt.
    expect(DAY_4_ABSORB.gapMinutes - DAY_4_REDUCE.gapMinutes).toBe(KASUN_DEBT_MINUTES)
  })
})

describe('Amal — the contrasting under-estimate case', () => {
  it('finishing early leaves capacity to spend, not a gap to justify', () => {
    // Planned 4.0h, logged 3.0h, task done: outcome V1, a 1.0h credit.
    const capacity = computeCapacity({
      memberId: AMAL.reference,
      date: FIXTURE_DAY_4,
      resolution: workingDay(FIXTURE_DAY_4),
      nominalMinutes: AMAL.nominalMinutes,
      allocatedMinutes: hoursToMinutes(7)
    })

    expect(capacity.gapMinutes).toBe(hoursToMinutes(1))
    expect(capacity.status).toBe('under')
  })
})

/**
 * The remainder of §12.3 needs models that do not exist yet. Listed here as the
 * contract Phase 5 has to satisfy, so the expectations are written down against
 * the fixture now rather than reconstructed later.
 */
describe.skip('Phase 5 — variance classification and the debt ledger', () => {
  it('classifies KAN-214 as open_over_consumed (V6) and requires a revised estimate', () => {
    expect(KAN_214.expectedOutcome).toBe('open_over_consumed')
    expect(KAN_214.revisedRemainingMinutes).toBe(hoursToMinutes(3))
  })

  it('classifies KAN-231 as not_started (V7) and requires a reason', () => {
    expect(KAN_231.expectedOutcome).toBe('not_started')
  })

  it('posts a 120-minute accrual against Kasun and no debt for KAN-231', () => {
    expect(KASUN_DEBT_MINUTES).toBe(120)
  })

  it('never modifies the original estimate when the remaining estimate is revised', () => {
    expect(KAN_214.originalEstimateMinutes).toBe(hoursToMinutes(6))
  })

  it('posts a settlement entry under reduce so the debt is consumed exactly once', () => {
    // AC-16: capacity returns to 8.0h on day 5.
  })
})
