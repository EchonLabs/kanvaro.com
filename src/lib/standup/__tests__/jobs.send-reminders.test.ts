/**
 * The pre-stand-up reminder job (spec N1, SCH-16, SCH-17).
 *
 * N1 is the notification that makes the stand-up itself short: it asks every
 * attendee to update their tasks an hour before the meeting, so the PM is not
 * transcribing status live. Sending it twice trains people to ignore it.
 */
import mongoose from 'mongoose'

import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import { notificationService } from '@/lib/notification-service'

import { STANDUP_JOBS } from '../jobs/registry'
import { sendReminders } from '../jobs/send-reminders'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, member, otherMember, user } = ids

/** 09:00 Asia/Colombo on 10 August 2026. */
const SCHEDULED_AT = new Date('2026-08-10T03:30:00.000Z')

async function seedProject(settings: Record<string, unknown> = {}) {
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
    reminderLeadMinutes: 60,
    defaultFacilitator: user,
    ...settings
  })
}

async function seedStandup(overrides: Record<string, unknown> = {}) {
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

describe('send-reminders', () => {
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

  it('is registered against the ticker (OB-1)', () => {
    expect(STANDUP_JOBS['send-reminders']).toBe(sendReminders)
  })

  it('N1: reminds every expected attendee at the configured lead', async () => {
    await seedProject()
    await seedStandup()

    const result = await sendReminders(new Date(SCHEDULED_AT.getTime() - 60 * 60_000))

    expect(result.created).toBe(2)
    expect(notify.mock.calls.map((call) => String(call[0])).sort()).toEqual(
      [String(member), String(otherMember)].sort()
    )
  })

  it('N1: points the reminder at My Stand-up, not the PM run screen', async () => {
    await seedProject()
    const standup = await seedStandup()

    await sendReminders(new Date(SCHEDULED_AT.getTime() - 60 * 60_000))

    expect(notify.mock.calls[0][2].data.url).toBe(`/my/standup/${String(standup._id)}`)
  })

  it('does not remind before the lead', async () => {
    await seedProject()
    await seedStandup()

    const result = await sendReminders(new Date(SCHEDULED_AT.getTime() - 61 * 60_000))

    expect(result.created).toBe(0)
    expect(notify).not.toHaveBeenCalled()
  })

  it('SCH-17: a second run reminds nobody twice', async () => {
    await seedProject()
    await seedStandup()

    await sendReminders(new Date(SCHEDULED_AT.getTime() - 60 * 60_000))
    const second = await sendReminders(new Date(SCHEDULED_AT.getTime() - 59 * 60_000))

    expect(second.created).toBe(0)
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it('a lead of zero disables the reminder entirely', async () => {
    await seedProject({ reminderLeadMinutes: 0 })
    await seedStandup()

    const result = await sendReminders(SCHEDULED_AT)

    expect(result.created).toBe(0)
    expect(notify).not.toHaveBeenCalled()
  })

  it('respects the N1 project switch (SCH-16)', async () => {
    await seedProject({ notificationSwitches: { N1: false } })
    await seedStandup()

    await sendReminders(new Date(SCHEDULED_AT.getTime() - 60 * 60_000))

    expect(notify).not.toHaveBeenCalled()
  })

  it('reminds for a Ready stand-up too, not only a Scheduled one', async () => {
    await seedProject({ reminderLeadMinutes: 10 })
    await seedStandup({ status: 'Ready' })

    const result = await sendReminders(new Date(SCHEDULED_AT.getTime() - 5 * 60_000))

    expect(result.created).toBe(2)
  })

  it('never reminds about a stand-up that will not run', async () => {
    await seedProject()
    await seedStandup({ status: 'Skipped_Holiday' })

    const result = await sendReminders(new Date(SCHEDULED_AT.getTime() - 60 * 60_000))

    expect(result.created).toBe(0)
  })
})
