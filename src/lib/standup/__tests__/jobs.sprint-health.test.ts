/**
 * The N12 sprint-health job (spec §18.1, CC-11, N12).
 */
import mongoose from 'mongoose'

import { MemberCapacity } from '@/models/MemberCapacity'
import { Project } from '@/models/Project'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import { notificationService } from '@/lib/notification-service'

import { runSprintHealthJob } from '../jobs/sprint-health'
import { STANDUP_JOBS } from '../jobs/registry'
import { ids, useMongo } from './helpers/mongo'

const { organization, project, member, user } = ids

let sprintId: mongoose.Types.ObjectId
let taskCounter = 0

async function seedProject() {
  await Project.create({
    _id: project,
    name: 'Kanvaro',
    organization,
    createdBy: user,
    status: 'active',
    projectNumber: 9,
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    projectRoles: []
  })

  await ProjectStandupSettings.create({
    project,
    organization,
    enabled: true
  })

  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: 'UTC',
    subscribedHolidaySets: [],
    overrides: []
  })

  const sprint = await Sprint.create({
    name: 'Sprint 9',
    organization,
    project,
    createdBy: user,
    status: 'active',
    startDate: new Date('2026-08-17T00:00:00.000Z'),
    endDate: new Date('2026-08-21T00:00:00.000Z'),
    capacity: 0,
    teamMembers: [member]
  })
  sprintId = sprint._id as mongoose.Types.ObjectId
}

async function seedStandup(date: string, dayNumber: number, status = 'In_Progress') {
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
    status,
    facilitator: user,
    expectedAttendees: [member],
    version: 0
  })
}

async function seedTask(remainingEstimateMinutes: number, status = 'in_progress') {
  taskCounter += 1
  return Task.create({
    title: `Task ${taskCounter}`,
    organization,
    project,
    sprint: sprintId,
    createdBy: user,
    taskNumber: taskCounter,
    displayId: `KAN-${taskCounter}`,
    status,
    remainingEstimateMinutes,
    originalEstimateMinutes: remainingEstimateMinutes,
    assignedTo: [{ user: member }]
  })
}

async function seedCapacity(dailyCapacityMinutes: number) {
  return MemberCapacity.create({
    project,
    member,
    dailyCapacityMinutes,
    effectiveFrom: '2026-08-01',
    isActive: true
  })
}

describe('runSprintHealthJob', () => {
  useMongo()

  let notify: jest.SpyInstance

  beforeEach(async () => {
    taskCounter = 0
    await seedProject()
    notify = jest
      .spyOn(notificationService, 'createNotification')
      .mockResolvedValue({ _id: new mongoose.Types.ObjectId() } as never)
  })

  afterEach(() => {
    notify.mockRestore()
  })

  it('is registered against the ticker', () => {
    expect(STANDUP_JOBS['sprint-health']).toBe(runSprintHealthJob)
  })

  it('is a no-op when there are no active sprints', async () => {
    const result = await runSprintHealthJob(new Date('2026-08-18T09:00:00.000Z'))
    expect(result.created).toBe(0)
  })

  it('sends nothing when remaining scope fits remaining capacity', async () => {
    await seedStandup('2026-08-18', 2)
    // Two remaining working days (18th, 19th, 20th, 21st minus weekend =
    // Tue 18, Wed 19, Thu 20, Fri 21 -> 4 working days) at 480m/day is ample
    // headroom against a small remaining estimate.
    await seedCapacity(480)
    await seedTask(120)

    const result = await runSprintHealthJob(new Date('2026-08-18T09:00:00.000Z'))

    expect(result.created).toBe(0)
    expect(notify).not.toHaveBeenCalled()
  })

  it('N12: sends one notification and sets the ledger key when remaining scope exceeds remaining capacity', async () => {
    const standup = await seedStandup('2026-08-18', 2)
    // 4 remaining working days (18-21 Aug) * 60m/day = 240m of capacity.
    await seedCapacity(60)
    await seedTask(10_000)

    const result = await runSprintHealthJob(new Date('2026-08-18T09:00:00.000Z'))

    expect(result.created).toBe(1)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(String(notify.mock.calls[0][0])).toBe(String(user))

    const stored = (await Standup.findById(standup._id).lean()) as any
    expect(stored.notificationsSent?.[`N12:${sprintId}`]).toBeInstanceOf(Date)
  })

  it('does not resend on a second call the same day', async () => {
    await seedStandup('2026-08-18', 2)
    await seedCapacity(60)
    await seedTask(10_000)

    await runSprintHealthJob(new Date('2026-08-18T09:00:00.000Z'))
    const second = await runSprintHealthJob(new Date('2026-08-18T09:00:00.000Z'))

    expect(second.created).toBe(0)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('does not resend when the "live" stand-up rotates to a later day', async () => {
    // One Standup document per day (day 1 and day 2), matching how the real
    // schedule is generated. Day 1 is live on the first call; by the time the
    // job runs again day 1 has completed and day 2 has become the live one —
    // the anchor must stay pinned to day 1 regardless.
    const day1 = await seedStandup('2026-08-17', 1, 'In_Progress')
    const day2 = await seedStandup('2026-08-18', 2, 'Scheduled')
    await seedCapacity(60)
    await seedTask(10_000)

    const first = await runSprintHealthJob(new Date('2026-08-17T09:00:00.000Z'))
    expect(first.created).toBe(1)
    expect(notify).toHaveBeenCalledTimes(1)

    // Day 1 finishes, day 2 becomes the live stand-up — the naive "whichever
    // stand-up is live right now" anchor would rotate here and re-claim.
    await Standup.updateOne({ _id: day1._id }, { $set: { status: 'Completed' } })
    await Standup.updateOne({ _id: day2._id }, { $set: { status: 'In_Progress' } })

    const second = await runSprintHealthJob(new Date('2026-08-18T09:00:00.000Z'))

    expect(second.created).toBe(0)
    expect(notify).toHaveBeenCalledTimes(1)

    // The ledger key lives on day 1 — the fixed anchor — not day 2.
    const storedDay1 = (await Standup.findById(day1._id).lean()) as any
    const storedDay2 = (await Standup.findById(day2._id).lean()) as any
    expect(storedDay1.notificationsSent?.[`N12:${sprintId}`]).toBeInstanceOf(Date)
    expect(storedDay2.notificationsSent?.[`N12:${sprintId}`]).toBeUndefined()
  })
})
