/**
 * PR #927 review (decided: same project). A task's story, epic, sprint, parent
 * task and dependencies, and a story's epic and sprint, must be in the same
 * project as the item linking to them. Before, only the item itself was
 * checked, so a link could point into a project the caller cannot see.
 *
 * Runs the real handlers against the in-memory database; only sign-in and the
 * permission layer are mocked (the caller may do everything), so a refusal
 * here can only come from the project check.
 */
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { Epic } from '@/models/Epic'
import { Project } from '@/models/Project'
import { Sprint } from '@/models/Sprint'
import { Story } from '@/models/Story'
import { Task } from '@/models/Task'
import { User } from '@/models/User'

import { useMongo } from '@/lib/standup/__tests__/helpers/mongo'

const mockOrg = new mongoose.Types.ObjectId()
const mockUser = new mongoose.Types.ObjectId()

jest.mock('@/lib/db-config', () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/auth-utils', () => ({
  authenticateUser: jest.fn(async () => ({ user: { id: String(mockUser), organization: String(mockOrg) } }))
}))
jest.mock('@/lib/permissions/permission-service', () => ({
  PermissionService: {
    hasPermission: jest.fn().mockResolvedValue(true),
    hasAnyPermission: jest.fn().mockResolvedValue(true),
    getUserPermissions: jest.fn().mockResolvedValue({
      globalPermissions: [], projectPermissions: new Map(), projectRoles: new Map(), userRole: 'admin'
    }),
    hasPermissionIn: jest.fn().mockReturnValue(true),
    canAccessProjectIn: jest.fn().mockReturnValue(true),
    getAccessibleProjects: jest.fn().mockResolvedValue([])
  }
}))
// Side effects that are not under test.
jest.mock('@/lib/notification-service', () => ({
  notificationService: new Proxy({}, { get: () => jest.fn().mockResolvedValue(undefined) })
}))
jest.mock('@/lib/redis', () => ({
  invalidateCache: jest.fn().mockResolvedValue(undefined),
  cache: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) }
}))

import { rejectLinksOutsideProject } from '@/lib/api/update-fields'
import { PUT as putTask } from '@/app/api/tasks/[id]/route'
import { POST as createTask } from '@/app/api/tasks/route'
import { POST as addDependency } from '@/app/api/tasks/[id]/dependencies/route'
import { PUT as putStory } from '@/app/api/stories/[id]/route'

const json = (method: string, body: unknown) =>
  new NextRequest('http://localhost/x', { method, body: JSON.stringify(body) })

let home: any
let other: any
let task: any

async function seed() {
  await User.create({
    _id: mockUser, firstName: 'Pat', lastName: 'Admin', email: 'pat.admin@example.test',
    password: 'hashed', role: 'admin', organization: mockOrg
  })
  const project = (name: string, projectNumber: number) =>
    Project.create({
      name, organization: mockOrg, createdBy: mockUser, projectNumber,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      settings: { taskCategories: [{ key: 'dev', title: 'Development', order: 0 }] }
    })
  const items = async (projectDoc: any, tag: string) => ({
    project: projectDoc,
    story: await Story.create({ title: `${tag} story`, project: projectDoc._id, createdBy: mockUser }),
    epic: await Epic.create({ title: `${tag} epic`, project: projectDoc._id, createdBy: mockUser }),
    sprint: await Sprint.create({
      name: `${tag} sprint`, organization: mockOrg, project: projectDoc._id, createdBy: mockUser,
      status: 'planning', startDate: new Date('2026-08-24T00:00:00.000Z'),
      endDate: new Date('2026-08-28T00:00:00.000Z'), capacity: 0
    }),
    task: await Task.create({
      title: `${tag} other task`, organization: mockOrg, project: projectDoc._id, createdBy: mockUser,
      taskNumber: 50, displayId: `${tag}-50`, status: 'todo', category: 'dev'
    })
  })
  home = await items(await project('Home', 1), 'HOME')
  other = await items(await project('Other', 2), 'OTHER')
  task = await Task.create({
    title: 'Task under test', organization: mockOrg, project: home.project._id, createdBy: mockUser,
    // High numbers: the create test's counter starts at 1 in this project.
    taskNumber: 101, displayId: 'HOME-101', status: 'todo', category: 'dev'
  })
}

const saveTask = (body: Record<string, unknown>) =>
  putTask(json('PUT', body), { params: { id: String(task._id) } })

describe('rejectLinksOutsideProject', () => {
  const model = (inProject: number) => ({ countDocuments: jest.fn().mockResolvedValue(inProject) }) as any
  const id = () => String(new mongoose.Types.ObjectId())

  it('skips empty links without a query', async () => {
    const m = model(0)
    expect(await rejectLinksOutsideProject(id(), [{ label: 'story', model: m, ids: [undefined, '', null] }])).toBeNull()
    expect(m.countDocuments).not.toHaveBeenCalled()
  })

  it('rejects when any id is outside the project, and counts duplicates once', async () => {
    const a = id()
    const m = model(1)
    expect(await rejectLinksOutsideProject(id(), [{ label: 'dependency', model: m, ids: [a, a] }])).toBeNull()
    const res: any = await rejectLinksOutsideProject(id(), [{ label: 'dependency', model: model(1), ids: [a, id()] }])
    expect(res.status).toBe(400)
  })

  it('rejects a malformed id without querying', async () => {
    const m = model(1)
    const res: any = await rejectLinksOutsideProject(id(), [{ label: 'epic', model: m, ids: ['not-an-id'] }])
    expect(res.status).toBe(400)
    expect(m.countDocuments).not.toHaveBeenCalled()
  })
})

