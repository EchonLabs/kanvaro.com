/**
 * Calendar-change impact (spec CAL-12, CAL-13, CAL-16).
 *
 * §7.3 names propagation the highest-risk area in the module, so the whole
 * disposition table is exercised: every stand-up status crossed with a date
 * becoming working or non-working.
 */
import {
  analyseCalendarImpact,
  describeImpact,
  type ExistingStandup,
  type StandupStatusForImpact
} from '../calendar-impact'

const NIKINI = '2026-08-27'

const state = (entries: Array<[string, boolean]>) => new Map(entries)
const standups = (entries: Array<[string, ExistingStandup]>) => new Map(entries)

describe('CAL-13 — a date becomes a working day', () => {
  it('creates a stand-up when none exists', () => {
    const summary = analyseCalendarImpact({
      before: state([[NIKINI, false]]),
      after: state([[NIKINI, true]]),
      existing: standups([])
    })

    expect(summary.created).toHaveLength(1)
    expect(summary.items[0].disposition).toBe('create')
    // CAL-13 also requires renumbering, which the message must warn about.
    expect(summary.items[0].message).toMatch(/day numbers will shift/)
  })

  it('re-creates one for a date that had been skipped as a holiday', () => {
    const summary = analyseCalendarImpact({
      before: state([[NIKINI, false]]),
      after: state([[NIKINI, true]]),
      existing: standups([[NIKINI, { date: NIKINI, status: 'Skipped_Holiday' }]])
    })

    expect(summary.items[0].disposition).toBe('create')
  })

  it('does nothing when a live stand-up already exists', () => {
    const summary = analyseCalendarImpact({
      before: state([[NIKINI, false]]),
      after: state([[NIKINI, true]]),
      existing: standups([[NIKINI, { date: NIKINI, status: 'Scheduled' }]])
    })

    expect(summary.items[0].disposition).toBe('no_change')
  })
})

describe('CAL-12 — a date becomes non-working', () => {
  const becomesHoliday = (status: StandupStatusForImpact, carryForwardCount?: number) =>
    analyseCalendarImpact({
      before: state([[NIKINI, true]]),
      after: state([[NIKINI, false]]),
      existing: standups([[NIKINI, { date: NIKINI, status, carryForwardCount }]])
    })

  it('skips a Scheduled stand-up', () => {
    const summary = becomesHoliday('Scheduled')

    expect(summary.items[0].disposition).toBe('skip')
    expect(summary.items[0].blocked).toBe(false)
  })

  it('skips a Ready stand-up', () => {
    expect(becomesHoliday('Ready').items[0].disposition).toBe('skip')
  })

  it('names the carry-forward items that will move to the next working day', () => {
    // AC-3: three prepared items must reappear on the following stand-up.
    const summary = becomesHoliday('Scheduled', 3)

    expect(summary.items[0].carryForwardCount).toBe(3)
    expect(summary.items[0].message).toMatch(/3 carry-forward items will move/)
  })

  it('uses the singular for a single carry-forward item', () => {
    expect(becomesHoliday('Ready', 1).items[0].message).toMatch(/1 carry-forward item will move/)
  })

  it('leaves an In_Progress stand-up alone and warns the facilitator', () => {
    const summary = becomesHoliday('In_Progress')

    expect(summary.items[0].disposition).toBe('warn_in_progress')
    expect(summary.items[0].blocked).toBe(false)
    expect(summary.warnings).toHaveLength(1)
  })

  it('reclassifies a Missed stand-up and clears the missed flag', () => {
    const summary = becomesHoliday('Missed')

    expect(summary.items[0].disposition).toBe('skip_clear_missed')
    expect(summary.items[0].message).toMatch(/no longer count as missed/)
  })

  it('reports nothing to do when no stand-up exists for the date', () => {
    const summary = analyseCalendarImpact({
      before: state([[NIKINI, true]]),
      after: state([[NIKINI, false]]),
      existing: standups([])
    })

    expect(summary.items[0].disposition).toBe('no_change')
  })

  it('treats an already-skipped date as no change', () => {
    expect(becomesHoliday('Skipped_Holiday').items[0].disposition).toBe('no_change')
  })
})

