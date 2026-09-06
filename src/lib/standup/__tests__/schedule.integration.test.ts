/**
 * The schedule read model and its routes (spec UI-8, UI-9, §17.4).
 *
 * UI-9 is the rule that shapes the payload: skipped days stay **permanently
 * visible with their reason**. Filtering them out would make a nine-stand-up
 * sprint look like a nine-day sprint, and the holiday that removed the tenth
 * would be invisible to everyone who was not there when it was declared.
 */
import fs from 'fs'
import path from 'path'

import mongoose from 'mongoose'

import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { generateStandupsForSprint } from '../generation'
import { getSprintSchedule } from '../schedule'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, member, otherMember, user } = ids

async function seedProject() {
  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: 'Asia/Colombo',
    subscribedHolidaySets: [],
    overrides: []
  })

  await ProjectStandupSettings.create({
    project,
    organization,
    enabled: true,
    standupLocalTime: '09:00',
    defaultFacilitator: user
  })
}

async function seedSprint() {
  const sprint = await Sprint.create({
    name: 'Sprint 14',
    organization,
    project,
    createdBy: user,
    status: 'active',
    startDate: new Date('2026-08-10T00:00:00.000Z'),
    endDate: new Date('2026-08-14T00:00:00.000Z'),
    capacity: 0,
    teamMembers: [member, otherMember]
  })

  await generateStandupsForSprint(String(sprint._id))
  return sprint
}

describe('getSprintSchedule', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Standup)
  })

  it('returns every stand-up in date order with its shape and day number', async () => {
    await seedProject()
    const sprint = await seedSprint()

    const schedule = await getSprintSchedule(String(sprint._id))

    expect(schedule.days.map((day) => day.date)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14'
    ])
    expect(schedule.days[0]).toMatchObject({ sprintDayNumber: 1, shape: 'day_one' })
    expect(schedule.days[4].shape).toBe('final_day')
    expect(schedule.totalSprintDays).toBe(5)
  })

  it('UI-9: keeps skipped days visible, with the reason', async () => {
    await seedProject()
    const sprint = await seedSprint()

    await Standup.updateOne(
      { sprint: sprint._id, standupDate: '2026-08-12' },
      { $set: { status: 'Skipped_Holiday', skippedReason: 'Nikini Full Moon Poya Day' } }
    )

    const schedule = await getSprintSchedule(String(sprint._id))

    const skipped = schedule.days.find((day) => day.date === '2026-08-12')
    expect(skipped).toMatchObject({
      status: 'Skipped_Holiday',
      skippedReason: 'Nikini Full Moon Poya Day'
    })
    expect(schedule.days).toHaveLength(5)
  })

  it('UI-8: names today in the project timezone so the row can be pinned', async () => {
    await seedProject()
    const sprint = await seedSprint()

    // 20:00 UTC on the 11th is already the 12th in Colombo.
    const schedule = await getSprintSchedule(String(sprint._id), {
      now: new Date('2026-08-11T20:00:00.000Z')
    })

    expect(schedule.today).toBe('2026-08-12')
    expect(schedule.timezone).toBe('Asia/Colombo')
  })

  it('reports the sprint date range so the banner can ask about coverage (OB-3)', async () => {
    await seedProject()
    const sprint = await seedSprint()

    const schedule = await getSprintSchedule(String(sprint._id))

    expect(schedule.dateRange).toEqual({ from: '2026-08-10', to: '2026-08-14' })
  })

  it('returns an empty schedule rather than throwing for a sprint with none', async () => {
    await seedProject()
    const sprint = await Sprint.create({
      name: 'Unplanned',
      organization,
      project,
      createdBy: user,
      status: 'planning',
      startDate: new Date('2026-09-07T00:00:00.000Z'),
      endDate: new Date('2026-09-11T00:00:00.000Z'),
      capacity: 0,
      teamMembers: []
    })

    const schedule = await getSprintSchedule(String(sprint._id))

    expect(schedule.days).toEqual([])
    expect(schedule.totalSprintDays).toBe(0)
  })

  it('refuses a sprint that does not exist', async () => {
    await expect(
      getSprintSchedule(String(new mongoose.Types.ObjectId()))
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('the schedule routes are permission-gated (SEC-1)', () => {
  const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

  it('GET the schedule requires STANDUP_VIEW', () => {
    const source = read('src/app/api/sprints/[id]/standups/route.ts')
    expect(source).toContain('Permission.STANDUP_VIEW')
    expect(source).toContain('withSprintPermission')
  })

  it('POST generate requires STANDUP_GENERATE, not merely view', () => {
    const source = read('src/app/api/sprints/[id]/standups/generate/route.ts')
    expect(source).toContain('Permission.STANDUP_GENERATE')
    expect(source).not.toContain('Permission.STANDUP_VIEW')
  })

  it('GET one stand-up goes through the stand-up-scoped helper, not an org check', () => {
    const source = read('src/app/api/standups/[id]/route.ts')
    expect(source).toContain('withStandupIdPermission')
    expect(source).toContain('Permission.STANDUP_VIEW')
  })

  it('every route exports a handler', async () => {
    const schedule = await import('@/app/api/sprints/[id]/standups/route')
    const generate = await import('@/app/api/sprints/[id]/standups/generate/route')
    const detail = await import('@/app/api/standups/[id]/route')

    expect(typeof schedule.GET).toBe('function')
    expect(typeof generate.POST).toBe('function')
    expect(typeof detail.GET).toBe('function')
  })
})