describe('linked items must be in the same project', () => {
  useMongo()
  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    await seed()
  })
  afterEach(() => jest.restoreAllMocks())

  describe('PUT /api/tasks/:id', () => {
    it.each([
      ['story', () => other.story._id],
      ['epic', () => other.epic._id],
      ['sprint', () => other.sprint._id],
      ['parentTask', () => other.task._id]
    ])('refuses a %s from another project and saves nothing', async (field, pick) => {
      const res = await saveTask({ [field]: String(pick()) })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/same project/)
      const saved: any = await Task.findById(task._id).lean()
      expect(saved[field]).toBeUndefined()
    })

    it('refuses a dependency from another project', async () => {
      const res = await saveTask({ dependencies: [String(home.task._id), String(other.task._id)] })
      expect(res.status).toBe(400)
      expect(((await Task.findById(task._id).lean()) as any).dependencies).toHaveLength(0)
    })

    it('saves links that are all in the task\'s project', async () => {
      const res = await saveTask({
        story: String(home.story._id),
        epic: String(home.epic._id),
        parentTask: String(home.task._id),
        dependencies: [String(home.task._id)]
      })
      expect(res.status).toBe(200)
      const saved: any = await Task.findById(task._id).lean()
      expect(String(saved.story)).toBe(String(home.story._id))
      expect(String(saved.epic)).toBe(String(home.epic._id))
      expect(saved.dependencies.map(String)).toEqual([String(home.task._id)])
    })

    it('still saves a task whose older cross-project link is resent unchanged', async () => {
      await Task.updateOne({ _id: task._id }, { $set: { story: other.story._id, dependencies: [other.task._id] } })
      const res = await saveTask({
        title: 'Renamed',
        story: String(other.story._id),
        dependencies: [String(other.task._id)]
      })
      expect(res.status).toBe(200)
      expect(((await Task.findById(task._id).lean()) as any).title).toBe('Renamed')
    })

    it('checks resent links again when the task moves to another project', async () => {
      await Task.updateOne({ _id: task._id }, { $set: { story: home.story._id } })
      const res = await saveTask({ project: String(other.project._id), story: String(home.story._id) })
      expect(res.status).toBe(400)
      expect(String(((await Task.findById(task._id).lean()) as any).project)).toBe(String(home.project._id))
    })
  })

  describe('POST /api/tasks', () => {
    const create = (extra: Record<string, unknown>) =>
      createTask(json('POST', { title: 'New task', project: String(home.project._id), category: 'dev', ...extra }))

    it.each([
      ['story', () => other.story._id],
      ['epic', () => other.epic._id],
      ['parentTask', () => other.task._id]
    ])('refuses a %s from another project and creates nothing', async (field, pick) => {
      const before = await Task.countDocuments()
      const res = await create({ [field]: String(pick()) })
      expect(res.status).toBe(400)
      expect(await Task.countDocuments()).toBe(before)
    })

    it('creates a task linked within its own project', async () => {
      const res = await create({ story: String(home.story._id), epic: String(home.epic._id) })
      expect(res.status).toBeLessThan(300)
      const created: any = await Task.findOne({ title: 'New task' }).lean()
      expect(String(created.story)).toBe(String(home.story._id))
    })
  })

  describe('POST /api/tasks/:id/dependencies', () => {
    const add = (targetTaskId: unknown) =>
      addDependency(json('POST', { targetTaskId: String(targetTaskId), relationship: 'blocked_by' }), {
        params: { id: String(task._id) }
      })

    it('refuses a task from another project', async () => {
      const res = await add(other.task._id)
      expect(res.status).toBe(400)
      expect(((await Task.findById(task._id).lean()) as any).dependencies).toHaveLength(0)
    })

    it('links a task from the same project', async () => {
      const res = await add(home.task._id)
      expect(res.status).toBe(200)
      expect(((await Task.findById(task._id).lean()) as any).dependencies.map(String)).toEqual([String(home.task._id)])
    })
  })

  describe('PUT /api/stories/:id', () => {
    const saveStory = (body: Record<string, unknown>) =>
      putStory(json('PUT', body), { params: { id: String(home.story._id) } })

    it.each([
      ['epic', () => other.epic._id],
      ['sprint', () => other.sprint._id]
    ])('refuses a %s from another project', async (field, pick) => {
      const res = await saveStory({ [field]: String(pick()) })
      expect(res.status).toBe(400)
      expect(((await Story.findById(home.story._id).lean()) as any)[field]).toBeUndefined()
    })

    it('saves an epic and sprint from the story\'s project', async () => {
      const res = await saveStory({ epic: String(home.epic._id), sprint: String(home.sprint._id) })
      expect(res.status).toBe(200)
      const saved: any = await Story.findById(home.story._id).lean()
      expect(String(saved.epic)).toBe(String(home.epic._id))
    })
  })
})
