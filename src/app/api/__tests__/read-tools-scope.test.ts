/**
 * PR #927 follow-up review (MCP read tools):
 * - GET /api/reports/gantt had no access check. Without projectId it returned
 *   every task in the database (no organisation filter either); with one, any
 *   project's tasks and sprints.
 * - GET /api/activity showed every project's activity in the organisation to
 *   everyone, clients and viewers included, and used the search text as a regex.
 *
 * Runs the real handlers against the in-memory database. Sign-in and the
 * permission loader are mocked so each test picks who is calling.
 */
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { ActivityLog } from '@/models/ActivityLog'
import { Project } from '@/models/Project'
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'
import '@/models/User' // the activity route populates `user`

import { useMongo } from '@/lib/standup/__tests__/helpers/mongo'

const mockOrg = new mongoose.Types.ObjectId()
const otherOrg = new mongoose.Types.ObjectId()
const mockCaller = { id: String(new mongoose.Types.ObjectId()), role: 'viewer', projects: [] as string[] }

jest.mock('@/lib/db-config', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined)
}))
jest.mock('@/lib/auth-utils', () => {
  const user = () => ({ id: mockCaller.id, organization: String(mockOrg), role: mockCaller.role })
  return {
    authenticateUser: jest.fn(async () => ({ user: user() })),
    withAuth: jest.fn(async (_req: any, handler: any) => handler(user()))
  }
})
jest.mock('@/lib/permissions/permission-service', () => ({
  PermissionService: {
    getUserPermissions: jest.fn(async () => {
      const { ROLE_PERMISSIONS } = jest.requireActual('@/lib/permissions/permission-definitions')
      return {
        globalPermissions: [...(ROLE_PERMISSIONS[mockCaller.role] || [])],
        projectPermissions: new Map(mockCaller.projects.map((p) => [p, []])),
        projectRoles: new Map(),
        userRole: mockCaller.role
      }
    })
  }
}))

import { GET as gantt } from '@/app/api/reports/gantt/route'
import { GET as activity } from '@/app/api/activity/route'

const as = (role: string, projects: string[] = []) => {
  mockCaller.role = role
  mockCaller.projects = projects
}

let mine: any
let notMine: any
let foreign: any

async function seed() {
  const creator = new mongoose.Types.ObjectId()
  const project = (name: string, organization: mongoose.Types.ObjectId, projectNumber: number) =>
    Project.create({ name, organization, createdBy: creator, projectNumber, startDate: new Date('2026-08-01') })
  mine = await project('Mine', mockOrg, 1)
  notMine = await project('Not mine', mockOrg, 2)
  foreign = await project('Other org', otherOrg, 3)

  let n = 1
  for (const p of [mine, notMine, foreign]) {
    await Task.create({
      title: `${p.name} task`, organization: p.organization, project: p._id, createdBy: creator,
      taskNumber: n, displayId: `T-${n++}`, status: 'todo',
      startDate: new Date('2026-09-01'), dueDate: new Date('2026-09-05')
    })
    await Sprint.create({
      name: `${p.name} sprint`, organization: p.organization, project: p._id, createdBy: creator,
      status: 'planning', startDate: new Date('2026-09-01'), endDate: new Date('2026-09-14'), capacity: 0
    })
  }

  const log = (extra: Record<string, unknown>) =>
    ActivityLog.create({
      organization: mockOrg, actorType: 'user', user: creator,
      action: 'task_updated', entityType: 'task', ...extra
    })
  await log({ project: mine._id, projectName: 'Mine', entityName: 'mine entry' })
  await log({ project: notMine._id, projectName: 'Not mine', entityName: 'secret entry' })
  await log({ entityName: 'someone else, no project' })
  await log({ entityName: 'my own, no project', user: new mongoose.Types.ObjectId(mockCaller.id) })
  await ActivityLog.create({
    organization: otherOrg, actorType: 'user', user: creator, action: 'task_updated',
    entityType: 'task', entityName: 'other org entry'
  })
}

const ganttTitles = async (query = '') => {
  const res = await gantt(new NextRequest(`http://localhost/api/reports/gantt${query}`))
  return { status: res.status, titles: res.status === 200 ? (await res.json()).tasks.map((t: any) => t.title).sort() : [] }
}
const activityNames = async (query = '') => {
  const res: any = await activity(new NextRequest(`http://localhost/api/activity${query}`))
  return {
    status: res.status,
    names: res.status === 200 ? (await res.json()).activities.map((a: any) => a.entityName).sort() : []
  }
}

describe('read tools are scoped to what the caller can see', () => {
  useMongo()
  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    await seed()
  })
  afterEach(() => jest.restoreAllMocks())

  describe('GET /api/reports/gantt', () => {
    it('without projectId, a member sees only their projects\' tasks (never another org\'s)', async () => {
      as('team_member', [String(mine._id)])
      expect(await ganttTitles()).toEqual({ status: 200, titles: ['Mine task'] })
    })

    it('without projectId, an admin sees their whole organisation, but not another org', async () => {
      as('admin')
      const { titles } = await ganttTitles()
      expect(titles).toContain('Mine task')
      expect(titles).toContain('Not mine task')
      expect(titles).not.toContain('Other org task')
    })

    it('refuses a project the caller is not on', async () => {
      as('team_member', [String(mine._id)])
      expect((await ganttTitles(`?projectId=${notMine._id}`)).status).toBe(403)
    })

    it('answers 404 for another organisation\'s project, even for an admin', async () => {
      as('admin')
      expect((await ganttTitles(`?projectId=${foreign._id}`)).status).toBe(404)
      expect((await ganttTitles('?projectId=not-an-id')).status).toBe(404)
    })

    it('returns the tasks and sprints of a project the caller is on', async () => {
      as('team_member', [String(mine._id)])
      expect(await ganttTitles(`?projectId=${mine._id}`)).toEqual({ status: 200, titles: ['Mine sprint', 'Mine task'] })
    })

    it('a sprint filter cannot reach into a project the caller is not on', async () => {
      as('team_member', [String(mine._id)])
      const otherSprint: any = await Sprint.findOne({ project: notMine._id })
      expect(await ganttTitles(`?sprintId=${otherSprint._id}`)).toEqual({ status: 200, titles: [] })
    })
  })

  describe('GET /api/activity', () => {
    it('a member sees their projects and their own project-less activity only', async () => {
      as('viewer', [String(mine._id)])
      expect(await activityNames()).toEqual({ status: 200, names: ['mine entry', 'my own, no project'] })
    })

    it('an admin sees the whole organisation, not another org', async () => {
      as('admin')
      expect(await activityNames()).toEqual({
        status: 200,
        names: ['mine entry', 'my own, no project', 'secret entry', 'someone else, no project']
      })
    })

    it('refuses ?project= for a project the caller is not on', async () => {
      as('client', [String(mine._id)])
      expect((await activityNames(`?project=${notMine._id}`)).status).toBe(403)
      expect((await activityNames('?project=not-an-id')).status).toBe(400)
    })

    it('treats the search text literally and keeps the scope while searching', async () => {
      as('viewer', [String(mine._id)])
      expect(await activityNames('?search=' + encodeURIComponent('(unclosed'))).toEqual({ status: 200, names: [] })
      expect((await activityNames('?search=entry')).names).toEqual(['mine entry'])
      expect((await activityNames('?search=' + encodeURIComponent('.*'))).names).toEqual([])
    })
  })
})
