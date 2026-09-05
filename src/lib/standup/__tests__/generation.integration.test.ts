/**
 * Stand-up generation (spec SCH-1..SCH-5, AC-1, AC-2, E7, E10).
 *
 * AC-1 is the canonical acceptance scenario for the whole module, and it is
 * asserted here verbatim: a Mon–Fri Asia/Colombo project, a public holiday on
 * Wednesday 12 August 2026, a sprint from 10 to 21 August, and exactly nine
 * stand-ups with the right shapes on the right dates.
 */
import mongoose from 'mongoose'

import { Holiday } from '@/models/Holiday'
import { HolidaySet } from '@/models/HolidaySet'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { generateStandupsForSprint } from '../generation'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, member, otherMember, user } = ids

async function seedCalendar(overrides: Record<string, unknown> = {}) {
  const set = await HolidaySet.create({
    organization,
    name: 'Sri Lanka Public Holidays',
    countryCode: 'LK',
    createdBy: user
  })

  await Holiday.create({
    holidaySet: set._id,
    organization,
    date: '2026-08-12',
    name: 'Nikini Full Moon Poya Day',
    type: 'public'
  })

  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: 'Asia/Colombo',
    subscribedHolidaySets: [set._id],
    overrides: [],
    ...overrides
  })

  return set._id as mongoose.Types.ObjectId
}

async function seedSettings(overrides: Record<string, unknown> = {}) {
  return ProjectStandupSettings.create({
    project,
    organization,
    enabled: true,
    standupLocalTime: '09:00',
    durationMinutes: 15,
    defaultFacilitator: user,
    ...overrides
  })
}

async function seedSprint(overrides: Record<string, unknown> = {}) {
  return Sprint.create({
    name: 'Sprint 14',
    organization,
    project,
    createdBy: user,
    status: 'planning',
    startDate: new Date('2026-08-10T00:00:00.000Z'),
    endDate: new Date('2026-08-21T00:00:00.000Z'),
    capacity: 0,
    teamMembers: [member, otherMember],
    ...overrides
  })
}

