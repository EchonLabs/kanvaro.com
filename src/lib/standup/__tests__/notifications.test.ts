/**
 * N4/N5/N6/N7/N11 send functions (spec §9.5, RUN-11), Phase 10 Task 15.
 *
 * These all funnel through `sendStandupNotificationOnce` (`jobs/notify.ts`),
 * the same send-once primitive Phase 9's N9 and this phase's N12 use — so the
 * dedup/switch-check behaviour is inherited, not reimplemented. What is worth
 * testing here is that each function claims the *right* ledger key: N4-N7
 * must not resend for the same stand-up/recipient, while N11 must be able to
 * fire more than once per stand-up (several tasks changed on one person's
 * behalf) yet still refuse to double-send a retried, identical change.
 */
import { Standup } from '@/models/Standup'
import { notificationService } from '@/lib/notification-service'

import {
  notifyNotAllocated,
  notifyOverrideIssued,
  notifyPersonalCommitment,
  notifyStandupCompleted,
  notifyStatusChangedOnBehalf
} from '../notifications'
import { ids, useMongo } from './helpers/mongo'

const { organization, project, sprint, member, otherMember, user } = ids

let createNotification: jest.SpyInstance

beforeEach(() => {
  createNotification = jest
    .spyOn(notificationService, 'createNotification')
    .mockResolvedValue({ _id: 'notification' } as any)
})

afterEach(() => {
  createNotification.mockRestore()
})

async function seedStandup() {
  const standup = await Standup.create({
    project,
    sprint,
    organization,
    standupDate: '2026-08-18',
    scheduledStartAt: new Date('2026-08-18T03:30:00.000Z'),
    durationMinutes: 15,
    sprintDayNumber: 2,
    totalSprintDays: 5,
    shape: 'mid_sprint',
    status: 'In_Progress',
    facilitator: user,
    expectedAttendees: [member],
    version: 0
  })
  return standup._id.toString()
}

describe('N4 notifyPersonalCommitment', () => {
  useMongo()

  it('sends once, tagged N4', async () => {
    const standupId = await seedStandup()

    const sent = await notifyPersonalCommitment({
      standupId,
      projectId: project.toString(),
      organizationId: organization.toString(),
      memberId: member.toString(),
      summaryUrl: `/standups/${standupId}/summary`
    })

    expect(sent).toBe(1)
    expect(createNotification).toHaveBeenCalledTimes(1)
    const [, , payload] = createNotification.mock.calls[0]
    expect(payload.data.metadata.notificationId).toBe('N4')
  })

  it('does not resend to the same member on the same stand-up', async () => {
    const standupId = await seedStandup()
    const input = {
      standupId,
      projectId: project.toString(),
      organizationId: organization.toString(),
      memberId: member.toString(),
      summaryUrl: `/standups/${standupId}/summary`
    }

    await notifyPersonalCommitment(input)
    const second = await notifyPersonalCommitment(input)

    expect(second).toBe(0)
    expect(createNotification).toHaveBeenCalledTimes(1)
  })
})

describe('N5 notifyStandupCompleted', () => {
  useMongo()

  it('sends one per recipient, tagged N5', async () => {
    const standupId = await seedStandup()

    const sent = await notifyStandupCompleted({
      standupId,
      projectId: project.toString(),
      organizationId: organization.toString(),
      recipientIds: [user.toString(), otherMember.toString()],
      summaryUrl: `/standups/${standupId}/summary`
    })

    expect(sent).toBe(2)
    expect(createNotification.mock.calls[0][2].data.metadata.notificationId).toBe('N5')
  })

  it('does not resend on a second call with the same recipients', async () => {
    const standupId = await seedStandup()
    const input = {
      standupId,
      projectId: project.toString(),
      organizationId: organization.toString(),
      recipientIds: [user.toString()],
      summaryUrl: `/standups/${standupId}/summary`
    }

    await notifyStandupCompleted(input)
    const second = await notifyStandupCompleted(input)

    expect(second).toBe(0)
    expect(createNotification).toHaveBeenCalledTimes(1)
  })
})

describe('N6 notifyNotAllocated', () => {
  useMongo()

  it('sends once, tagged N6', async () => {
    const standupId = await seedStandup()

    const sent = await notifyNotAllocated({
      standupId,
      projectId: project.toString(),
      organizationId: organization.toString(),
      memberId: member.toString()
    })

    expect(sent).toBe(1)
    expect(createNotification.mock.calls[0][2].data.metadata.notificationId).toBe('N6')
  })

  it('does not resend to the same member on the same stand-up', async () => {
    const standupId = await seedStandup()
    const input = {
      standupId,
      projectId: project.toString(),
      organizationId: organization.toString(),
      memberId: member.toString()
    }

    await notifyNotAllocated(input)
    const second = await notifyNotAllocated(input)

    expect(second).toBe(0)
    expect(createNotification).toHaveBeenCalledTimes(1)
  })
})