describe('CAL-16 / E4 — completed stand-ups are never touched', () => {
  const completed = (status: StandupStatusForImpact) =>
    analyseCalendarImpact({
      before: state([['2026-08-11', true]]),
      after: state([['2026-08-11', false]]),
      existing: standups([['2026-08-11', { date: '2026-08-11', status }]])
    })

  it('blocks the change and records a calendar anomaly note', () => {
    const summary = completed('Completed')

    expect(summary.items[0].disposition).toBe('blocked_completed')
    expect(summary.items[0].blocked).toBe(true)
    expect(summary.items[0].message).toMatch(/calendar anomaly note/)
    expect(summary.blocked).toHaveLength(1)
  })

  it('blocks a reopened stand-up too, since its history is equally real', () => {
    expect(completed('Reopened').items[0].blocked).toBe(true)
  })

  it('UI-3 — the rest of the change still applies alongside a blocked date', () => {
    const summary = analyseCalendarImpact({
      before: state([
        ['2026-08-11', true],
        ['2026-08-27', true]
      ]),
      after: state([
        ['2026-08-11', false],
        ['2026-08-27', false]
      ]),
      existing: standups([
        ['2026-08-11', { date: '2026-08-11', status: 'Completed' }],
        ['2026-08-27', { date: '2026-08-27', status: 'Scheduled' }]
      ])
    })

    expect(summary.blocked).toHaveLength(1)
    expect(summary.skipped).toHaveLength(1)
    // One date is refused, but the change is still worth applying.
    expect(summary.hasApplicableChanges).toBe(true)
  })
})

describe('summary shaping', () => {
  it('omits dates whose working-day state does not change', () => {
    const summary = analyseCalendarImpact({
      before: state([
        ['2026-08-24', true],
        ['2026-08-25', true]
      ]),
      after: state([
        ['2026-08-24', true],
        ['2026-08-25', true]
      ]),
      existing: standups([])
    })

    expect(summary.items).toHaveLength(0)
    expect(summary.hasApplicableChanges).toBe(false)
  })

  it('returns items in date order', () => {
    const summary = analyseCalendarImpact({
      before: state([
        ['2026-08-27', true],
        ['2026-08-24', true]
      ]),
      after: state([
        ['2026-08-27', false],
        ['2026-08-24', false]
      ]),
      existing: standups([])
    })

    expect(summary.items.map((item) => item.date)).toEqual(['2026-08-24', '2026-08-27'])
  })

  it('reports no applicable changes when everything is blocked', () => {
    const summary = analyseCalendarImpact({
      before: state([['2026-08-11', true]]),
      after: state([['2026-08-11', false]]),
      existing: standups([['2026-08-11', { date: '2026-08-11', status: 'Completed' }]])
    })

    expect(summary.hasApplicableChanges).toBe(false)
  })
})

describe('describeImpact', () => {
  it('says so plainly when nothing is affected', () => {
    const summary = analyseCalendarImpact({
      before: state([]),
      after: state([]),
      existing: standups([])
    })

    expect(describeImpact(summary)).toBe('This change does not affect any stand-ups.')
  })

  it('counts each category', () => {
    const summary = analyseCalendarImpact({
      before: state([
        ['2026-08-11', true],
        ['2026-08-27', true],
        ['2026-08-29', false]
      ]),
      after: state([
        ['2026-08-11', false],
        ['2026-08-27', false],
        ['2026-08-29', true]
      ]),
      existing: standups([
        ['2026-08-11', { date: '2026-08-11', status: 'Completed' }],
        ['2026-08-27', { date: '2026-08-27', status: 'Scheduled' }]
      ])
    })

    const message = describeImpact(summary)
    expect(message).toMatch(/1 stand-up will be created/)
    expect(message).toMatch(/1 will be skipped/)
    expect(message).toMatch(/1 completed cannot be changed/)
  })
})
