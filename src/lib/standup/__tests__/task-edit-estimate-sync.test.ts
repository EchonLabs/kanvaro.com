/**
 * Editing a task's hours must change the estimate planning reads.
 *
 * The planning checklist's Fix (PA-3, "task larger than a day") leads to the
 * Edit Task form, whose only estimate control is "Estimated Hours". That field
 * is a mirror of `originalEstimateMinutes`, and `PUT /api/tasks/:id` used to
 * write the mirror alone — so the PM lowered the hours, saved, and the
 * checklist went on reporting the task as oversized.
 *
 * Exercises the real handler against the in-memory database, mocking only the
 * auth/permission layer.
 */
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { Project } from '@/models/Project'
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'
import { User } from '@/models/User'

import { ids, useMongo } from './helpers/mongo'

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
    hasPermission: jest.fn().mockResolvedValue(true),
    getAccessibleProjects: jest.fn().mockResolvedValue([])
  }
}))

let mockUserId: mongoose.Types.ObjectId
let mockOrgId: mongoose.Types.ObjectId

import { PUT } from '@/app/api/tasks/[id]/route'
import { evaluateSprintChecklist } from '@/lib/standup/planning-service'

const { organization, project, user } = ids

let taskId: mongoose.Types.ObjectId

async function seed(overrides: Record<string, unknown> = {}) {
  await User.create({
    _id: user,
    firstName: 'Pat',
    lastName: 'Manager',
    email: 'pat.manager@example.test',
    password: 'hashed',
    role: 'admin',
    organization
  })

  await Project.create({
    _id: project,
    name: 'Kanvaro Redesign',
    organization,
    createdBy: user,
    projectNumber: 1,
    startDate: new Date('2026-08-01T00:00:00.000Z')
  })

  const sprint = await Sprint.create({
    name: 'Sprint 32',
    organization,
    project,
    createdBy: user,
    status: 'planning',
    startDate: new Date('2026-08-24T00:00:00.000Z'),
    endDate: new Date('2026-08-28T00:00:00.000Z'),
    capacity: 0
  })

  const task = await Task.create({
    title: 'Rebuild the export pipeline',
    organization,
    project,
    sprint: sprint._id,
    createdBy: user,
    taskNumber: 902,
    displayId: 'KAN-902',
    status: 'todo',
    originalEstimateMinutes: 13 * 60,
    remainingEstimateMinutes: 13 * 60,
    estimateUnit: 'story_points',
    estimateValue: 13,
    estimateMethod: 'poker',
    ...overrides
  })
  taskId = task._id as mongoose.Types.ObjectId
}

function save(body: Record<string, unknown>) {
  const request = new NextRequest(`http://localhost/api/tasks/${String(taskId)}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  })
  return PUT(request, { params: { id: String(taskId) } })
}

describe('PUT /api/tasks/:id — Estimated Hours', () => {
  useMongo()

  beforeAll(() => {
    mockUserId = user
    mockOrgId = organization
  })

  it('makes a changed value the planning estimate, as a manual estimate in hours', async () => {
    await seed()

    const response = await save({ title: 'Rebuild the export pipeline', estimatedHours: 6 })
    expect(response.status).toBe(200)

    const task = await Task.findById(taskId).lean()
    expect(task).toMatchObject({
      estimatedHours: 6,
      originalEstimateMinutes: 360,
      remainingEstimateMinutes: 360,
      estimateUnit: 'hours',
      estimateValue: 6,
      estimateMethod: 'manual'
    })
  })

  it('leaves the estimate alone when the form resends the hours unchanged', async () => {
    await seed()

    // The form always sends `estimatedHours`, even when only the title moved.
    await save({ title: 'Renamed', estimatedHours: 13 })

    const task = await Task.findById(taskId).lean()
    expect(task).toMatchObject({
      title: 'Renamed',
      originalEstimateMinutes: 13 * 60,
      estimateMethod: 'poker',
      estimateUnit: 'story_points'
    })
  })

  it('clears the "larger than a day" advisory once the hours are lowered (PA-3)', async () => {
    await seed()
    await Sprint.updateMany({}, { $set: { teamMembers: [user] } })
    const sprintId = String((await Task.findById(taskId).lean() as any).sprint)

    const before = await evaluateSprintChecklist(sprintId)
    expect(before.checklist.items.find((item) => item.checkId === 'PA-3')).toMatchObject({
      passed: false,
      offendingIds: [String(taskId)]
    })

    await save({ title: 'Rebuild the export pipeline', estimatedHours: 6 })

    const after = await evaluateSprintChecklist(sprintId)
    expect(after.checklist.items.find((item) => item.checkId === 'PA-3')?.passed).toBe(true)
  })

  it('never rewrites a frozen original (DAT-6)', async () => {
    await seed({ estimateLockedAt: new Date('2026-08-24T00:00:00.000Z') })

    const response = await save({ title: 'Rebuild the export pipeline', estimatedHours: 6 })
    expect(response.status).toBe(200)

    const task = await Task.findById(taskId).lean()
    expect(task).toMatchObject({ originalEstimateMinutes: 13 * 60, estimateMethod: 'poker' })
  })
})
