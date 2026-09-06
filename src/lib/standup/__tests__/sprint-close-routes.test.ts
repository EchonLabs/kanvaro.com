import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { ids, useMongo } from './helpers/mongo'

const hasPermission = jest.fn()
const requireProjectAccess = jest.fn()

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
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...args)
  }
}))

let mockUserId: mongoose.Types.ObjectId
let mockOrgId: mongoose.Types.ObjectId

import * as readinessRoute from '@/app/api/standups/[id]/sprint-close/route'
import * as dispositionRoute from '@/app/api/standups/[id]/sprint-close/tasks/[taskId]/route'

const { organization, project, sprint, member: pm } = ids

beforeAll(() => {
  mockUserId = pm
  mockOrgId = organization
})

beforeEach(() => {
  hasPermission.mockReset().mockResolvedValue(true)
  requireProjectAccess.mockReset().mockResolvedValue(undefined)
})

async function seed() {
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
    defaultFacilitator: pm
  })

  const standup = await Standup.create({
    project,
    sprint,
    organization,
    standupDate: '2026-09-05',
    scheduledStartAt: new Date('2026-09-05T03:30:00.000Z'),
    durationMinutes: 15,
    sprintDayNumber: 5,
    totalSprintDays: 5,
    shape: 'final_day',
    status: 'In_Progress',
    facilitator: pm,
    expectedAttendees: [pm]
  })

  const openTask = await Task.create({
    title: 'Open task',
    description: '',
    status: 'in_progress',
    priority: 'medium',
    type: 'task',
    organization,
    project,
    sprint,
    taskNumber: 1,
    displayId: 'KAN-1',
    createdBy: pm,
    remainingEstimateMinutes: 120,
    labels: [],
    dependencies: [],
    attachments: []
  })

  return { standup, openTask }
}

const buildGet = (url: string) => new NextRequest(`http://localhost${url}`, { method: 'GET' })
const buildPatch = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

describe('GET /api/standups/:id/sprint-close', () => {
  useMongo()

  it('exposes the handler and opts out of static rendering', () => {
    expect(typeof readinessRoute.GET).toBe('function')
    expect(readinessRoute.dynamic).toBe('force-dynamic')
  })

  it('returns openTasks and taskFailures for a viewer with standup:view', async () => {
    const { standup, openTask } = await seed()

    const response = await readinessRoute.GET(
      buildGet(`/api/standups/${standup._id}/sprint-close`),
      { params: { id: String(standup._id) } }
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data.openTasks.map((t: any) => t.taskId)).toContain(String(openTask._id))
    expect(payload.data.taskFailures).toBe(1)
  })

  it('returns 403 when the caller lacks standup:view', async () => {
    const { standup } = await seed()
    hasPermission.mockResolvedValue(false)

    const response = await readinessRoute.GET(
      buildGet(`/api/standups/${standup._id}/sprint-close`),
      { params: { id: String(standup._id) } }
    )

    expect(response.status).toBe(403)
  })
})

describe('PATCH /api/standups/:id/sprint-close/tasks/:taskId', () => {
  useMongo()

  it('sets the disposition and the next GET reflects it', async () => {
    const { standup, openTask } = await seed()

    const patchResponse = await dispositionRoute.PATCH(
      buildPatch(`/api/standups/${standup._id}/sprint-close/tasks/${openTask._id}`, {
        type: 'descope'
      }),
      { params: { id: String(standup._id), taskId: String(openTask._id) } }
    )
    expect(patchResponse.status).toBe(200)

    const getResponse = await readinessRoute.GET(
      buildGet(`/api/standups/${standup._id}/sprint-close`),
      { params: { id: String(standup._id) } }
    )
    const payload = await getResponse.json()
    const row = payload.data.openTasks.find((t: any) => t.taskId === String(openTask._id))

    expect(row.disposition).toBe('descope')
    expect(payload.data.taskFailures).toBe(0)
  })

  it('returns 403 when the caller lacks standup:allocate', async () => {
    const { standup, openTask } = await seed()
    hasPermission.mockResolvedValue(false)

    const response = await dispositionRoute.PATCH(
      buildPatch(`/api/standups/${standup._id}/sprint-close/tasks/${openTask._id}`, {
        type: 'descope'
      }),
      { params: { id: String(standup._id), taskId: String(openTask._id) } }
    )

    expect(response.status).toBe(403)
  })
})
