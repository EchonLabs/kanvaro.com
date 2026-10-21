/**
 * The mark-missed job (spec SCH-12, SCH-13, SCH-15, N8, E47, E48).
 *
 * NFR-J2 is the rule that shapes this job: "end of day" is the *project's*
 * local end of day. A single global UTC midnight sweep would mark a Colombo
 * team's stand-up missed at 5:30am their time, while a New York team's would
 * survive five and a half hours past its own midnight.
 */
import mongoose from 'mongoose'

import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import { notificationService } from '@/lib/notification-service'

import { markMissed } from '../jobs/mark-missed'
import { STANDUP_JOBS } from '../jobs/registry'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, member, otherMember, user } = ids

let sprintId: mongoose.Types.ObjectId

async function seedProject(timezone = 'Asia/Colombo') {
  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone,
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
  sprintId = sprint._id as mongoose.Types.ObjectId
}

async function seedStandup(date: string, dayNumber: number, overrides: Record<string, unknown> = {}) {
  return Standup.create({
    project,
    sprint: sprintId,
    organization,
    standupDate: date,
    scheduledStartAt: new Date(`${date}T03:30:00.000Z`),
    durationMinutes: 15,
    sprintDayNumber: dayNumber,
    totalSprintDays: 5,
    shape: dayNumber === 1 ? 'day_one' : 'mid_sprint',
    status: 'Scheduled',
    facilitator: user,
    expectedAttendees: [member, otherMember],
    ...overrides
  })
}

describe('mark-missed', () => {
  useMongo()

  let notify: jest.SpyInstance

  beforeEach(async () => {
    await syncIndexes(Standup)
    notify = jest
      .spyOn(notificationService, 'createNotification')
      .mockResolvedValue({ _id: new mongoose.Types.ObjectId() } as never)
  })

  afterEach(() => {
    notify.mockRestore()
  })

  const n8Calls = () =>
    notify.mock.calls.filter((call) => call[2]?.data?.metadata?.notificationId === 'N8')

  it('is registered against the ticker (OB-1)', () => {
    expect(STANDUP_JOBS['mark-missed']).toBe(markMissed)
  })

  it('NFR-J2: misses at the project`s local midnight, not UTC midnight', async () => {
    await seedProject('Asia/Colombo')
    const standup = await seedStandup('2026-08-10', 1)

    // 20:00 UTC on the 10th is already 01:30 on the 11th in Colombo.
    await markMissed(new Date('2026-08-10T20:00:00.000Z'))
    expect((await Standup.findById(standup._id))?.status).toBe('Missed')
  })

  it('NFR-J2: leaves a stand-up alone while its own day is still running', async () => {
    await seedProject('America/New_York')
    const standup = await seedStandup('2026-08-10', 1)

    // 20:00 UTC on the 10th is 16:00 the same day in New York.
    await markMissed(new Date('2026-08-10T20:00:00.000Z'))
    expect((await Standup.findById(standup._id))?.status).toBe('Scheduled')
  })

  it('SCH-12: misses a Ready stand-up as well as a Scheduled one', async () => {
    await seedProject()
    const ready = await seedStandup('2026-08-10', 1, { status: 'Ready' })

    await markMissed(new Date('2026-08-11T20:00:00.000Z'))

    expect((await Standup.findById(ready._id))?.status).toBe('Missed')
  })

  it('never misses a stand-up that already ran or was skipped', async () => {
    await seedProject()
    const completed = await seedStandup('2026-08-10', 1, { status: 'Completed' })
    const skipped = await seedStandup('2026-08-11', 2, { status: 'Skipped_Holiday' })
    const running = await seedStandup('2026-08-12', 3, { status: 'In_Progress' })

    await markMissed(new Date('2026-08-13T20:00:00.000Z'))

    expect((await Standup.findById(completed._id))?.status).toBe('Completed')
    expect((await Standup.findById(skipped._id))?.status).toBe('Skipped_Holiday')
    expect((await Standup.findById(running._id))?.status).toBe('In_Progress')
  })

  it('E47 / N8: notifies the facilitator, once across repeated runs (SCH-17)', async () => {
    await seedProject()
    await seedStandup('2026-08-10', 1)

    await markMissed(new Date('2026-08-10T20:00:00.000Z'))
    await markMissed(new Date('2026-08-10T20:01:00.000Z'))

    expect(n8Calls()).toHaveLength(1)
    expect(String(n8Calls()[0][0])).toBe(String(user))
  })

  it('SCH-13: rolls the missed day`s work into the next stand-up', async () => {
    await seedProject()
    await seedStandup('2026-08-10', 1)
    const next = await seedStandup('2026-08-11', 2)

    const rolled: Array<Record<string, unknown>> = []

    await markMissed(new Date('2026-08-10T20:00:00.000Z'), {
      rollForward: async (input) => {
        rolled.push(input as unknown as Record<string, unknown>)
      }
    })

    expect(rolled).toHaveLength(1)
    expect(rolled[0]).toMatchObject({
      missedDate: '2026-08-10',
      toStandupId: String(next._id),
      origin: 'missed_standup'
    })
  })

  it('SCH-15 / E48: escalates at two consecutive misses, then at three', async () => {
    await seedProject()
    await seedStandup('2026-08-10', 1)
    await seedStandup('2026-08-11', 2)
    await seedStandup('2026-08-12', 3)

    await markMissed(new Date('2026-08-10T20:00:00.000Z'))
    expect(notify.mock.calls.filter(escalation('N8_ESCALATION_2'))).toHaveLength(0)

    await markMissed(new Date('2026-08-11T20:00:00.000Z'))
    expect(notify.mock.calls.filter(escalation('N8_ESCALATION_2'))).toHaveLength(1)

    await markMissed(new Date('2026-08-12T20:00:00.000Z'))
    expect(notify.mock.calls.filter(escalation('N8_ESCALATION_3'))).toHaveLength(1)
  })

  it('SCH-15: three consecutive misses raise a sprint health warning', async () => {
    await seedProject()
    await seedStandup('2026-08-10', 1)
    await seedStandup('2026-08-11', 2)
    await seedStandup('2026-08-12', 3)

    await markMissed(new Date('2026-08-12T20:00:00.000Z'))

    const sprint = (await Sprint.findById(sprintId).lean()) as any
    expect(sprint.healthWarnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CONSECUTIVE_MISSES' })])
    )
  })

  it('SCH-15: a completed stand-up between misses breaks the streak', async () => {
    await seedProject()
    await seedStandup('2026-08-10', 1)
    await seedStandup('2026-08-11', 2, { status: 'Completed' })
    await seedStandup('2026-08-12', 3)

    await markMissed(new Date('2026-08-12T20:00:00.000Z'))

    expect(notify.mock.calls.filter(escalation('N8_ESCALATION_2'))).toHaveLength(0)
  })

  it('NFR-J1: a second run changes nothing', async () => {
    await seedProject()
    await seedStandup('2026-08-10', 1)

    const first = await markMissed(new Date('2026-08-10T20:00:00.000Z'))
    const second = await markMissed(new Date('2026-08-10T20:00:00.000Z'))

    expect(first.repaired).toBe(1)
    expect(second.repaired).toBe(0)
    expect(await Standup.countDocuments({ status: 'Missed' })).toBe(1)
  })
})

const escalation = (id: string) => (call: any[]) =>
  call[2]?.data?.metadata?.notificationId === id
