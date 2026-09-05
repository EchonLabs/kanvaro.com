/**
 * PATCH /api/standups/:id/yesterday — real invocation (Task 15, RUN-11, N11).
 *
 * `variance-routes.test.ts` already covers this route's source-inspection
 * contract (permission, RUN-23 version guard, dynamic export). This file adds
 * the layer those checks cannot: actually calling the exported `PATCH` and
 * proving RUN-11's behaviour end to end —
 *
 *   1. a change made `onBehalfOf` another member fires exactly one N11
 *      notification to that member, and
 *   2. a retried, identical PATCH (same task, same resulting status, same
 *      stand-up version — i.e. a client double-submit before the version
 *      advances) does not double-send it.
 *
 * `withStandupIdPermission`'s own dependencies are mocked the way
 * `override-routes.test.ts` and `blocker-routes.test.ts` mock them, but
 * `Standup` and `Task` are left as the *real* models against the in-memory
 * mongo `useMongo()` harness — `notifyStatusChangedOnBehalf` claims its
 * dedup key through `Standup.notificationsSent`, and mocking the model away
 * would make the dedup assertion vacuous.
 */
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { notificationService } from '@/lib/notification-service'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'

import { ids, useMongo } from './helpers/mongo'

const { project, sprint, member, user } = ids

const hasPermission = jest.fn()
const requireProjectAccess = jest.fn()
// Prefixed `mock` so babel-plugin-jest-hoist allows the jest.mock factory
// below (hoisted above this file's imports) to close over it. `recordAudit`
// casts the actor id to a real ObjectId, so this has to be one too.
const mockOrgId = '5f00000000000000000000aa'
const mockUserId = '5f00000000000000000000bb'

jest.mock('@/lib/db-config', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/lib/auth-utils', () => ({
  authenticateUser: jest.fn().mockResolvedValue({
    user: { id: mockUserId, organization: mockOrgId }
  })
}))

jest.mock('@/lib/permissions/permission-service', () => ({
  PermissionService: {
    hasPermission: (...args: unknown[]) => hasPermission(...args),
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...args)
  }
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const yesterdayRoute = require('@/app/api/standups/[id]/yesterday/route')

describe('PATCH /api/standups/:id/yesterday — RUN-11 / N11', () => {
  useMongo()

  let standupId: string
  let taskId: string
  let createNotification: jest.SpyInstance

  beforeEach(async () => {
    hasPermission.mockReset().mockResolvedValue(true)
    requireProjectAccess.mockReset().mockResolvedValue(undefined)

    const standup = await Standup.create({
      project,
      sprint,
      organization: mockOrgId,
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
    standupId = standup._id.toString()

    const task = await Task.create({
      title: 'Wire the thing up',
      organization: mockOrgId,
      project,
      sprint,
      createdBy: user,
      taskNumber: 1,
      displayId: 'KAN-1',
      status: 'in_progress',
      assignedTo: [{ user: member }]
    })
    taskId = task._id.toString()

    createNotification = jest
      .spyOn(notificationService, 'createNotification')
      .mockResolvedValue({ _id: new mongoose.Types.ObjectId() } as never)
  })

  afterEach(() => {
    createNotification.mockRestore()
  })

  const buildRequest = (body: unknown, version = 0) =>
    new NextRequest(`http://localhost/api/standups/${standupId}/yesterday`, {
      method: 'PATCH',
      headers: { 'x-standup-version': String(version) },
      body: JSON.stringify(body)
    })

  it('fires exactly one N11 notification to the member the change was made for', async () => {
    const response = await yesterdayRoute.PATCH(
      buildRequest({ taskIds: [taskId], status: 'done', onBehalfOf: member.toString() }),
      { params: { id: standupId } }
    )

    expect(response.status).toBe(200)
    expect(createNotification).toHaveBeenCalledTimes(1)

    const [recipientId, , payload] = createNotification.mock.calls[0]
    expect(String(recipientId)).toBe(member.toString())
    expect(payload.data.metadata.notificationId).toBe(`N11:${standupId}:${taskId}:done`)

    const stored = (await Standup.findById(standupId).lean()) as any
    expect(stored.notificationsSent?.[`N11:${standupId}:${taskId}:done:${member.toString()}`]).toBeInstanceOf(
      Date
    )
  })

  it('does not send N11 when the actor changes their own task (no onBehalfOf)', async () => {
    const response = await yesterdayRoute.PATCH(
      buildRequest({ taskIds: [taskId], status: 'done' }),
      { params: { id: standupId } }
    )

    expect(response.status).toBe(200)
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('a retried, identical PATCH does not double-send N11', async () => {
    // RUN-23's version guard already refuses a *sequential* retry sent after the
    // first one committed (the version has moved on, so the second answers
    // STALE_STANDUP before reaching the notification at all) — that path isn't
    // the one N11's dedup key exists for. What it exists for is the case the
    // version guard cannot catch: a client that fires the same request twice
    // *before* either has committed (a duplicated network request racing
    // itself), so both read the same starting version and both pass the guard.
    // Firing the two PATCHes concurrently here reproduces exactly that race.
    const request = () =>
      buildRequest({ taskIds: [taskId], status: 'done', onBehalfOf: member.toString() })

    const [first, second] = await Promise.all([
      yesterdayRoute.PATCH(request(), { params: { id: standupId } }),
      yesterdayRoute.PATCH(request(), { params: { id: standupId } })
    ])

    // Both requests are for the identical change, so both may succeed (the
    // task-status write itself is idempotent) — what must not happen is a
    // second N11 for the second one.
    expect([first.status, second.status]).toEqual([200, 200])
    expect(createNotification).toHaveBeenCalledTimes(1)
  })

  it('sends a distinct N11 for a genuinely different status change on the same task', async () => {
    await yesterdayRoute.PATCH(
      buildRequest({ taskIds: [taskId], status: 'in_progress', onBehalfOf: member.toString() }, 0),
      { params: { id: standupId } }
    )

    await yesterdayRoute.PATCH(
      buildRequest({ taskIds: [taskId], status: 'done', onBehalfOf: member.toString() }, 1),
      { params: { id: standupId } }
    )

    expect(createNotification).toHaveBeenCalledTimes(2)
  })
})
