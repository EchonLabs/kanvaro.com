/**
 * Four-layer working-day resolution (spec §7.1, CAL-1 to CAL-4, CAL-9).
 *
 * Everything downstream of the calendar is wrong if this is wrong, so the
 * precedence rules are exercised exhaustively rather than sampled. Real Sri
 * Lankan 2026 holiday data is used because it contains the awkward cases: a
 * date carrying two holidays (1 May is both May Day and Vesak Poya) and a
 * thirteenth Poya from an intercalary month.
 */
import { minutes } from '../minutes'
import {
  resolveWorkingDayFrom,
  resolveWorkingDaysFrom,
  workingDatesFrom,
  type CalendarContext,
  type CalendarOverrideRecord,
  type HolidayRecord
} from '../working-day'

const EIGHT_HOURS = minutes(480)
const HALF_DAY = minutes(240)

function context(overrides: Partial<CalendarContext> = {}): CalendarContext {
  return {
    timezone: 'Asia/Colombo',
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: EIGHT_HOURS,
    holidaysByDate: new Map(),
    overridesByDate: new Map(),
    recurringOverridesByMonthDay: new Map(),
    ...overrides
  }
}

const holiday = (partial: Partial<HolidayRecord> = {}): HolidayRecord => ({
  id: 'holiday-1',
  name: 'Nikini Full Moon Poya Day',
  type: 'public',
  isFullDay: true,
  ...partial
})

const override = (partial: Partial<CalendarOverrideRecord> = {}): CalendarOverrideRecord => ({
  id: 'override-1',
  name: 'Company shutdown',
  effect: 'non_working',
  isPartialDay: false,
  recurringAnnually: false,
  ...partial
})

describe('Layer 1 — organisation working week', () => {
  it('treats a configured weekday as a working day', () => {
    // 2026-08-27 is a Thursday.
    const result = resolveWorkingDayFrom('2026-08-27', context())

    expect(result.isWorkingDay).toBe(true)
    expect(result.reason).toBe('working')
    expect(result.standardMinutes).toBe(EIGHT_HOURS)
  })

  it('treats Saturday and Sunday as weekend under a Mon-Fri week', () => {
    expect(resolveWorkingDayFrom('2026-08-15', context()).reason).toBe('weekend')
    expect(resolveWorkingDayFrom('2026-08-16', context()).reason).toBe('weekend')
  })

  it('supports a non-Western working week', () => {
    // Sunday-Thursday, as used across much of the Middle East.
    const middleEast = context({ workingDaysOfWeek: [0, 1, 2, 3, 4] })

    expect(resolveWorkingDayFrom('2026-08-16', middleEast).isWorkingDay).toBe(true) // Sunday
    expect(resolveWorkingDayFrom('2026-08-14', middleEast).reason).toBe('weekend') // Friday
  })
})

describe('Layer 2 — holiday sets', () => {
  it('removes the day for a full-day public holiday', () => {
    const result = resolveWorkingDayFrom(
      '2026-08-27',
      context({ holidaysByDate: new Map([['2026-08-27', [holiday()]]]) })
    )

    expect(result.isWorkingDay).toBe(false)
    expect(result.reason).toBe('org_holiday')
    expect(result.holidayName).toBe('Nikini Full Moon Poya Day')
  })

  it('removes the day for a company holiday too', () => {
    const result = resolveWorkingDayFrom(
      '2026-08-27',
      context({
        holidaysByDate: new Map([['2026-08-27', [holiday({ type: 'company', name: 'Founders Day' })]]])
      })
    )

    expect(result.isWorkingDay).toBe(false)
    expect(result.reason).toBe('org_holiday')
  })

  it('keeps the day but shortens it for a partial holiday', () => {
    const result = resolveWorkingDayFrom(
      '2026-08-27',
      context({
        holidaysByDate: new Map([
          ['2026-08-27', [holiday({ isFullDay: false, minutesIfPartial: 240 })]]
        ])
      })
    )

    expect(result.isWorkingDay).toBe(true)
    expect(result.isPartialDay).toBe(true)
    expect(result.standardMinutes).toBe(HALF_DAY)
  })

  it('does not resurrect a weekend just because a holiday falls on it', () => {
    // 2026-05-30 (Adhi Poson) is a Saturday. It is already non-working.
    const result = resolveWorkingDayFrom(
      '2026-05-30',
      context({
        holidaysByDate: new Map([
          ['2026-05-30', [holiday({ name: 'Adhi Poson Full Moon Poya Day' })]]
        ])
      })
    )

    expect(result.isWorkingDay).toBe(false)
    // The weekday check runs first, so the reason stays 'weekend'.
    expect(result.reason).toBe('weekend')
  })

  it('handles two holidays sharing one date', () => {
    // Real case: 2026-05-01 is both May Day and Vesak Poya.
    const result = resolveWorkingDayFrom(
      '2026-05-01',
      context({
        holidaysByDate: new Map([
          [
            '2026-05-01',
            [
              holiday({ id: 'may-day', name: 'May Day' }),
              holiday({ id: 'vesak', name: 'Vesak Full Moon Poya Day' })
            ]
          ]
        ])
      })
    )

    expect(result.isWorkingDay).toBe(false)
    expect(result.reason).toBe('org_holiday')
  })
})

