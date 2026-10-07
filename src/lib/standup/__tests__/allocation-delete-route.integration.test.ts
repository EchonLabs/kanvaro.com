/**
 * `DELETE /api/standups/:id/allocations/:allocationId` — the run screen's ✕.
 *
 * The service test proves `removeAllocation` deletes a row; this drives the
 * real route handler end to end (auth and permissions mocked, everything else
 * real), the way the browser's `fetch` does — including a row that has been
 * carried forward, which is the state most rows are in by day four.
 */
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { Allocation } from '@/models/Allocation'
import { MemberCapacity } from '@/models/MemberCapacity'
import { Project } from '@/models/Project'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import * as rowRoute from '@/app/api/standups/[id]/allocations/[allocationId]/route'
import * as boardRoute from '@/app/api/standups/[id]/allocations/route'
import { STANDUP_VERSION_HEADER } from '@/lib/standup/version-header'

import { ids, syncIndexes, useMongo } from './helpers/mongo'

const hasPermission = jest.fn()

jest.mock('@/lib/db-config', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/lib/auth-utils', () => ({
  authenticateUser: jest.fn(async () => ({
    user: { id: String(mockUserId), organization: String(mockOrgId) }
  }))
}))

jest.mock('@/lib/permissions/permission-service', () => ({
  PermissionService: {
    hasPermission: (...args: unknown[]) => hasPermission(...args),
    requireProjectAccess: jest.fn().mockResolvedValue(undefined)
  }
}))

let mockUserId: mongoose.Types.ObjectId
let mockOrgId: mongoose.Types.ObjectId

const { organization, project, sprint, member, otherMember, user } = ids

const TIMEZONE = 'Asia/Colombo'
/** A Monday. */
const DAY = '2026-08-17'

/**
 * An eight-hour day less the stand-up's own fifteen minutes (DN-1/DN-3).
 *
 * Spelled out rather than assumed: these suites assert exact minute counts, and
 * the ceremony deduction is part of what the board actually shows. A fixture
 * that switched it off would let a regression in the shared capacity context
 * pass unnoticed here.
 */
const EFFECTIVE = 465

const actor = { userId: String(user) }

let standupId: string
let taskId: string

async function seed({
  status = 'In_Progress',
  dailyCapacityMinutes = 480
}: { status?: string; dailyCapacityMinutes?: number } = {}) {
  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: TIMEZONE,
    subscribedHolidaySets: [],
    overrides: []
  })

  await ProjectStandupSettings.create({
    project,
    organization,
    enabled: true,
    standupLocalTime: '09:00',
    durationMinutes: 15,
    defaultFacilitator: user
  })

  for (const who of [member, otherMember]) {
    await MemberCapacity.create({
      project,
      member: who,
      dailyCapacityMinutes,
      effectiveFrom: '2026-01-01',
      isActive: true
    })
  }

  await Project.create({
    _id: project,
    name: 'Invoicing Revamp',
    organization,
    createdBy: user,
    projectNumber: 1,
    startDate: new Date('2026-01-01T00:00:00.000Z')
  })

  await Sprint.create({
    _id: sprint,
    name: 'Sprint 21',
    organization,
    project,
    createdBy: user,
    status: 'active',
    startDate: new Date('2026-08-17T00:00:00.000Z'),
    endDate: new Date('2026-08-21T00:00:00.000Z'),
    capacity: 0,
    teamMembers: [member, otherMember]
  })

  const standup = await Standup.create({
    project,
    sprint,
    organization,
    standupDate: DAY,
    scheduledStartAt: new Date('2026-08-17T03:30:00.000Z'),
    durationMinutes: 15,
    sprintDayNumber: 1,
    totalSprintDays: 5,
    shape: 'day_one',
    status,
    facilitator: user,
    expectedAttendees: [member, otherMember],
    version: 3
  })
  standupId = String(standup._id)

  const task = await Task.create({
    title: 'Invoice model',
    organization,
    project,
    sprint,
    createdBy: user,
    taskNumber: 214,
    displayId: 'KAN-214',
    status: 'in_progress',
    remainingEstimateMinutes: 420,
    originalEstimateMinutes: 420
  })
  taskId = String(task._id)

  return { standup, task }
}


const del = (allocationId: string, version: number) =>
  rowRoute.DELETE(
    new NextRequest(`http://localhost/api/standups/${standupId}/allocations/${allocationId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        [STANDUP_VERSION_HEADER]: String(version)
      }
    }),
    { params: { id: standupId, allocationId } }
  )

beforeAll(() => {
  mockUserId = user
  mockOrgId = organization
})

beforeEach(() => {
  hasPermission.mockReset().mockResolvedValue(true)
})

describe('DELETE /api/standups/:id/allocations/:allocationId', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Allocation)
    await seed()
  })

  const board = async () => {
    const response = await boardRoute.GET(
      new NextRequest(`http://localhost/api/standups/${standupId}/allocations`),
      { params: { id: standupId } }
    )
    return (await response.json()).data
  }

  it.each(['assigned_in_standup', 'carried_forward'])(
    'removes a %s row the board itself listed, using the version the board reported',
    async (source) => {
      const row = await Allocation.create({
        standup: standupId,
        sprint,
        project,
        organization,
        member,
        task: taskId,
        plannedMinutes: 240,
        source,
        createdBy: user
      })

      const before = await board()
      const listed = before.members
        .flatMap((m: any) => m.allocations)
        .find((a: any) => a.taskId === taskId)
      expect(listed.allocationId).toBe(String(row._id))

      const response = await del(listed.allocationId, before.standupVersion)
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(typeof payload.data.standupVersion).toBe('number')
      expect(await Allocation.countDocuments({ _id: row._id })).toBe(0)

      const after = await board()
      expect(after.members.flatMap((m: any) => m.allocations)).toHaveLength(0)
      expect(after.standupVersion).toBe(payload.data.standupVersion)
    }
  )
})
