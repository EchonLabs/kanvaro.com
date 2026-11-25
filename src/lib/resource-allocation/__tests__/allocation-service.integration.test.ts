/**
 * Direct (Admin/HR) allocation changes against the database.
 *
 * Every write goes through `directChange` — never a planted row — so these
 * tests prove the writer, not just a reader of state the test arranged.
 */
jest.mock('@/lib/notification-service', () => ({
  notificationService: {
    createNotification: jest.fn().mockResolvedValue(null),
    createBulkNotifications: jest.fn().mockResolvedValue([]),
    notifyProjectTeamMemberAdded: jest.fn().mockResolvedValue(undefined)
  }
}))
jest.mock('@/lib/activity-logger', () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }))

import mongoose from 'mongoose'

import { notificationService } from '@/lib/notification-service'
import { logActivity } from '@/lib/activity-logger'
import { AllocationHistory } from '@/models/AllocationHistory'
import { Organization } from '@/models/Organization'
import { Project } from '@/models/Project'
import { ResourceAllocation } from '@/models/ResourceAllocation'

import { useMongo, syncIndexes } from '@/lib/standup/__tests__/helpers/mongo'

import {
  directChange,
  getActiveProjects,
  getMemberAllocations,
  getThreshold,
  setThreshold
} from '../allocation-service'
import { plant, seedWorld } from './helpers/fixtures'

type World = Awaited<ReturnType<typeof seedWorld>>

