/**
 * Integration tests for the loader layer (spec CAL-1, CAL-2, CAL-7, CAL-12).
 *
 * `working-day.test.ts` proves the precedence *rules* against hand-built
 * contexts. This suite proves the step those tests take on trust: that what is
 * actually persisted in MongoDB becomes the right `CalendarContext`. Field
 * renames, a missing `.lean()`, an ObjectId compared against a string — none of
 * those are visible to a pure unit test, and all of them break resolution.
 */
import mongoose from 'mongoose'

import { Holiday } from '@/models/Holiday'
import { HolidaySet } from '@/models/HolidaySet'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import {
  checkHolidayCoverage,
  getHolidayCoverage,
  loadCalendarContext,
  resolveWorkingDay,
  resolveWorkingDays
} from '../calendar-service'
import { ids, useMongo } from './helpers/mongo'

const { organization, project, otherProject, member, user } = ids

/** Creates a holiday set and returns its id. */
async function createHolidaySet(name = 'Sri Lanka Public Holidays') {
  const set = await HolidaySet.create({
    organization,
    name,
    countryCode: 'LK',
    createdBy: user
  })
  return set._id as mongoose.Types.ObjectId
}

async function addHoliday(
  holidaySet: mongoose.Types.ObjectId,
  date: string,
  name: string,
  extra: Record<string, unknown> = {}
) {
  return Holiday.create({ holidaySet, organization, date, name, type: 'public', ...extra })
}

/** A Mon–Fri, 8h, Asia/Colombo project calendar. */
async function createProjectCalendar(overrides: Record<string, unknown> = {}) {
  return WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: 'Asia/Colombo',
    subscribedHolidaySets: [],
    overrides: [],
    ...overrides
  })
}

