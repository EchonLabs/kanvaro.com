/**
 * PM requests and Admin/HR decisions against the database.
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
import { AllocationHistory } from '@/models/AllocationHistory'
import { AllocationRequest } from '@/models/AllocationRequest'
import { Project } from '@/models/Project'
import { ResourceAllocation } from '@/models/ResourceAllocation'
import { User } from '@/models/User'

import { syncIndexes, useMongo } from '@/lib/standup/__tests__/helpers/mongo'

import { directChange } from '../allocation-service'
import {
  approveRequest,
  cancelRequest,
  createRequest,
  getRequestDetail,
  listRequests,
  rejectRequest
} from '../request-service'
import { plant, seedWorld } from './helpers/fixtures'

type World = Awaited<ReturnType<typeof seedWorld>>

const id = (doc: { _id: unknown }) => String(doc._id)
const flush = () => new Promise((resolve) => setImmediate(resolve))

/** Fire-and-forget notifications span several queries; wait for the call to land. */
async function eventually(mock: jest.Mock): Promise<void> {
  for (let i = 0; i < 100 && mock.mock.calls.length === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('request-service', () => {
  useMongo()

  let w: World
  let pm: { userId: string; organizationId: string }
  let hr: { userId: string; organizationId: string }
  let admin: { userId: string; organizationId: string }

  beforeEach(async () => {
    jest.clearAllMocks()
    await syncIndexes(ResourceAllocation, AllocationRequest)
    w = await seedWorld()
    pm = { userId: id(w.users.pm), organizationId: w.organizationId }
    hr = { userId: id(w.users.hr), organizationId: w.organizationId }
    admin = { userId: id(w.users.admin), organizationId: w.organizationId }
  })

  const submit = (lines: { projectId: string; newPercent: number }[], actor = pm, memberId = id(w.users.member)) =>
    createRequest(actor, { memberId, lines, reason: 'New project requirement' })

  const percentOn = async (project: { _id: unknown }) => {
    const row: any = await ResourceAllocation.findOne({ member: w.users.member._id, project: project._id }).lean()
    return row?.percent ?? 0
  }

  describe('createRequest', () => {
    it('lets a PM request an increase on their own project and a decrease on another', async () => {
      await plant(w.org._id, w.users.member._id, w.projects.p2._id, 50, w.users.hr._id)

      const request = await submit([
        { projectId: id(w.projects.p1), newPercent: 60 },
        { projectId: id(w.projects.p2), newPercent: 20 }
      ])
      await flush()

      expect(request.status).toBe('pending')
      expect(request.totalBefore).toBe(50)
      expect(request.totalAfter).toBe(80)
      expect(request.lines.map((line: any) => [String(line.project), line.previousPercent, line.newPercent])).toEqual([
        [id(w.projects.p1), 0, 60],
        [id(w.projects.p2), 50, 20]
      ])
      // Nothing applied yet.
      expect(await percentOn(w.projects.p1)).toBe(0)

      await eventually(notificationService.createBulkNotifications as jest.Mock)
      const [recipients] = (notificationService.createBulkNotifications as jest.Mock).mock.calls[0]
      expect(recipients.sort()).toEqual([id(w.users.admin), id(w.users.hr), id(w.users.lead)].sort())
      expect(recipients).not.toContain(id(w.users.pm))
    })

    it('stores only the lines that change', async () => {
      await plant(w.org._id, w.users.member._id, w.projects.p2._id, 50, w.users.hr._id)

      const request = await submit([
        { projectId: id(w.projects.p1), newPercent: 30 },
        { projectId: id(w.projects.p2), newPercent: 50 }
      ])

      expect(request.lines).toHaveLength(1)
    })

    it('forbids a PM increasing on a project they do not manage', async () => {
      await expect(submit([{ projectId: id(w.projects.p2), newPercent: 30 }])).rejects.toMatchObject({
        code: 'FORBIDDEN',
        details: { projectIds: [id(w.projects.p2)] }
      })
      expect(await AllocationRequest.countDocuments({})).toBe(0)
    })

    it('refuses an over-threshold request at submit', async () => {
      await plant(w.org._id, w.users.member._id, w.projects.p2._id, 80, w.users.hr._id)

      await expect(submit([{ projectId: id(w.projects.p1), newPercent: 40 }])).rejects.toMatchObject({
        code: 'OVER_THRESHOLD',
        details: { totalAfter: 120, threshold: 100, exceedsBy: 20 }
      })
    })

    it('refuses a second pending request for the same member', async () => {
      await submit([{ projectId: id(w.projects.p1), newPercent: 30 }])

      await expect(submit([{ projectId: id(w.projects.p1), newPercent: 40 }])).rejects.toMatchObject({
        code: 'REQUEST_ALREADY_PENDING'
      })
      expect(await AllocationRequest.countDocuments({})).toBe(1)
    })

    it('refuses a request that changes nothing', async () => {
      await expect(submit([{ projectId: id(w.projects.p1), newPercent: 0 }])).rejects.toMatchObject({
        code: 'VALIDATION_FAILED'
      })
    })
  })

  describe('approveRequest', () => {
    it('applies the lines; history has changedBy=requester and approvedBy=approver, kind approved', async () => {
      const request = await submit([{ projectId: id(w.projects.p1), newPercent: 60 }])

      const result = await approveRequest(hr, id(request), {})
      await flush()

      expect(result).toEqual({ status: 'approved', totalAfter: 60 })
      expect(await percentOn(w.projects.p1)).toBe(60)

      const history: any[] = await AllocationHistory.find({ request: request._id }).lean()
      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({ kind: 'approved', previousPercent: 0, newPercent: 60 })
      expect(String(history[0].changedBy)).toBe(id(w.users.pm))
      expect(String(history[0].approvedBy)).toBe(id(w.users.hr))

      const stored: any = await AllocationRequest.findById(request._id).lean()
      expect(stored.status).toBe('approved')
      expect(String(stored.decidedBy)).toBe(id(w.users.hr))
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        id(w.users.pm),
        w.organizationId,
        expect.objectContaining({ data: expect.objectContaining({ action: 'approved' }) })
      )
    })

    it('adds the member to the project team on approval', async () => {
      const request = await submit([{ projectId: id(w.projects.p1), newPercent: 60 }])
      await approveRequest(hr, id(request), {})

      const project: any = await Project.findById(w.projects.p1._id).lean()
      expect(project.teamMembers.some((m: any) => String(m.memberId) === id(w.users.member))).toBe(true)
    })

    it('refuses a stale approval until acknowledged, then applies the requested absolute values', async () => {
      const request = await submit([{ projectId: id(w.projects.p1), newPercent: 60 }])
      await directChange(admin, {
        memberId: id(w.users.member),
        lines: [{ projectId: id(w.projects.p1), newPercent: 10 }],
        reason: 'Interim'
      })

      const detail = await getRequestDetail(w.organizationId, id(request))
      expect(detail.stale).toBe(true)
      expect(detail.lines[0]).toMatchObject({ previousPercent: 0, currentPercent: 10, newPercent: 60 })

      await expect(approveRequest(hr, id(request), {})).rejects.toMatchObject({
        code: 'STALE_REQUEST_UNACKNOWLEDGED'
      })
      expect(await percentOn(w.projects.p1)).toBe(10)

      await approveRequest(hr, id(request), { acknowledgeStale: true })
      expect(await percentOn(w.projects.p1)).toBe(60)
    })

    it('includes the member’s photo so the approval header can show it', async () => {
      await User.updateOne({ _id: w.users.member._id }, { avatar: '/api/uploads/avatars/member.jpg' })
      const request = await submit([{ projectId: id(w.projects.p1), newPercent: 60 }])

      const detail = await getRequestDetail(w.organizationId, id(request))
      expect(detail.member.avatar).toBe('/api/uploads/avatars/member.jpg')
    })

    it('re-checks the threshold on live totals at approval', async () => {
      const request = await submit([{ projectId: id(w.projects.p1), newPercent: 60 }])
      await directChange(admin, {
        memberId: id(w.users.member),
        lines: [{ projectId: id(w.projects.p2), newPercent: 50 }],
        reason: 'Urgent'
      })

      const detail = await getRequestDetail(w.organizationId, id(request))
      expect(detail).toMatchObject({ liveTotalAfter: 110, exceedsThresholdNow: true })

      await expect(approveRequest(hr, id(request), { acknowledgeStale: true })).rejects.toMatchObject({
        code: 'OVER_THRESHOLD'
      })
      const stored: any = await AllocationRequest.findById(request._id).lean()
      expect(stored.status).toBe('pending')
    })

    it('lets only one of two concurrent approvals win', async () => {
      const request = await submit([{ projectId: id(w.projects.p1), newPercent: 60 }])

      const results = await Promise.allSettled([
        approveRequest(hr, id(request), {}),
        approveRequest(admin, id(request), {})
      ])

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
      expect(rejected.reason).toMatchObject({ code: 'REQUEST_NOT_PENDING' })
      expect(await AllocationHistory.countDocuments({ request: request._id })).toBe(1)
    })

    it('refuses approval when the member is no longer an active resource', async () => {
      const request = await submit([{ projectId: id(w.projects.p1), newPercent: 60 }])
      await User.updateOne({ _id: w.users.member._id }, { isActive: false })

      await expect(approveRequest(hr, id(request), {})).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
      expect(((await AllocationRequest.findById(request._id).lean()) as any).status).toBe('pending')
    })

    it('refuses approval when a project was completed after submit', async () => {
      const request = await submit([{ projectId: id(w.projects.p1), newPercent: 60 }])
      await Project.updateOne({ _id: w.projects.p1._id }, { status: 'completed' })

      await expect(approveRequest(hr, id(request), {})).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { projectIds: [id(w.projects.p1)] }
      })
    })

    it('names an inactive project and leaves it out of the live total', async () => {
      await plant(w.org._id, w.users.member._id, w.projects.p2._id, 30, w.users.hr._id)
      const request = await submit([
        { projectId: id(w.projects.p1), newPercent: 60 },
        { projectId: id(w.projects.p2), newPercent: 10 }
      ])
      await Project.updateOne({ _id: w.projects.p1._id }, { archived: true })

      const detail = await getRequestDetail(w.organizationId, id(request))
      expect(detail.lines.find((line) => line.projectId === id(w.projects.p1))).toMatchObject({ active: false })
      expect(detail.lines.find((line) => line.projectId === id(w.projects.p2))).toMatchObject({ active: true })
      expect(detail.liveTotalAfter).toBe(10)
      expect(detail.exceedsThresholdNow).toBe(false)

      await expect(approveRequest(hr, id(request), {})).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        message: expect.stringContaining('AVO')
      })
    })

    it('answers NOT_FOUND for a request in another org or a malformed id', async () => {
      const request = await submit([{ projectId: id(w.projects.p1), newPercent: 60 }])
      const outsider = { userId: id(w.users.outsider), organizationId: String(w.otherOrg._id) }

      await expect(approveRequest(outsider, id(request), {})).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(approveRequest(hr, 'nope', {})).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(approveRequest(hr, String(new mongoose.Types.ObjectId()), {})).rejects.toMatchObject({
        code: 'NOT_FOUND'
      })
    })
  })

  describe('reject and cancel', () => {
    it('rejects with a note and notifies the requester; nothing applied', async () => {
      const request = await submit([{ projectId: id(w.projects.p1), newPercent: 60 }])

      await expect(rejectRequest(hr, id(request), '  Not this quarter ')).resolves.toEqual({ status: 'rejected' })
      await flush()

      const stored: any = await AllocationRequest.findById(request._id).lean()
      expect(stored).toMatchObject({ status: 'rejected', decisionNote: 'Not this quarter' })
      expect(await percentOn(w.projects.p1)).toBe(0)
      expect(await AllocationHistory.countDocuments({})).toBe(0)
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        id(w.users.pm),
        w.organizationId,
        expect.objectContaining({ data: expect.objectContaining({ action: 'rejected' }) })
      )
    })

    it('allows a new request once the previous one was rejected', async () => {
      const request = await submit([{ projectId: id(w.projects.p1), newPercent: 60 }])
      await rejectRequest(hr, id(request))

      await expect(submit([{ projectId: id(w.projects.p1), newPercent: 30 }])).resolves.toBeDefined()
    })

    it('refuses deciding a request twice', async () => {
      const request = await submit([{ projectId: id(w.projects.p1), newPercent: 60 }])
      await rejectRequest(hr, id(request))

      await expect(approveRequest(hr, id(request), {})).rejects.toMatchObject({ code: 'REQUEST_NOT_PENDING' })
      await expect(rejectRequest(hr, id(request))).rejects.toMatchObject({ code: 'REQUEST_NOT_PENDING' })
    })

    it('lets only the requester cancel, and not after a decision', async () => {
      const request = await submit([{ projectId: id(w.projects.p1), newPercent: 60 }])
      const otherPm = { userId: id(w.users.otherPm), organizationId: w.organizationId }

      await expect(cancelRequest(otherPm, id(request))).rejects.toMatchObject({ code: 'FORBIDDEN' })
      await expect(cancelRequest(pm, id(request))).resolves.toEqual({ status: 'cancelled' })
      await expect(cancelRequest(pm, id(request))).rejects.toMatchObject({ code: 'REQUEST_NOT_PENDING' })
    })
  })

  describe('listRequests', () => {
    it('lists newest first and filters by status and requester', async () => {
      const first = await submit([{ projectId: id(w.projects.p1), newPercent: 30 }])
      await rejectRequest(hr, id(first))
      const second = await submit([{ projectId: id(w.projects.p1), newPercent: 40 }])
      const third = await submit(
        [{ projectId: id(w.projects.p2), newPercent: 20 }],
        { userId: id(w.users.otherPm), organizationId: w.organizationId },
        id(w.users.qa)
      )

      const all = await listRequests(w.organizationId, { page: 1, limit: 10 })
      expect(all.total).toBe(3)
      expect(all.items.map((item) => item._id)).toEqual([id(third), id(second), id(first)])
      expect(all.items[0]).toMatchObject({
        member: { name: 'Nadeeshani Tester' },
        requestedBy: { name: 'Peter Tester', roleLabel: 'Project Manager' },
        lines: [{ projectName: 'BaseNeo SaaS', previousPercent: 0, newPercent: 20 }]
      })

      const pending = await listRequests(w.organizationId, { status: 'pending', page: 1, limit: 10 })
      expect(pending.items.map((item) => item._id).sort()).toEqual([id(second), id(third)].sort())

      const mine = await listRequests(w.organizationId, { requestedBy: id(w.users.pm), page: 1, limit: 10 })
      expect(mine.items.map((item) => item._id)).toEqual([id(second), id(first)])
    })
  })
})
