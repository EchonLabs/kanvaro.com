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
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { notificationService } from '@/lib/notification-service'

import {
  notifyNotAllocated,
  notifyOverrideIssued,
  notifyPersonalCommitment,
  notifyStandupCompleted,
  notifyStatusChangedOnBehalf,
  type StandupNotificationId
} from '../notifications'
import { sendStandupNotificationOnce } from '../jobs/notify'
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

/**
 * Task 20 (Phase 10 degradation audit), step 1.
 *
 * N4/N5/N6/N7/N11 (this phase, Task 15), N9 (`jobs/escalate-carry-forward.ts`,
 * Phase 9) and the sprint-health N12 (`jobs/sprint-health.ts`, Task 13) all
 * fire through this one choke point — `sendStandupNotificationOnce` calling
 * `isNotificationEnabled(input.projectId, input.notificationId)` before it
 * ever claims the ledger or calls `createNotification`. The individual send
 * functions' own suites (above, and `jobs.sprint-health.test.ts`,
 * `jobs.escalate-carry-forward.test.ts`) test dedup and payload shape but
 * never a disabled switch — this closes that gap once, generically, for
 * every id that funnels through the shared primitive, rather than
 * reimplementing the same project-settings fixture seven times per send
 * function.
 *
 * (There is a second, unrelated notification that also tags its metadata
 * `notificationId: 'N12'` — `debt-service.ts`'s debt write-off notice
 * (VAR-8/E44), predating this phase. It sends via
 * `notificationService.createNotification` directly, not through this
 * primitive, so it is not gated by the project switch at all and is outside
 * this test's (and this phase's) scope — see the Task 20 report.)
 */
describe('Task 20 / step 1 — the project switch suppresses every id sent through sendStandupNotificationOnce', () => {
  useMongo()

  const phaseTenIds: StandupNotificationId[] = ['N4', 'N5', 'N6', 'N7', 'N9', 'N11', 'N12']

  it.each(phaseTenIds)('suppresses %s when the project has switched it off', async (notificationId) => {
    const standupId = await seedStandup()
    await ProjectStandupSettings.create({
      project,
      organization,
      notificationSwitches: { [notificationId]: false }
    })

    const sent = await sendStandupNotificationOnce({
      standupId,
      projectId: project.toString(),
      organizationId: organization.toString(),
      notificationId,
      recipientIds: [user.toString()],
      title: 'Test notification',
      message: 'This should not be sent.'
    })

    expect(sent).toBe(0)
    expect(createNotification).not.toHaveBeenCalled()

    // And nothing claimed the ledger either — a later re-enable must still be
    // able to send, not find the key already taken by the suppressed attempt.
    const standup = await Standup.findById(standupId).lean()
    expect(standup!.notificationsSent?.[notificationId]).toBeUndefined()
  })

  it.each(phaseTenIds)('sends %s when the project switch is on (default, unconfigured project)', async (notificationId) => {
    const standupId = await seedStandup()
    // Deliberately no ProjectStandupSettings document — `isNotificationEnabled`
    // must default every id but N3 to enabled.

    const sent = await sendStandupNotificationOnce({
      standupId,
      projectId: project.toString(),
      organizationId: organization.toString(),
      notificationId,
      recipientIds: [user.toString()],
      title: 'Test notification',
      message: 'This should be sent.'
    })

    expect(sent).toBe(1)
    expect(createNotification).toHaveBeenCalledTimes(1)
  })
})