describe('loadCalendarContext', () => {
  useMongo()

  it('reads the project calendar in preference to the organisation one', async () => {
    await WorkingCalendar.create({
      scope: 'organization',
      organization,
      workingDaysOfWeek: [0, 1, 2, 3, 4],
      standardMinutesPerDay: 360,
      timezone: 'UTC'
    })
    await createProjectCalendar()

    const context = await loadCalendarContext(project.toString(), '2026-08-01', '2026-08-31')

    expect(context.workingDaysOfWeek).toEqual([1, 2, 3, 4, 5])
    expect(context.standardMinutesPerDay).toBe(480)
    expect(context.timezone).toBe('Asia/Colombo')
  })

  it('falls back to the organisation calendar when the project has none', async () => {
    await WorkingCalendar.create({
      scope: 'organization',
      organization,
      // A Sunday-to-Thursday week, so the fallback is unmistakable.
      workingDaysOfWeek: [0, 1, 2, 3, 4],
      standardMinutesPerDay: 360,
      timezone: 'Asia/Dubai'
    })

    const context = await loadCalendarContext(otherProject.toString(), '2026-08-01', '2026-08-31')

    expect(context.workingDaysOfWeek).toEqual([0, 1, 2, 3, 4])
    expect(context.standardMinutesPerDay).toBe(360)
    expect(context.timezone).toBe('Asia/Dubai')
  })

  it('falls back to Mon-Fri 8h UTC when nothing is configured at all', async () => {
    const context = await loadCalendarContext(project.toString(), '2026-08-01', '2026-08-31')

    expect(context.workingDaysOfWeek).toEqual([1, 2, 3, 4, 5])
    expect(context.standardMinutesPerDay).toBe(480)
    expect(context.timezone).toBe('UTC')
  })

  it('loads only holidays from subscribed sets', async () => {
    const subscribed = await createHolidaySet('Subscribed')
    const ignored = await createHolidaySet('Not subscribed')

    await addHoliday(subscribed, '2026-08-27', 'Nikini Full Moon Poya Day')
    await addHoliday(ignored, '2026-08-28', 'Some other calendar')

    await createProjectCalendar({ subscribedHolidaySets: [subscribed] })

    const context = await loadCalendarContext(project.toString(), '2026-08-01', '2026-08-31')

    expect(context.holidaysByDate.get('2026-08-27')).toHaveLength(1)
    expect(context.holidaysByDate.has('2026-08-28')).toBe(false)
  })

  it('bounds the holiday query to the requested range', async () => {
    const set = await createHolidaySet()
    await addHoliday(set, '2026-08-27', 'In range')
    await addHoliday(set, '2027-05-01', 'Out of range')

    await createProjectCalendar({ subscribedHolidaySets: [set] })

    const context = await loadCalendarContext(project.toString(), '2026-08-01', '2026-08-31')

    expect(context.holidaysByDate.has('2026-08-27')).toBe(true)
    expect(context.holidaysByDate.has('2027-05-01')).toBe(false)
  })

  it('keeps both holidays when two share a date', async () => {
    const set = await createHolidaySet()
    // 1 May 2026 is both May Day and Vesak Poya in Sri Lanka.
    await addHoliday(set, '2026-05-01', 'May Day')
    await addHoliday(set, '2026-05-01', 'Vesak Full Moon Poya Day')

    await createProjectCalendar({ subscribedHolidaySets: [set] })

    const context = await loadCalendarContext(project.toString(), '2026-05-01', '2026-05-01')

    expect(context.holidaysByDate.get('2026-05-01')).toHaveLength(2)
  })

  it('carries a partial holiday through as minutes', async () => {
    const set = await createHolidaySet()
    await addHoliday(set, '2026-12-24', 'Christmas Eve', {
      isFullDay: false,
      minutesIfPartial: 240
    })
    await createProjectCalendar({ subscribedHolidaySets: [set] })

    const context = await loadCalendarContext(project.toString(), '2026-12-24', '2026-12-24')
    const [holiday] = context.holidaysByDate.get('2026-12-24')!

    expect(holiday.isFullDay).toBe(false)
    expect(holiday.minutesIfPartial).toBe(240)
  })

  it('splits overrides into dated and annually recurring buckets', async () => {
    await createProjectCalendar({
      overrides: [
        {
          date: '2026-12-24',
          name: 'Christmas Eve',
          effect: 'non_working',
          recurringAnnually: true,
          createdBy: user
        },
        {
          date: '2026-08-27',
          name: 'Team works Nikini Poya',
          effect: 'observed_as_working',
          createdBy: user
        }
      ]
    })

    const context = await loadCalendarContext(project.toString(), '2026-01-01', '2026-12-31')

    expect(context.overridesByDate.get('2026-08-27')).toHaveLength(1)
    expect(context.overridesByDate.has('2026-12-24')).toBe(false)
    expect(context.recurringOverridesByMonthDay.get('12-24')).toHaveLength(1)
  })

  it('stringifies member scoping so the rules layer can compare it', async () => {
    await createProjectCalendar({
      overrides: [
        {
          date: '2026-08-20',
          name: 'Kasun at a conference',
          effect: 'non_working',
          appliesToMemberIds: [member],
          createdBy: user
        }
      ]
    })

    const context = await loadCalendarContext(project.toString(), '2026-08-20', '2026-08-20')
    const [override] = context.overridesByDate.get('2026-08-20')!

    // An ObjectId here would silently never match the string ids the resolver
    // is given, turning a member-scoped override into a project-wide one.
    expect(override.appliesToMemberIds).toEqual([member.toString()])
    expect(typeof override.appliesToMemberIds?.[0]).toBe('string')
  })
})