const id = (doc: { _id: unknown }) => String(doc._id)
const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('allocation-service: direct changes', () => {
  useMongo()

  let w: World
  let actor: { userId: string; organizationId: string }

  beforeEach(async () => {
    jest.clearAllMocks()
    await syncIndexes(ResourceAllocation)
    w = await seedWorld()
    actor = { userId: id(w.users.hr), organizationId: w.organizationId }
  })

  const change = (lines: { projectId: string; newPercent: number }[], memberId = id(w.users.member)) =>
    directChange(actor, { memberId, lines, reason: 'Project workload change' })

  it('applies a direct change, writes history per changed line and returns the new total', async () => {
    await plant(w.org._id, w.users.member._id, w.projects.p1._id, 50, w.users.hr._id)

    const result = await change([
      { projectId: id(w.projects.p1), newPercent: 30 },
      { projectId: id(w.projects.p2), newPercent: 60 }
    ])

    expect(result).toMatchObject({ mode: 'applied', totalAfter: 90 })
    const rows = await ResourceAllocation.find({ member: w.users.member._id }).lean()
    expect(rows.map((row: any) => row.percent).sort()).toEqual([30, 60])

    const history = await AllocationHistory.find({ member: w.users.member._id }).sort({ previousPercent: -1 }).lean()
    expect(history).toHaveLength(2)
    expect(history.map((row: any) => [row.previousPercent, row.newPercent, row.kind])).toEqual([
      [50, 30, 'direct'],
      [0, 60, 'direct']
    ])
    expect(String((history[0] as any).changedBy)).toBe(actor.userId)
    expect((history[0] as any).reason).toBe('Project workload change')
  })

  it('writes history only for lines that actually change', async () => {
    await plant(w.org._id, w.users.member._id, w.projects.p1._id, 50, w.users.hr._id)

    await change([
      { projectId: id(w.projects.p1), newPercent: 50 },
      { projectId: id(w.projects.p2), newPercent: 20 }
    ])

    expect(await AllocationHistory.countDocuments({ member: w.users.member._id })).toBe(1)
  })

  it('deletes the row when a line goes to 0', async () => {
    await plant(w.org._id, w.users.member._id, w.projects.p1._id, 50, w.users.hr._id)

    await change([{ projectId: id(w.projects.p1), newPercent: 0 }])

    expect(await ResourceAllocation.countDocuments({ member: w.users.member._id })).toBe(0)
  })

  it('adds the member to the project team once and notifies them', async () => {
    await change([{ projectId: id(w.projects.p1), newPercent: 20 }])
    await change([{ projectId: id(w.projects.p1), newPercent: 40 }])
    await flush()

    const project: any = await Project.findById(w.projects.p1._id).lean()
    const entries = project.teamMembers.filter((m: any) => String(m.memberId) === id(w.users.member))
    expect(entries).toHaveLength(1)
    expect(entries[0].hourlyRate).toBe(25)
    expect(notificationService.notifyProjectTeamMemberAdded).toHaveBeenCalledTimes(1)
  })

  it('never removes the member from the team when allocation drops to 0', async () => {
    await change([{ projectId: id(w.projects.p1), newPercent: 20 }])
    await change([{ projectId: id(w.projects.p1), newPercent: 0 }])

    const project: any = await Project.findById(w.projects.p1._id).lean()
    expect(project.teamMembers.some((m: any) => String(m.memberId) === id(w.users.member))).toBe(true)
  })

  it('notifies the member and logs activity for an applied change', async () => {
    await change([{ projectId: id(w.projects.p1), newPercent: 20 }])
    await flush()

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      id(w.users.member),
      w.organizationId,
      expect.objectContaining({ type: 'resource_allocation' })
    )
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'resource_allocation_changed', entityType: 'resource_allocation' })
    )
  })

  it('refuses a direct change that exceeds the threshold', async () => {
    await plant(w.org._id, w.users.member._id, w.projects.p1._id, 80, w.users.hr._id)

    await expect(change([{ projectId: id(w.projects.p2), newPercent: 40 }])).rejects.toMatchObject({
      code: 'OVER_THRESHOLD',
      details: { totalAfter: 120, threshold: 100, exceedsBy: 20 }
    })
    expect(await AllocationHistory.countDocuments({})).toBe(0)
  })

  it('allows a change that only reduces an already-over member', async () => {
    await plant(w.org._id, w.users.member._id, w.projects.p1._id, 80, w.users.hr._id)
    await plant(w.org._id, w.users.member._id, w.projects.p2._id, 50, w.users.hr._id)

    await expect(change([{ projectId: id(w.projects.p2), newPercent: 30 }])).resolves.toMatchObject({
      totalAfter: 110
    })
  })

  it('respects a threshold above 100', async () => {
    await Organization.updateOne(
      { _id: w.org._id },
      { 'settings.resourceAllocation.overAllocationThresholdPercent': 120 }
    )
    await plant(w.org._id, w.users.member._id, w.projects.p1._id, 80, w.users.hr._id)

    await expect(change([{ projectId: id(w.projects.p2), newPercent: 40 }])).resolves.toMatchObject({
      totalAfter: 120
    })
  })

  it('refuses a change set that changes nothing', async () => {
    await plant(w.org._id, w.users.member._id, w.projects.p1._id, 50, w.users.hr._id)

    await expect(change([{ projectId: id(w.projects.p1), newPercent: 50 }])).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'No changes to apply.'
    })
    expect(await AllocationHistory.countDocuments({})).toBe(0)
  })

  it('answers NOT_FOUND for a member from another org', async () => {
    await expect(
      change([{ projectId: id(w.projects.p1), newPercent: 10 }], id(w.users.outsider))
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('answers NOT_FOUND for a project from another org', async () => {
    await expect(change([{ projectId: id(w.projects.p5), newPercent: 10 }])).rejects.toMatchObject({
      code: 'NOT_FOUND'
    })
  })

  it('answers NOT_FOUND for a member id that does not exist or is malformed', async () => {
    await expect(
      change([{ projectId: id(w.projects.p1), newPercent: 10 }], String(new mongoose.Types.ObjectId()))
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(change([{ projectId: id(w.projects.p1), newPercent: 10 }], 'nope')).rejects.toMatchObject({
      code: 'NOT_FOUND'
    })
  })

  it('refuses completed and archived projects', async () => {
    const error = await change([
      { projectId: id(w.projects.p3), newPercent: 10 },
      { projectId: id(w.projects.p4), newPercent: 10 }
    ]).catch((e) => e)

    expect(error).toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(error.details.projectIds.sort()).toEqual([id(w.projects.p3), id(w.projects.p4)].sort())
  })

  it.each(['inactive', 'client', 'viewer', 'accountManager'] as const)(
    'refuses %s users as resources',
    async (who) => {
      await expect(
        change([{ projectId: id(w.projects.p1), newPercent: 10 }], id(w.users[who]))
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    }
  )

  it('refuses malformed percents through the service', async () => {
    await expect(
      directChange(actor, {
        memberId: id(w.users.member),
        lines: [{ projectId: id(w.projects.p1), newPercent: '50' }],
        reason: 'x'
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('requires a reason', async () => {
    await expect(
      directChange(actor, {
        memberId: id(w.users.member),
        lines: [{ projectId: id(w.projects.p1), newPercent: 10 }],
        reason: '  '
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })
})

describe('allocation-service: reads and settings', () => {
  useMongo()

  let w: World

  beforeEach(async () => {
    w = await seedWorld()
  })

  it('totals ignore allocations on inactive projects', async () => {
    await plant(w.org._id, w.users.member._id, w.projects.p1._id, 50, w.users.hr._id)
    await plant(w.org._id, w.users.member._id, w.projects.p3._id, 40, w.users.hr._id)

    const result = await getMemberAllocations(w.organizationId, id(w.users.member))

    expect(result.total).toBe(50)
    expect(result.remaining).toBe(50)
    expect(result.status).toBe('partial')
    expect(result.lines.map((line) => line.projectId)).not.toContain(id(w.projects.p3))
  })

  it('lists every active project with the member\'s percent and team membership', async () => {
    await plant(w.org._id, w.users.member._id, w.projects.p1._id, 50, w.users.hr._id)

    const result = await getMemberAllocations(w.organizationId, id(w.users.member))

    expect(result.lines).toEqual([
      expect.objectContaining({ projectName: 'AVO', percent: 50, onTeam: false }),
      expect.objectContaining({ projectName: 'BaseNeo SaaS', percent: 0, onTeam: false })
    ])
    expect(result.member).toMatchObject({ name: 'Dulmi Tester', roleLabel: 'Team Member' })
  })

  it('lists each project’s managers so editors can apply the PM-only-increase rule', async () => {
    const result = await getMemberAllocations(w.organizationId, id(w.users.member))

    expect(result.lines[0].managerIds.sort()).toEqual([id(w.users.pm), id(w.users.admin)].sort())
    expect(result.lines[1].managerIds).toEqual([id(w.users.otherPm)])
  })

  it('reports onTeam=false when the member was removed from the team elsewhere', async () => {
    await directChange(
      { userId: id(w.users.hr), organizationId: w.organizationId },
      { memberId: id(w.users.member), lines: [{ projectId: id(w.projects.p1), newPercent: 30 }], reason: 'x' }
    )
    expect((await getMemberAllocations(w.organizationId, id(w.users.member))).lines[0].onTeam).toBe(true)

    await Project.updateOne({ _id: w.projects.p1._id }, { $pull: { teamMembers: { memberId: w.users.member._id } } })

    const after = await getMemberAllocations(w.organizationId, id(w.users.member))
    expect(after.lines[0]).toMatchObject({ percent: 30, onTeam: false })
    expect(after.total).toBe(30)
  })

  it('lists active projects with billable flag and managers', async () => {
    const projects = await getActiveProjects(w.organizationId)

    expect(projects.map((p) => p.name)).toEqual(['AVO', 'BaseNeo SaaS'])
    // P1: Pamela holds an explicit project_manager role; the creator (Admin) has
    // no explicit project role, so — as in PermissionService — they manage it too.
    expect(projects[0]).toMatchObject({
      billable: true,
      managers: [
        { _id: id(w.users.pm), name: 'Pamela Tester' },
        { _id: id(w.users.admin), name: 'Admin Tester' }
      ]
    })
    expect(projects[1]).toMatchObject({ billable: false, managers: [{ _id: id(w.users.otherPm), name: 'Peter Tester' }] })
  })

  it('reads and validates the threshold setting', async () => {
    expect(await getThreshold(w.organizationId)).toBe(100)

    for (const bad of [49, 201, 75.5, '120']) {
      await expect(setThreshold(w.organizationId, bad as any)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    }

    expect(await setThreshold(w.organizationId, 120)).toBe(120)
    expect(await getThreshold(w.organizationId)).toBe(120)
  })

  it('falls back to the default threshold for an org saved before the setting existed', async () => {
    await Organization.collection.updateOne({ _id: w.org._id }, { $unset: { 'settings.resourceAllocation': '' } })
    expect(await getThreshold(w.organizationId)).toBe(100)
  })
})