describe('CAL-9 / E11 — optional holidays never remove the working day', () => {
  const optionalContext = context({
    holidaysByDate: new Map([
      [
        '2026-11-08',
        [holiday({ id: 'deepavali', name: 'Deepavali Festival Day', type: 'optional' })]
      ]
    ])
  })

  it('keeps the day working so the stand-up still runs', () => {
    // 2026-11-08 is a Sunday in reality; use a weekday to isolate the rule.
    const result = resolveWorkingDayFrom(
      '2026-11-09',
      context({
        holidaysByDate: new Map([
          [
            '2026-11-09',
            [holiday({ id: 'deepavali', name: 'Deepavali Festival Day', type: 'optional' })]
          ]
        ])
      })
    )

    expect(result.isWorkingDay).toBe(true)
    expect(result.reason).toBe('working')
    // Full hours: only observing members lose capacity, and that is
    // computeCapacity's job, not the resolver's.
    expect(result.standardMinutes).toBe(EIGHT_HOURS)
  })

  it('reports the optional holiday so capacity and the banner can use it', () => {
    const result = resolveWorkingDayFrom('2026-11-08', optionalContext)

    expect(result.optionalHolidays).toHaveLength(1)
    expect(result.optionalHolidays[0].name).toBe('Deepavali Festival Day')
  })

  it('reports optional holidays even on a non-working day', () => {
    // The banner is still meaningful context on a skipped day.
    const result = resolveWorkingDayFrom('2026-11-08', optionalContext)
    expect(result.isWorkingDay).toBe(false) // Sunday
    expect(result.optionalHolidays).toHaveLength(1)
  })
})

describe('CAL-3 — Layer 3 overrides in both directions', () => {
  it('removes an otherwise normal working day', () => {
    const result = resolveWorkingDayFrom(
      '2026-12-24',
      context({
        overridesByDate: new Map([['2026-12-24', [override({ name: 'Christmas Eve' })]]])
      })
    )

    expect(result.isWorkingDay).toBe(false)
    expect(result.reason).toBe('project_non_working')
    expect(result.overrideName).toBe('Christmas Eve')
  })

  it('restores a day the organisation calendar marked as a holiday', () => {
    // "This listed public holiday is not observed here" — CAL-3 verbatim.
    const result = resolveWorkingDayFrom(
      '2026-08-27',
      context({
        holidaysByDate: new Map([['2026-08-27', [holiday()]]]),
        overridesByDate: new Map([
          ['2026-08-27', [override({ effect: 'observed_as_working', name: 'Team works Poya' })]]
        ])
      })
    )

    expect(result.isWorkingDay).toBe(true)
    expect(result.reason).toBe('working')
  })

  it('restores a weekend day when the project chooses to work it', () => {
    const result = resolveWorkingDayFrom(
      '2026-08-15',
      context({
        overridesByDate: new Map([
          ['2026-08-15', [override({ effect: 'observed_as_working', name: 'Release Saturday' })]]
        ])
      })
    )

    expect(result.isWorkingDay).toBe(true)
  })

  it('can restore a day as a half day', () => {
    const result = resolveWorkingDayFrom(
      '2026-08-15',
      context({
        overridesByDate: new Map([
          [
            '2026-08-15',
            [
              override({
                effect: 'observed_as_working',
                isPartialDay: true,
                minutesIfPartial: 240
              })
            ]
          ]
        ])
      })
    )

    expect(result.isWorkingDay).toBe(true)
    expect(result.isPartialDay).toBe(true)
    expect(result.standardMinutes).toBe(HALF_DAY)
  })

  it('applies an annually recurring override in a later year', () => {
    const recurring = context({
      recurringOverridesByMonthDay: new Map([
        ['12-24', [override({ name: 'Christmas Eve', recurringAnnually: true })]]
      ])
    })

    expect(resolveWorkingDayFrom('2026-12-24', recurring).isWorkingDay).toBe(false)
    expect(resolveWorkingDayFrom('2027-12-24', recurring).isWorkingDay).toBe(false)
  })

  it('lets an exact-date override countermand the recurring rule', () => {
    const result = resolveWorkingDayFrom(
      '2026-12-24',
      context({
        recurringOverridesByMonthDay: new Map([
          ['12-24', [override({ name: 'Christmas Eve', recurringAnnually: true })]]
        ]),
        overridesByDate: new Map([
          [
            '2026-12-24',
            [override({ id: 'exception', effect: 'observed_as_working', name: 'Working this year' })]
          ]
        ])
      })
    )

    expect(result.isWorkingDay).toBe(true)
    expect(result.overrideId).toBe('exception')
  })
})