describe('N7 notifyOverrideIssued', () => {
  useMongo()

  it('sends once per recipient, tagged N7', async () => {
    const standupId = await seedStandup()

    const sent = await notifyOverrideIssued({
      standupId,
      projectId: project.toString(),
      organizationId: organization.toString(),
      recipientIds: [user.toString()],
      overrideType: 'under_allocation',
      overrideId: 'override-1'
    })

    expect(sent).toBe(1)
    const payload = createNotification.mock.calls[0][2]
    expect(payload.data.metadata.notificationId).toBe('N7:override-1')
    expect(payload.message).toContain('under_allocation')
  })

  it('does not resend the same override to the same recipient', async () => {
    const standupId = await seedStandup()
    const input = {
      standupId,
      projectId: project.toString(),
      organizationId: organization.toString(),
      recipientIds: [user.toString()],
      overrideType: 'under_allocation',
      overrideId: 'override-1'
    }

    await notifyOverrideIssued(input)
    const second = await notifyOverrideIssued(input)

    expect(second).toBe(0)
    expect(createNotification).toHaveBeenCalledTimes(1)
  })

  it('sends a fresh notification for a distinct override on the same stand-up', async () => {
    const standupId = await seedStandup()
    const base = {
      standupId,
      projectId: project.toString(),
      organizationId: organization.toString(),
      recipientIds: [user.toString()],
      overrideType: 'under_allocation'
    }

    await notifyOverrideIssued({ ...base, overrideId: 'override-1' })
    const sent = await notifyOverrideIssued({ ...base, overrideId: 'override-2' })

    expect(sent).toBe(1)
    expect(createNotification).toHaveBeenCalledTimes(2)
  })
})

describe('N11 notifyStatusChangedOnBehalf', () => {
  useMongo()

  it('sends once, tagged N11, to the assignee', async () => {
    const standupId = await seedStandup()

    const sent = await notifyStatusChangedOnBehalf({
      standupId,
      projectId: project.toString(),
      organizationId: organization.toString(),
      assigneeId: member.toString(),
      taskId: 'task-1',
      newStatus: 'done',
      taskKey: 'KAN-1'
    })

    expect(sent).toBe(1)
    const [recipientId, , payload] = createNotification.mock.calls[0]
    expect(String(recipientId)).toBe(member.toString())
    expect(payload.data.metadata.notificationId).toBe(`N11:${standupId}:task-1:done`)
  })

  it('a retried, identical PATCH (same task, same resulting status) does not double-send', async () => {
    const standupId = await seedStandup()
    const input = {
      standupId,
      projectId: project.toString(),
      organizationId: organization.toString(),
      assigneeId: member.toString(),
      taskId: 'task-1',
      newStatus: 'done',
      taskKey: 'KAN-1'
    }

    await notifyStatusChangedOnBehalf(input)
    const second = await notifyStatusChangedOnBehalf(input)

    expect(second).toBe(0)
    expect(createNotification).toHaveBeenCalledTimes(1)
  })

  it('a different task changed on behalf of the same assignee sends its own notification', async () => {
    const standupId = await seedStandup()
    const base = {
      standupId,
      projectId: project.toString(),
      organizationId: organization.toString(),
      assigneeId: member.toString(),
      newStatus: 'done'
    }

    await notifyStatusChangedOnBehalf({ ...base, taskId: 'task-1', taskKey: 'KAN-1' })
    const sent = await notifyStatusChangedOnBehalf({ ...base, taskId: 'task-2', taskKey: 'KAN-2' })

    expect(sent).toBe(1)
    expect(createNotification).toHaveBeenCalledTimes(2)
  })

  it('a genuinely different status change on the same task each gets its own notification', async () => {
    const standupId = await seedStandup()
    const base = {
      standupId,
      projectId: project.toString(),
      organizationId: organization.toString(),
      assigneeId: member.toString(),
      taskId: 'task-1',
      taskKey: 'KAN-1'
    }

    await notifyStatusChangedOnBehalf({ ...base, newStatus: 'in_progress' })
    const sent = await notifyStatusChangedOnBehalf({ ...base, newStatus: 'done' })

    expect(sent).toBe(1)
    expect(createNotification).toHaveBeenCalledTimes(2)
  })
})