describe('generateStandupsForSprint', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Standup)
  })

  it('AC-1: generates one stand-up per working day, skipping the holiday', async () => {
    await seedCalendar()
    await seedSettings()
    const sprint = await seedSprint()

    const result = await generateStandupsForSprint(String(sprint._id))

    expect(result.created).toBe(9)
    expect(result.totalSprintDays).toBe(9)

    const dates = (await Standup.find({ sprint: sprint._id }).sort({ standupDate: 1 })).map(
      (standup) => standup.standupDate
    )

    expect(dates).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-13',
      '2026-08-14',
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21'
    ])

    // The holiday, both weekends, and everything past the sprint end.
    for (const absent of ['2026-08-12', '2026-08-15', '2026-08-16', '2026-08-22', '2026-08-23']) {
      expect(dates).not.toContain(absent)
    }
  })

  it('AC-1: day one and final day carry the right number and shape', async () => {
    await seedCalendar()
    await seedSettings()
    const sprint = await seedSprint()

    await generateStandupsForSprint(String(sprint._id))

    const first = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-10' })
    const last = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-21' })

    expect(first?.sprintDayNumber).toBe(1)
    expect(first?.shape).toBe('day_one')
    expect(last?.sprintDayNumber).toBe(9)
    expect(last?.shape).toBe('final_day')
    expect(last?.totalSprintDays).toBe(9)
  })

  it('SCH-3: carries the settings, facilitator and team onto every stand-up', async () => {
    await seedCalendar()
    await seedSettings({ durationMinutes: 20, meetingUrl: 'https://meet.example/kanvaro' })
    const sprint = await seedSprint()

    await generateStandupsForSprint(String(sprint._id))

    const standup = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-10' })

    expect(standup?.durationMinutes).toBe(20)
    expect(standup?.meetingUrl).toBe('https://meet.example/kanvaro')
    expect(String(standup?.facilitator)).toBe(String(user))
    expect(standup?.expectedAttendees.map(String).sort()).toEqual(
      [String(member), String(otherMember)].sort()
    )
    expect(standup?.status).toBe('Scheduled')
  })

  it('SCH-3: scheduledStartAt is the project-local time, not a UTC one', async () => {
    await seedCalendar()
    await seedSettings({ standupLocalTime: '09:15' })
    const sprint = await seedSprint()

    await generateStandupsForSprint(String(sprint._id))

    const standup = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-10' })

    // Asia/Colombo is UTC+5:30 year round, so 09:15 local is 03:45 UTC.
    expect(standup?.scheduledStartAt.toISOString()).toBe('2026-08-10T03:45:00.000Z')
  })

  it('E7: a DST transition inside the sprint keeps the local wall clock', async () => {
    // America/New_York shifts on 1 November 2026. 09:00 local is 13:00 UTC
    // before the change and 14:00 UTC after it.
    await WorkingCalendar.create({
      scope: 'project',
      organization,
      project,
      workingDaysOfWeek: [1, 2, 3, 4, 5],
      standardMinutesPerDay: 480,
      timezone: 'America/New_York',
      subscribedHolidaySets: [],
      overrides: []
    })
    await seedSettings({ standupLocalTime: '09:00' })
    const sprint = await seedSprint({
      startDate: new Date('2026-10-29T00:00:00.000Z'),
      endDate: new Date('2026-11-04T00:00:00.000Z')
    })

    await generateStandupsForSprint(String(sprint._id))

    const before = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-10-30' })
    const after = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-11-02' })

    expect(before?.scheduledStartAt.toISOString()).toBe('2026-10-30T13:00:00.000Z')
    expect(after?.scheduledStartAt.toISOString()).toBe('2026-11-02T14:00:00.000Z')
  })

  it('AC-2 / SCH-2: a second run creates nothing and reports every date skipped', async () => {
    await seedCalendar()
    await seedSettings()
    const sprint = await seedSprint()

    await generateStandupsForSprint(String(sprint._id))
    const second = await generateStandupsForSprint(String(sprint._id))

    expect(second.created).toBe(0)
    expect(second.skipped).toBe(9)
    expect(await Standup.countDocuments({ sprint: sprint._id })).toBe(9)
  })

  it('E10: a duplicate write from a racing generator is a no-op, not a failure', async () => {
    await seedCalendar()
    await seedSettings()
    const sprint = await seedSprint()

    const [first, second] = await Promise.all([
      generateStandupsForSprint(String(sprint._id)),
      generateStandupsForSprint(String(sprint._id))
    ])

    expect(first.created + second.created).toBe(9)
    expect(await Standup.countDocuments({ sprint: sprint._id })).toBe(9)
  })

  it('SCH-5: a sprint with no working days is refused and creates nothing', async () => {
    await seedCalendar()
    await seedSettings()
    const sprint = await seedSprint({
      startDate: new Date('2026-08-15T00:00:00.000Z'), // Saturday
      endDate: new Date('2026-08-16T00:00:00.000Z') // Sunday
    })

    await expect(generateStandupsForSprint(String(sprint._id))).rejects.toThrow(
      /no working days/i
    )

    expect(await Standup.countDocuments({ sprint: sprint._id })).toBe(0)
  })

  it('generates a 60-working-day sprint in one pass', async () => {
    await seedCalendar()
    await seedSettings()
    const sprint = await seedSprint({
      startDate: new Date('2026-08-10T00:00:00.000Z'),
      endDate: new Date('2026-10-30T00:00:00.000Z')
    })

    const result = await generateStandupsForSprint(String(sprint._id))

    // 12 weeks of Mon–Fri less the 12 August holiday.
    expect(result.created).toBe(59)
    expect(result.totalSprintDays).toBe(59)
  })

  it('reports a holiday coverage gap rather than silently generating past the data', async () => {
    await seedCalendar()
    await seedSettings()
    const sprint = await seedSprint({
      startDate: new Date('2027-08-09T00:00:00.000Z'),
      endDate: new Date('2027-08-20T00:00:00.000Z')
    })

    const result = await generateStandupsForSprint(String(sprint._id))

    expect(result.created).toBe(10)
    expect(result.coverageWarning).toMatch(/holiday data/i)
  })

  it('refuses a sprint that does not exist', async () => {
    await expect(
      generateStandupsForSprint(String(new mongoose.Types.ObjectId()))
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
