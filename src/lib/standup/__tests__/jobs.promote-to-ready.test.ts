/**
 * The promote-to-ready job (spec SCH-8, SCH-9, SCH-17, N2, NFR-J1).
 *
 * This is the job that makes Phase 3's scheduler visible: until a stand-up
 * reaches Ready with a snapshot behind it, the module has a ticker and nothing
 * to tick. It runs every sixty seconds, so idempotence is not a nicety — the
 * same stand-up is examined by roughly a thousand runs before it starts.
 */
import mongoose from 'mongoose'

import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import { notificationService } from '@/lib/notification-service'

import { promoteToReady } from '../jobs/promote-to-ready'
import { STANDUP_JOBS } from '../jobs/registry'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, member, otherMember, user } = ids

/** 09:00 Asia/Colombo on 10 August 2026. */
const SCHEDULED_AT = new Date('2026-08-10T03:30:00.000Z')

async function seedProject(settings: Record<string, unknown> = {}, projectId = project) {
  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project: projectId,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: 'Asia/Colombo',
    subscribedHolidaySets: [],
    overrides: []
  })

  await ProjectStandupSettings.create({
    project: projectId,
    organization,
    enabled: true,
    standupLocalTime: '09:00',
    readyLeadMinutes: 15,
    defaultFacilitator: user,
    ...settings
  })
}

async function seedStandup(overrides: Record<string, unknown> = {}) {
  const sprint = await Sprint.create({
    name: 'Sprint 14',
    organization,
    project: (overrides.project as mongoose.Types.ObjectId) ?? project,
    createdBy: user,
    status: 'active',
    startDate: new Date('2026-08-10T00:00:00.000Z'),
    endDate: new Date('2026-08-14T00:00:00.000Z'),
    capacity: 0,
    teamMembers: [member, otherMember]
  })

  return Standup.create({
    project,
    sprint: sprint._id,
    organization,
    standupDate: '2026-08-10',
    scheduledStartAt: SCHEDULED_AT,
    durationMinutes: 15,
    sprintDayNumber: 1,
    totalSprintDays: 5,
    shape: 'day_one',
    status: 'Scheduled',
    facilitator: user,
    expectedAttendees: [member, otherMember],
    ...overrides
  })
}

describe('promote-to-ready', () => {
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

  it('is registered, so the Phase 3 ticker has something to run (OB-1)', () => {
    expect(STANDUP_JOBS['promote-to-ready']).toBe(promoteToReady)
  })

  it('SCH-8: promotes exactly at the lead boundary', async () => {
    await seedProject()
    const standup = await seedStandup()

    const result = await promoteToReady(new Date(SCHEDULED_AT.getTime() - 15 * 60_000))

    expect(result.created).toBe(1)
    expect((await Standup.findById(standup._id))?.status).toBe('Ready')
  })

  it('SCH-8: does not promote a minute early', async () => {
    await seedProject()
    const standup = await seedStandup()

    const result = await promoteToReady(new Date(SCHEDULED_AT.getTime() - 16 * 60_000))

    expect(result.created).toBe(0)
    expect((await Standup.findById(standup._id))?.status).toBe('Scheduled')
  })

  it('honours a project-specific lead time', async () => {
    await seedProject({ readyLeadMinutes: 60 })
    const standup = await seedStandup()

    await promoteToReady(new Date(SCHEDULED_AT.getTime() - 45 * 60_000))

    expect((await Standup.findById(standup._id))?.status).toBe('Ready')
  })

  it('SCH-9: builds and persists the snapshot on the way to Ready', async () => {
    await seedProject()
    const standup = await seedStandup()

    await promoteToReady(SCHEDULED_AT)

    const promoted = await Standup.findById(standup._id)
    expect(promoted?.snapshotBuiltAt).toBeInstanceOf(Date)
    expect((promoted?.snapshot as any)?.members).toHaveLength(2)
  })

  it('N2: notifies the facilitator once, however many times the job runs (SCH-17)', async () => {
    await seedProject()
    await seedStandup()

    await promoteToReady(SCHEDULED_AT)
    await promoteToReady(new Date(SCHEDULED_AT.getTime() + 60_000))

    const n2 = notify.mock.calls.filter(
      (call) => call[2]?.data?.metadata?.notificationId === 'N2'
    )
    expect(n2).toHaveLength(1)
    expect(String(n2[0][0])).toBe(String(user))
  })

  it('NFR-J1: a second run promotes nothing and changes nothing', async () => {
    await seedProject()
    await seedStandup()

    await promoteToReady(SCHEDULED_AT)
    const second = await promoteToReady(SCHEDULED_AT)

    expect(second.created).toBe(0)
    expect(await Standup.countDocuments({ status: 'Ready' })).toBe(1)
  })

  it('leaves a stand-up that is not Scheduled alone', async () => {
    await seedProject()
    await seedStandup({ status: 'Cancelled' })

    const result = await promoteToReady(SCHEDULED_AT)

    expect(result.created).toBe(0)
  })

  it('respects the N2 project switch', async () => {
    await seedProject({ notificationSwitches: { N2: false } })
    await seedStandup()

    await promoteToReady(SCHEDULED_AT)

    expect(notify).not.toHaveBeenCalled()
  })

  it('keeps going when one project fails, and reports it (NFR-16)', async () => {
    await seedProject()
    await seedStandup()

    const otherProjectId = new mongoose.Types.ObjectId()
    const brokenSprint = await Sprint.create({
      name: 'Broken',
      organization,
      project: otherProjectId,
      createdBy: user,
      status: 'active',
      startDate: new Date('2026-08-10T00:00:00.000Z'),
      endDate: new Date('2026-08-14T00:00:00.000Z'),
      capacity: 0,
      teamMembers: [member]
    })
    await Standup.create({
      project: otherProjectId,
      sprint: brokenSprint._id,
      organization,
      standupDate: '2026-08-10',
      scheduledStartAt: SCHEDULED_AT,
      durationMinutes: 15,
      sprintDayNumber: 1,
      totalSprintDays: 5,
      shape: 'day_one',
      status: 'Scheduled',
      facilitator: user,
      expectedAttendees: [member]
    })

    jest
      .spyOn(Standup, 'updateOne')
      .mockImplementationOnce(() => {
        throw new Error('write failed')
      })

    const result = await promoteToReady(SCHEDULED_AT)

    expect(result.errors).toHaveLength(1)
    expect(result.created).toBe(1)
    jest.restoreAllMocks()
  })

  it('scans nothing and reports zero when no stand-up is due', async () => {
    await seedProject()

    const result = await promoteToReady(SCHEDULED_AT)

    expect(result).toMatchObject({ job: 'promote-to-ready', created: 0, errors: [] })
  })
})
