/**
 * PATCH /api/standups/:id/attendance — real invocation.
 *
 * `attendance-service.integration.test.ts` covers `setAttendance` itself,
 * including RUN-6's four states and the refusal of anything else. This file
 * covers the one validation the service never sees, because the route performs
 * it first: `partialMinutes` arrives as JSON of any shape and the route reaches
 * for `minutes(Number(...))` on the way in.
 *
 * `Number('abc')` is `NaN`, and `minutes()` throws `RangeError` on a non-finite
 * value — so a typo in the hours field answered 500 `INTERNAL_ERROR` instead of
 * naming the bad field. Nothing was written (the throw happens before the
 * service runs, so there is no half-committed row to clean up), but a 500 tells
 * the client to retry something that will never succeed, and tells the operator
 * to go looking for a server fault that does not exist.
 *
 * Mocked the way `yesterday-route.test.ts` mocks this wrapper's dependencies;
 * `Standup` and the capacity collaborators stay real against `useMongo()`,
 * because the positive control below has to actually compute a capacity for the
 * 422 assertions to mean anything.
 */
import { NextRequest } from 'next/server'

import { MemberCapacity } from '@/models/MemberCapacity'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { ids, useMongo } from './helpers/mongo'

const { project, sprint, member, user } = ids

const hasPermission = jest.fn()
const requireProjectAccess = jest.fn()
const mockOrgId = '5f00000000000000000000aa'
const mockUserId = '5f00000000000000000000bb'

const TIMEZONE = 'Asia/Colombo'
const DAY = '2026-08-17'

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
const attendanceRoute = require('@/app/api/standups/[id]/attendance/route')

describe('PATCH /api/standups/:id/attendance — partialMinutes validation', () => {
  useMongo()

  let standupId: string

  beforeEach(async () => {
    hasPermission.mockReset().mockResolvedValue(true)
    requireProjectAccess.mockReset().mockResolvedValue(undefined)

    await WorkingCalendar.create({
      scope: 'project',
      organization: mockOrgId,
      project,
      workingDaysOfWeek: [1, 2, 3, 4, 5],
      standardMinutesPerDay: 480,
      timezone: TIMEZONE,
      subscribedHolidaySets: [],
      overrides: []
    })

    await ProjectStandupSettings.create({
      project,
      organization: mockOrgId,
      enabled: true,
      standupLocalTime: '09:00',
      durationMinutes: 15,
      defaultFacilitator: user
    })

    await MemberCapacity.create({
      project,
      member,
      dailyCapacityMinutes: 480,
      effectiveFrom: '2026-01-01',
      isActive: true
    })

    await Sprint.create({
      _id: sprint,
      name: 'Sprint 21',
      organization: mockOrgId,
      project,
      createdBy: user,
      status: 'active',
      startDate: new Date('2026-08-17T00:00:00.000Z'),
      endDate: new Date('2026-08-21T00:00:00.000Z'),
      capacity: 0,
      teamMembers: [member]
    })

    const standup = await Standup.create({
      project,
      sprint,
      organization: mockOrgId,
      standupDate: DAY,
      scheduledStartAt: new Date('2026-08-17T03:30:00.000Z'),
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
  })

  const buildRequest = (body: unknown, version = 0) =>
    new NextRequest(`http://localhost/api/standups/${standupId}/attendance`, {
      method: 'PATCH',
      headers: { 'x-standup-version': String(version) },
      body: JSON.stringify(body)
    })

  const patch = (body: unknown, version = 0) =>
    attendanceRoute.PATCH(buildRequest(body, version), { params: { id: standupId } })

  /**
   * The positive control. Without it, a 422 below could just as easily mean the
   * seed is wrong and every request fails.
   */
  it('accepts a well-formed partial day', async () => {
    const response = await patch({
      memberId: member.toString(),
      state: 'partial',
      partialMinutes: 240
    })

    expect(response.status).toBe(200)
  })

  it('names the bad field when partialMinutes is not a number', async () => {
    const response = await patch({
      memberId: member.toString(),
      state: 'partial',
      partialMinutes: 'abc'
    })

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_FAILED')
  })

  it('leaves the stand-up untouched when partialMinutes is not a number', async () => {
    await patch({ memberId: member.toString(), state: 'partial', partialMinutes: 'abc' })

    const stored = (await Standup.findById(standupId).lean()) as any
    expect(stored.attendance).toEqual([])
    expect(stored.version).toBe(0)
  })
})
