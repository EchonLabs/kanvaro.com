/**
 * The generation-audit job (spec §18.1, NFR-16).
 *
 * The safety net. Generation and reconciliation are idempotent but not atomic —
 * D-A rules out a transaction — so a process that dies mid-reconcile leaves a
 * schedule that disagrees with the calendar and nothing to notice. This job
 * walks every active sprint and repairs the disagreement.
 *
 * Its most important property is the boring one: on a healthy sprint it must
 * write nothing at all. A repair job that churns is indistinguishable from a
 * bug.
 */
import mongoose from 'mongoose'

import { Holiday } from '@/models/Holiday'
import { HolidaySet } from '@/models/HolidaySet'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import { notificationService } from '@/lib/notification-service'

import { generateStandupsForSprint } from '../generation'
import { generationAudit } from '../jobs/generation-audit'
import { STANDUP_JOBS } from '../jobs/registry'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, member, otherMember, user } = ids

let holidaySetId: mongoose.Types.ObjectId

async function seedProject() {
  const set = await HolidaySet.create({
    organization,
    name: 'Sri Lanka Public Holidays',
    countryCode: 'LK',
    createdBy: user
  })
  holidaySetId = set._id as mongoose.Types.ObjectId

  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: 'Asia/Colombo',
    subscribedHolidaySets: [set._id],
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

async function seedActiveSprint(overrides: Record<string, unknown> = {}) {
  const sprint = await Sprint.create({
    name: 'Sprint 14',
    organization,
    project,
    createdBy: user,
    status: 'active',
    startDate: new Date('2026-08-10T00:00:00.000Z'),
    endDate: new Date('2026-08-14T00:00:00.000Z'),
    capacity: 0,
    teamMembers: [member, otherMember],
    ...overrides
  })

  await generateStandupsForSprint(String(sprint._id))
  return sprint
}

describe('generation-audit', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Standup)
    jest
      .spyOn(notificationService, 'createNotification')
      .mockResolvedValue({ _id: new mongoose.Types.ObjectId() } as never)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('is registered against the ticker (OB-1)', () => {
    expect(STANDUP_JOBS['generation-audit']).toBe(generationAudit)
  })

  it('writes nothing when the schedule already matches the calendar', async () => {
    await seedProject()
    const sprint = await seedActiveSprint()
    const before = await Standup.find({ sprint: sprint._id }).lean()

    const result = await generationAudit(new Date('2026-08-11T04:00:00.000Z'))

    expect(result.repaired).toBe(0)
    expect(result.scannedProjects).toBe(1)

    const after = await Standup.find({ sprint: sprint._id }).lean()
    expect(after.map((doc: any) => doc.updatedAt.toISOString())).toEqual(
      before.map((doc: any) => doc.updatedAt.toISOString())
    )
  })

  it('recreates a stand-up that went missing from a working day', async () => {
    await seedProject()
    const sprint = await seedActiveSprint()
    await Standup.deleteOne({ sprint: sprint._id, standupDate: '2026-08-12' })

    const result = await generationAudit(new Date('2026-08-11T04:00:00.000Z'))

    expect(result.repaired).toBe(1)
    expect(
      await Standup.countDocuments({ sprint: sprint._id, standupDate: '2026-08-12' })
    ).toBe(1)
  })

  it('skips a stand-up left standing on a date that became a holiday', async () => {
    await seedProject()
    const sprint = await seedActiveSprint()

    await Holiday.create({
      holidaySet: holidaySetId,
      organization,
      date: '2026-08-13',
      name: 'Declared after generation',
      type: 'public'
    })

    const result = await generationAudit(new Date('2026-08-11T04:00:00.000Z'))

    expect(result.repaired).toBe(1)
    expect(
      (await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-13' }))?.status
    ).toBe('Skipped_Holiday')
  })

  it('leaves a sprint alone when the repair would damage completed history', async () => {
    await seedProject()
    const sprint = await seedActiveSprint()

    await Standup.updateOne(
      { sprint: sprint._id, standupDate: '2026-08-13' },
      { $set: { status: 'Completed' } }
    )
    await Sprint.updateOne(
      { _id: sprint._id },
      { $set: { endDate: new Date('2026-08-11T00:00:00.000Z') } }
    )

    const result = await generationAudit(new Date('2026-08-11T04:00:00.000Z'))

    expect(result.repaired).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toMatch(/2026-08-13/)
    expect(
      (await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-13' }))?.status
    ).toBe('Completed')
  })

  it('ignores sprints that are not running', async () => {
    await seedProject()
    await seedActiveSprint({ status: 'completed' })

    const result = await generationAudit(new Date('2026-08-11T04:00:00.000Z'))

    expect(result.scannedProjects).toBe(0)
    expect(result.repaired).toBe(0)
  })

  it('NFR-J1: two runs leave identical state', async () => {
    await seedProject()
    const sprint = await seedActiveSprint()
    await Standup.deleteOne({ sprint: sprint._id, standupDate: '2026-08-12' })

    await generationAudit(new Date('2026-08-11T04:00:00.000Z'))
    const second = await generationAudit(new Date('2026-08-11T04:00:00.000Z'))

    expect(second.repaired).toBe(0)
    expect(await Standup.countDocuments({ sprint: sprint._id })).toBe(5)
  })
})