describe('CAL-4 — member exceptions never remove a project working day', () => {
  it('ignores a member-scoped override entirely', () => {
    // Kasun is on leave. The project still has a working day, and a stand-up is
    // still generated, so the record of the gap exists.
    const result = resolveWorkingDayFrom(
      '2026-08-27',
      context({
        overridesByDate: new Map([
          ['2026-08-27', [override({ appliesToMemberIds: ['kasun'], name: 'Kasun annual leave' })]]
        ])
      })
    )

    expect(result.isWorkingDay).toBe(true)
    expect(result.reason).toBe('working')
    expect(result.overrideId).toBeUndefined()
  })

  it('still resolves as working when every member is out', () => {
    const result = resolveWorkingDayFrom(
      '2026-08-27',
      context({
        overridesByDate: new Map([
          [
            '2026-08-27',
            [
              override({ id: 'a', appliesToMemberIds: ['kasun'] }),
              override({ id: 'b', appliesToMemberIds: ['amal'] }),
              override({ id: 'c', appliesToMemberIds: ['ravi'] })
            ]
          ]
        ])
      })
    )

    expect(result.isWorkingDay).toBe(true)
  })

  it('applies a project-wide override that sits alongside member-scoped ones', () => {
    const result = resolveWorkingDayFrom(
      '2026-08-27',
      context({
        overridesByDate: new Map([
          [
            '2026-08-27',
            [
              override({ id: 'member', appliesToMemberIds: ['kasun'] }),
              override({ id: 'project-wide', appliesToMemberIds: [] })
            ]
          ]
        ])
      })
    )

    expect(result.isWorkingDay).toBe(false)
    expect(result.overrideId).toBe('project-wide')
  })

  it('reports the member-scoped override so capacity can apply it', () => {
    // Excluding it from the calendar decision is only half the job. If the
    // resolution dropped it here, a PM could record "Kasun at a conference" and
    // it would change nothing at all.
    const result = resolveWorkingDayFrom(
      '2026-08-27',
      context({
        overridesByDate: new Map([
          [
            '2026-08-27',
            [override({ id: 'x', appliesToMemberIds: ['kasun'], name: 'Kasun at a conference' })]
          ]
        ])
      })
    )

    expect(result.isWorkingDay).toBe(true)
    expect(result.memberExceptions).toHaveLength(1)
    expect(result.memberExceptions[0]).toMatchObject({
      id: 'x',
      name: 'Kasun at a conference',
      memberIds: ['kasun']
    })
  })

  it('reports one exception per member-scoped override', () => {
    const result = resolveWorkingDayFrom(
      '2026-08-27',
      context({
        overridesByDate: new Map([
          [
            '2026-08-27',
            [
              override({ id: 'a', appliesToMemberIds: ['kasun'] }),
              override({ id: 'b', appliesToMemberIds: ['amal', 'ravi'] })
            ]
          ]
        ])
      })
    )

    expect(result.memberExceptions.map((exception) => exception.id)).toEqual(['a', 'b'])
    expect(result.memberExceptions[1].memberIds).toEqual(['amal', 'ravi'])
  })

  it('does not treat a project-wide override as a member exception', () => {
    const result = resolveWorkingDayFrom(
      '2026-08-27',
      context({
        overridesByDate: new Map([['2026-08-27', [override({ appliesToMemberIds: [] })]]])
      })
    )

    expect(result.memberExceptions).toEqual([])
  })

  it('ignores a member-scoped observed_as_working override', () => {
    // Layer 4 may only reduce an individual's capacity. Asking one person to
    // work a day the project is closed has no meaning under CAL-4.
    const result = resolveWorkingDayFrom(
      '2026-08-29', // a Saturday
      context({
        overridesByDate: new Map([
          [
            '2026-08-29',
            [override({ effect: 'observed_as_working', appliesToMemberIds: ['kasun'] })]
          ]
        ])
      })
    )

    expect(result.isWorkingDay).toBe(false)
    expect(result.memberExceptions).toEqual([])
  })
})

