/**
 * The nightly carry-forward reconciliation and escalation job (spec §18.1,
 * NFR-8, CFW-3, N9).
 */
import mongoose from 'mongoose'

import { CarryForwardItem } from '@/models/CarryForwardItem'
import { Project } from '@/models/Project'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { notificationService } from '@/lib/notification-service'

import { escalateCarryForward } from '../jobs/escalate-carry-forward'
import { STANDUP_JOBS } from '../jobs/registry'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, member, user } = ids

let sprintId: mongoose.Types.ObjectId

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

async function seedStandup(date: string, dayNumber: number, status = 'Scheduled') {
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

describe('escalateCarryForward', () => {
  useMongo()

  let notify: jest.SpyInstance

  beforeEach(async () => {
    await syncIndexes(CarryForwardItem)
    await seedProject()
    notify = jest
      .spyOn(notificationService, 'createNotification')
      .mockResolvedValue({ _id: new mongoose.Types.ObjectId() } as never)
  })

  afterEach(() => {
    notify.mockRestore()
  })

  it('is registered against the ticker', () => {
    expect(STANDUP_JOBS['escalate-carry-forward']).toBe(escalateCarryForward)
  })

  it('is a no-op on an empty register', async () => {
    const result = await escalateCarryForward()
    expect(result.repaired).toBe(0)
    expect(result.created).toBe(0)
  })

  it('NFR-8: reattaches an item stuck on a stand-up that is no longer live', async () => {
    const completed = await seedStandup('2026-08-17', 1, 'Completed')
    const live = await seedStandup('2026-08-18', 2, 'Scheduled')

    const item = await CarryForwardItem.create({
      sprint: sprintId,
      project,
      organization,
      type: 'unfinished_task',
      originStandup: completed._id,
      originDate: '2026-08-17',
      // Simulates the build having failed to move it forward.
      currentStandup: completed._id,
      ageInStandups: 2,
      status: 'open'
    })

    const result = await escalateCarryForward()
    expect(result.repaired).toBe(1)

    const repaired = (await CarryForwardItem.findById(item._id).lean()) as any
    expect(String(repaired.currentStandup)).toBe(String(live._id))
  })

  it('leaves an item alone once its sprint has no live stand-up left', async () => {
    const completed = await seedStandup('2026-08-17', 1, 'Completed')

    await CarryForwardItem.create({
      sprint: sprintId,
      project,
      organization,
      type: 'unfinished_task',
      originStandup: completed._id,
      originDate: '2026-08-17',
      currentStandup: completed._id,
      ageInStandups: 2,
      status: 'open'
    })

    const result = await escalateCarryForward()
    expect(result.repaired).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('CFW-3/N9: notifies the project admin exactly once, on the tick the item crosses the escalation threshold', async () => {
    const standup = await seedStandup('2026-08-17', 1, 'In_Progress')

    await CarryForwardItem.create({
      sprint: sprintId,
      project,
      organization,
      type: 'open_blocker',
      originStandup: standup._id,
      originDate: '2026-08-13',
      currentStandup: standup._id,
      ageInStandups: 5, // the default escalation threshold
      status: 'escalated'
    })

    await escalateCarryForward()
    const n9Calls = notify.mock.calls.filter((call) =>
      String(call[2]?.data?.metadata?.notificationId ?? '').startsWith('N9')
    )
    expect(n9Calls).toHaveLength(1)
    expect(String(n9Calls[0][0])).toBe(String(user))

    // A second run finds the item at the same age — no renotification.
    await escalateCarryForward()
    expect(
      notify.mock.calls.filter((call) =>
        String(call[2]?.data?.metadata?.notificationId ?? '').startsWith('N9')
      )
    ).toHaveLength(1)
  })
})