describe('resolveWorkingDay end to end', () => {
  useMongo()

  it('CAL-2 — returns the holiday name, not just a boolean', async () => {
    const set = await createHolidaySet()
    await addHoliday(set, '2026-08-27', 'Nikini Full Moon Poya Day')
    await createProjectCalendar({ subscribedHolidaySets: [set] })

    const resolution = await resolveWorkingDay(project.toString(), '2026-08-27')

    expect(resolution.isWorkingDay).toBe(false)
    expect(resolution.reason).toBe('org_holiday')
    expect(resolution.holidayName).toBe('Nikini Full Moon Poya Day')
  })

  it('CAL-3 — a project override restores a gazetted holiday as a working day', async () => {
    const set = await createHolidaySet()
    await addHoliday(set, '2026-08-27', 'Nikini Full Moon Poya Day')
    await createProjectCalendar({
      subscribedHolidaySets: [set],
      overrides: [
        {
          date: '2026-08-27',
          name: 'Team works Nikini Poya',
          effect: 'observed_as_working',
          createdBy: user
        }
      ]
    })

    const resolution = await resolveWorkingDay(project.toString(), '2026-08-27')

    expect(resolution.isWorkingDay).toBe(true)
    expect(resolution.reason).toBe('working')
  })

  it('resolves a real Sri Lankan sprint week from persisted data', async () => {
    const set = await createHolidaySet()
    await addHoliday(set, '2026-08-26', 'Milad un-Nabi')
    await addHoliday(set, '2026-08-27', 'Nikini Full Moon Poya Day')
    await createProjectCalendar({ subscribedHolidaySets: [set] })

    const week = await resolveWorkingDays(project.toString(), '2026-08-24', '2026-08-30')

    expect(week).toHaveLength(7)
    expect(week.filter((day) => day.isWorkingDay)).toHaveLength(3)
    expect(week.find((day) => day.date === '2026-08-26')?.holidayName).toBe('Milad un-Nabi')
    expect(week.find((day) => day.date === '2026-08-29')?.reason).toBe('weekend')
  })

  it('applies an annually recurring override in a later year', async () => {
    await createProjectCalendar({
      overrides: [
        {
          date: '2026-12-24',
          name: 'Christmas Eve',
          effect: 'non_working',
          recurringAnnually: true,
          createdBy: user
        }
      ]
    })

    // 24 Dec 2027 is a Friday, and no explicit override exists for that year.
    const resolution = await resolveWorkingDay(project.toString(), '2027-12-24')

    expect(resolution.isWorkingDay).toBe(false)
    expect(resolution.reason).toBe('project_non_working')
    // A project override is its own layer, so it reports `overrideName`.
    // `holidayName` stays reserved for holidays coming from a subscribed set.
    expect(resolution.overrideName).toBe('Christmas Eve')
    expect(resolution.holidayName).toBeUndefined()
  })
})

describe('holiday coverage', () => {
  useMongo()

  it('returns null when the project subscribes to nothing', async () => {
    await createProjectCalendar()
    expect(await checkHolidayCoverage(project.toString(), '2026-01-01', '2026-12-31')).toBeNull()
  })

  it('reports the loaded span across several sets', async () => {
    const lk = await createHolidaySet('Sri Lanka')
    const uk = await createHolidaySet('UK')
    await addHoliday(lk, '2026-01-03', 'Duruthu Poya')
    await addHoliday(lk, '2026-12-25', 'Christmas Day')
    await addHoliday(uk, '2026-08-31', 'Summer bank holiday')

    const coverage = await getHolidayCoverage([lk.toString(), uk.toString()])

    expect(coverage).toEqual({ from: '2026-01-03', to: '2026-12-25', count: 3 })
  })

  it('warns when the range runs past the loaded data', async () => {
    const set = await createHolidaySet()
    await addHoliday(set, '2026-12-25', 'Christmas Day')
    await createProjectCalendar({ subscribedHolidaySets: [set] })

    const warning = await checkHolidayCoverage(project.toString(), '2026-01-01', '2027-06-30')

    expect(warning).not.toBeNull()
    expect(warning!.coveredTo).toBe('2026-12-25')
    expect(warning!.message).toContain('2026-12-25')
  })

  it('stays silent when the range is fully covered', async () => {
    const set = await createHolidaySet()
    await addHoliday(set, '2026-12-25', 'Christmas Day')
    await createProjectCalendar({ subscribedHolidaySets: [set] })

    expect(await checkHolidayCoverage(project.toString(), '2026-01-01', '2026-11-30')).toBeNull()
  })

  it('warns when a set is subscribed but empty', async () => {
    const set = await createHolidaySet()
    await createProjectCalendar({ subscribedHolidaySets: [set] })

    const warning = await checkHolidayCoverage(project.toString(), '2026-01-01', '2026-12-31')

    expect(warning?.message).toContain('No holidays have been loaded')
  })
})