describe('sprint range', () => {
  it('reports dates outside the sprint without consulting any layer', () => {
    const result = resolveWorkingDayFrom('2026-08-27', context(), {
      sprintRange: { startDate: '2026-09-01', endDate: '2026-09-30' }
    })

    expect(result.isWorkingDay).toBe(false)
    expect(result.reason).toBe('outside_sprint')
  })

  it('resolves normally inside the range', () => {
    const result = resolveWorkingDayFrom('2026-08-27', context(), {
      sprintRange: { startDate: '2026-08-01', endDate: '2026-08-31' }
    })

    expect(result.isWorkingDay).toBe(true)
  })
})

describe('batch resolution', () => {
  it('E1 — a sprint starting on a Saturday has its first working day on Monday', () => {
    // 2026-08-15 is a Saturday.
    const resolutions = resolveWorkingDaysFrom('2026-08-15', '2026-08-21', context())
    const working = workingDatesFrom(resolutions)

    expect(working[0]).toBe('2026-08-17') // Monday
    expect(working).not.toContain('2026-08-15')
    expect(working).not.toContain('2026-08-16')
  })

  it('E2 — a range of only weekends yields no working days', () => {
    const resolutions = resolveWorkingDaysFrom('2026-08-15', '2026-08-16', context())

    expect(workingDatesFrom(resolutions)).toHaveLength(0)
  })

  it('skips a mid-sprint public holiday', () => {
    // Nikini Poya, Thursday 27 August 2026.
    const resolutions = resolveWorkingDaysFrom(
      '2026-08-24',
      '2026-08-28',
      context({ holidaysByDate: new Map([['2026-08-27', [holiday()]]]) })
    )

    expect(workingDatesFrom(resolutions)).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-28'
    ])
  })

  it('E12 — resolves across a year boundary with holidays from both years', () => {
    const resolutions = resolveWorkingDaysFrom(
      '2026-12-23',
      '2027-01-04',
      context({
        holidaysByDate: new Map([
          ['2026-12-23', [holiday({ id: 'unduvap', name: 'Unduvap Full Moon Poya Day' })]],
          ['2026-12-25', [holiday({ id: 'christmas', name: 'Christmas Day' })]],
          ['2027-01-01', [holiday({ id: 'ny', name: "New Year's Day" })]]
        ])
      })
    )

    const working = workingDatesFrom(resolutions)

    // 23rd Poya, 25th Christmas and 1 Jan (a Friday) are all skipped, as are
    // both weekends. 4 Jan is the Monday the team comes back.
    expect(working).toEqual([
      '2026-12-24',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-04'
    ])
  })

  it('returns a resolution for every date in the range, working or not', () => {
    const resolutions = resolveWorkingDaysFrom('2026-08-24', '2026-08-30', context())
    expect(resolutions).toHaveLength(7)
  })

  it('is deterministic — the same inputs always produce the same output', () => {
    const ctx = context({ holidaysByDate: new Map([['2026-08-27', [holiday()]]]) })

    const first = resolveWorkingDaysFrom('2026-08-01', '2026-08-31', ctx)
    const second = resolveWorkingDaysFrom('2026-08-01', '2026-08-31', ctx)

    expect(first).toEqual(second)
  })
})

describe('a realistic Sri Lankan sprint', () => {
  it('generates the right working days across Nikini Poya week', () => {
    // Sprint: Mon 24 Aug - Fri 4 Sep 2026, with Nikini Poya on Thu 27 Aug.
    const resolutions = resolveWorkingDaysFrom(
      '2026-08-24',
      '2026-09-04',
      context({
        holidaysByDate: new Map([
          ['2026-08-26', [holiday({ id: 'milad', name: 'Milad un-Nabi' })]],
          ['2026-08-27', [holiday({ id: 'nikini', name: 'Nikini Full Moon Poya Day' })]]
        ])
      })
    )

    const working = workingDatesFrom(resolutions)

    // Two consecutive holidays mid-week, then weekends.
    expect(working).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-28',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04'
    ])
    expect(working).toHaveLength(8)
  })
})
