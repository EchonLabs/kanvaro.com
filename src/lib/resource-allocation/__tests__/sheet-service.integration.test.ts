/**
 * The read side: the allocation sheet, the history trail and the CSV export.
 */
jest.mock('@/lib/notification-service', () => ({
  notificationService: {
    createNotification: jest.fn().mockResolvedValue(null),
    createBulkNotifications: jest.fn().mockResolvedValue([]),
    notifyProjectTeamMemberAdded: jest.fn().mockResolvedValue(undefined)
  }
}))
jest.mock('@/lib/activity-logger', () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }))

import { AllocationHistory } from '@/models/AllocationHistory'
import { AllocationRequest } from '@/models/AllocationRequest'
import { Project } from '@/models/Project'
import { ResourceAllocation } from '@/models/ResourceAllocation'
import { User } from '@/models/User'
import { CustomRole } from '@/models/CustomRole'

import { syncIndexes, useMongo } from '@/lib/standup/__tests__/helpers/mongo'

import { directChange } from '../allocation-service'
import { approveRequest, createRequest, rejectRequest } from '../request-service'
import { loadHistory, loadSheet, sheetToCsv } from '../sheet-service'
import { plant, seedWorld } from './helpers/fixtures'

type World = Awaited<ReturnType<typeof seedWorld>>

const id = (doc: { _id: unknown }) => String(doc._id)
const page = { page: 1, limit: 50 }

describe('sheet-service', () => {
  useMongo()

  let w: World

  beforeEach(async () => {
    await syncIndexes(ResourceAllocation, AllocationRequest)
    w = await seedWorld()
  })

  const rowOf = (sheet: Awaited<ReturnType<typeof loadSheet>>, user: { _id: unknown }) =>
    sheet.rows.find((row) => row.memberId === id(user))

  describe('loadSheet', () => {
    it('builds rows with per-project cells, totals, status and the pending request', async () => {
      await plant(w.org._id, w.users.member._id, w.projects.p1._id, 60, w.users.hr._id)
      await plant(w.org._id, w.users.member._id, w.projects.p2._id, 40, w.users.hr._id)
      await plant(w.org._id, w.users.qa._id, w.projects.p2._id, 30, w.users.hr._id)
      const request = await createRequest(
        { userId: id(w.users.pm), organizationId: w.organizationId },
        { memberId: id(w.users.qa), lines: [{ projectId: id(w.projects.p1), newPercent: 20 }], reason: 'Need QA' }
      )

      const sheet = await loadSheet(w.organizationId, page)

      expect(rowOf(sheet, w.users.member)).toMatchObject({
        name: 'Dulmi Tester',
        roleLabel: 'Team Member',
        cells: { [id(w.projects.p1)]: { percent: 60, onTeam: false }, [id(w.projects.p2)]: { percent: 40, onTeam: false } },
        total: 100,
        remaining: 0,
        status: 'full'
      })
      expect(rowOf(sheet, w.users.member)?.pendingRequest).toBeUndefined()
      expect(rowOf(sheet, w.users.qa)).toMatchObject({
        total: 30,
        status: 'partial',
        pendingRequest: { id: id(request), requestedBy: { _id: id(w.users.pm), name: 'Pamela Tester' } }
      })
      expect(sheet.threshold).toBe(100)
    })

    it('lists every active custom role in the by-role summary and the role filter, even with nobody assigned', async () => {
      await CustomRole.create({ name: 'Designer', description: 'UI work', permissions: [], organization: w.org._id, createdBy: w.users.admin._id })
      await CustomRole.create({ name: 'Old Role', description: 'Retired', permissions: [], organization: w.org._id, createdBy: w.users.admin._id, isActive: false })
      await CustomRole.create({ name: 'Foreign Role', description: 'Other org', permissions: [], organization: w.otherOrg._id, createdBy: w.users.outsider._id })

      const sheet = await loadSheet(w.organizationId, page)

      expect(sheet.byRole).toContainEqual({ roleLabel: 'Designer', resources: 0, allocated: 0, available: 0 })
      expect(sheet.roles).toContain('Designer')
      expect(sheet.byRole.map((role) => role.roleLabel)).not.toContain('Old Role')
      expect(sheet.roles).not.toContain('Foreign Role')
      // A custom role someone holds still appears once, with their numbers.
      expect(sheet.byRole.filter((role) => role.roleLabel === 'Resource Lead')).toEqual([
        { roleLabel: 'Resource Lead', resources: 1, allocated: 0, available: 100 }
      ])
      expect(sheet.kpis.totalResources).toBe(7)
    })

    it('labels custom roles by their name', async () => {
      const sheet = await loadSheet(w.organizationId, page)
      expect(rowOf(sheet, w.users.lead)?.roleLabel).toBe('Resource Lead')
      expect(sheet.roles).toContain('Resource Lead')
    })

    it('excludes inactive users, clients, viewers, account managers and other orgs', async () => {
      const sheet = await loadSheet(w.organizationId, page)
      const names = sheet.rows.map((row) => row.name)

      for (const who of ['inactive', 'client', 'viewer', 'accountManager', 'outsider'] as const) {
        expect(rowOf(sheet, w.users[who])).toBeUndefined()
      }
      expect(names).toHaveLength(7)
      expect(sheet.pagination).toEqual({ page: 1, limit: 50, total: 7, totalPages: 1 })
    })

    it('shows only active projects as columns and ignores inactive-project allocations in totals', async () => {
      await plant(w.org._id, w.users.member._id, w.projects.p1._id, 50, w.users.hr._id)
      await plant(w.org._id, w.users.member._id, w.projects.p3._id, 40, w.users.hr._id)

      const sheet = await loadSheet(w.organizationId, page)

      expect(sheet.projects.map((project) => project.name)).toEqual(['AVO', 'BaseNeo SaaS'])
      expect(rowOf(sheet, w.users.member)).toMatchObject({ total: 50 })
      expect(rowOf(sheet, w.users.member)?.cells[id(w.projects.p3)]).toBeUndefined()
    })

    it('computes KPIs and by-role over all resources even when rows are filtered', async () => {
      await plant(w.org._id, w.users.member._id, w.projects.p1._id, 100, w.users.hr._id)
      await plant(w.org._id, w.users.qa._id, w.projects.p1._id, 40, w.users.hr._id)

      const sheet = await loadSheet(w.organizationId, { ...page, q: 'dulmi' })

      expect(sheet.rows).toHaveLength(1)
      expect(sheet.kpis).toEqual({
        totalResources: 7,
        fullyAllocated: 1,
        partiallyAllocated: 1,
        unallocated: 5,
        overallocated: 0,
        availableCapacity: 560
      })
      expect(sheet.byRole.find((role) => role.roleLabel === 'Team Member')).toEqual({
        roleLabel: 'Team Member',
        resources: 1,
        allocated: 100,
        available: 0
      })
    })

    it('filters by q (name or email), role, project and status (incl. pending)', async () => {
      await plant(w.org._id, w.users.member._id, w.projects.p1._id, 100, w.users.hr._id)
      await plant(w.org._id, w.users.qa._id, w.projects.p2._id, 40, w.users.hr._id)
      await createRequest(
        { userId: id(w.users.pm), organizationId: w.organizationId },
        { memberId: id(w.users.hr), lines: [{ projectId: id(w.projects.p1), newPercent: 20 }], reason: 'x' }
      )

      const names = async (query: object) =>
        (await loadSheet(w.organizationId, { ...page, ...query })).rows.map((row) => row.name)

      expect(await names({ q: 'NADEESHANI' })).toEqual(['Nadeeshani Tester'])
      expect(await names({ q: w.users.qa.email })).toEqual(['Nadeeshani Tester'])
      expect(await names({ role: 'Project Manager' })).toEqual(['Pamela Tester', 'Peter Tester'])
      expect(await names({ project: id(w.projects.p2) })).toEqual(['Nadeeshani Tester'])
      expect(await names({ status: 'full' })).toEqual(['Dulmi Tester'])
      expect(await names({ status: 'partial' })).toEqual(['Nadeeshani Tester'])
      expect(await names({ status: 'pending' })).toEqual(['Hanna Tester'])
    })

    it('sorts rows by name and paginates', async () => {
      const first = await loadSheet(w.organizationId, { page: 1, limit: 3 })
      const second = await loadSheet(w.organizationId, { page: 3, limit: 3 })

      expect(first.rows.map((row) => row.name)).toEqual(['Admin Tester', 'Dulmi Tester', 'Hanna Tester'])
      expect(second.rows.map((row) => row.name)).toEqual(['Peter Tester'])
      expect(first.pagination).toEqual({ page: 1, limit: 3, total: 7, totalPages: 3 })
    })

    it('lists pending requests whose member has left the sheet, so they can still be decided', async () => {
      const request = await createRequest(
        { userId: id(w.users.pm), organizationId: w.organizationId },
        { memberId: id(w.users.member), lines: [{ projectId: id(w.projects.p1), newPercent: 20 }], reason: 'x' }
      )
      expect((await loadSheet(w.organizationId, page)).orphanedRequests).toEqual([])

      await User.updateOne({ _id: w.users.member._id }, { isActive: false })

      expect((await loadSheet(w.organizationId, page)).orphanedRequests).toEqual([
        {
          id: id(request),
          memberName: 'Dulmi Tester',
          requestedBy: { _id: id(w.users.pm), name: 'Pamela Tester' }
        }
      ])
    })

    it('marks onTeam=false for a member removed from the team elsewhere', async () => {
      await directChange(
        { userId: id(w.users.hr), organizationId: w.organizationId },
        { memberId: id(w.users.member), lines: [{ projectId: id(w.projects.p1), newPercent: 30 }], reason: 'x' }
      )
      expect(rowOf(await loadSheet(w.organizationId, page), w.users.member)?.cells[id(w.projects.p1)].onTeam).toBe(true)

      await Project.updateOne({ _id: w.projects.p1._id }, { $pull: { teamMembers: { memberId: w.users.member._id } } })

      const cell = rowOf(await loadSheet(w.organizationId, page), w.users.member)?.cells[id(w.projects.p1)]
      expect(cell).toEqual({ percent: 30, onTeam: false })
    })
  })

  describe('loadHistory', () => {
    const hr = () => ({ userId: id(w.users.hr), organizationId: w.organizationId })
    const pm = () => ({ userId: id(w.users.pm), organizationId: w.organizationId })

    async function seedTrail() {
      for (const percent of [10, 20, 30]) {
        await directChange(hr(), {
          memberId: id(w.users.member),
          lines: [{ projectId: id(w.projects.p2), newPercent: percent }],
          reason: `Step ${percent}`
        })
      }
      const approved = await createRequest(pm(), {
        memberId: id(w.users.qa),
        lines: [
          { projectId: id(w.projects.p1), newPercent: 40 },
          { projectId: id(w.projects.p2), newPercent: 0 }
        ],
        reason: 'QA swap'
      })
      // qa holds 0% on p2 already, so only the p1 line is stored: one approved history row.
      await approveRequest(hr(), String(approved._id), {})
      const rejected = await createRequest(pm(), {
        memberId: id(w.users.member),
        lines: [{ projectId: id(w.projects.p1), newPercent: 50 }],
        reason: 'Want Dulmi'
      })
      await rejectRequest(hr(), String(rejected._id), 'No')
    }

    it('merges direct, approved and rejected entries newest first with paging', async () => {
      await seedTrail()

      const all = await loadHistory(w.organizationId, { page: 1, limit: 50 })
      expect(all.total).toBe(5)
      expect(all.items.map((item) => item.status)).toEqual(['rejected', 'approved', 'updated', 'updated', 'updated'])
      expect(all.items[0]).toMatchObject({
        member: { name: 'Dulmi Tester' },
        changedBy: { name: 'Pamela Tester', roleLabel: 'Project Manager' },
        project: { name: 'AVO' },
        previousPercent: 0,
        newPercent: 50,
        reason: 'Want Dulmi'
      })
      expect(all.items[1]).toMatchObject({
        changedBy: { name: 'Pamela Tester' },
        approvedBy: { name: 'Hanna Tester' },
        status: 'approved'
      })
      const dates = all.items.map((item) => new Date(item.date).getTime())
      expect([...dates].sort((a, b) => b - a)).toEqual(dates)

      const first = await loadHistory(w.organizationId, { page: 1, limit: 3 })
      const second = await loadHistory(w.organizationId, { page: 2, limit: 3 })
      expect(first.items).toHaveLength(3)
      expect(second.items).toHaveLength(2)
      expect([...first.items, ...second.items].map((item) => item.id)).toEqual(all.items.map((item) => item.id))
    })

    it('includes uploaded photos for the member and the person who made the change', async () => {
      await User.updateOne({ _id: w.users.member._id }, { avatar: '/api/uploads/avatars/dulmi.jpg' })
      await User.updateOne({ _id: w.users.hr._id }, { avatar: '/api/uploads/avatars/hanna.jpg' })
      await directChange(hr(), {
        memberId: id(w.users.member),
        lines: [{ projectId: id(w.projects.p1), newPercent: 10 }],
        reason: 'Photo check'
      })

      const [entry] = (await loadHistory(w.organizationId, { page: 1, limit: 5 })).items
      expect(entry.member.avatar).toBe('/api/uploads/avatars/dulmi.jpg')
      expect(entry.changedBy.avatar).toBe('/api/uploads/avatars/hanna.jpg')
    })

    it('shows the approver’s note on rejected entries', async () => {
      await seedTrail()

      const rejected = (await loadHistory(w.organizationId, { page: 1, limit: 50 })).items.find((item) => item.status === 'rejected')
      expect(rejected?.note).toBe('No')
    })

    it('searches by member, changer or project name', async () => {
      await seedTrail()

      expect((await loadHistory(w.organizationId, { q: 'nadeeshani', page: 1, limit: 50 })).items).toHaveLength(1)
      expect((await loadHistory(w.organizationId, { q: 'pamela', page: 1, limit: 50 })).items).toHaveLength(2)
      expect((await loadHistory(w.organizationId, { q: 'baseneo', page: 1, limit: 50 })).items).toHaveLength(3)
    })

    it('never shows another organisation\'s history', async () => {
      await seedTrail()
      await AllocationHistory.create({
        organization: w.otherOrg._id,
        member: w.users.outsider._id,
        project: w.projects.p5._id,
        changedBy: w.users.outsider._id,
        previousPercent: 0,
        newPercent: 10,
        reason: 'Foreign',
        kind: 'direct'
      })

      expect((await loadHistory(w.organizationId, { page: 1, limit: 50 })).total).toBe(5)
    })
  })

  describe('sheetToCsv', () => {
    it('neutralises cells that a spreadsheet would run as a formula', async () => {
      await User.updateOne({ _id: w.users.member._id }, { firstName: '=HYPERLINK("http://evil","x")' })
      await Project.updateOne({ _id: w.projects.p2._id }, { name: '+SUM(1)' })

      const csv = sheetToCsv(await loadSheet(w.organizationId, page))

      expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"") Tester"`)
      expect(csv.split('\r\n')[0]).toContain(",'+SUM(1),")
      expect(csv).not.toMatch(/(^|,)"?[=+@-]/m)
    })

    it('writes one row per resource with a Role column and escapes commas and quotes', async () => {
      await Project.updateOne({ _id: w.projects.p1._id }, { name: 'A, "B"' })
      await plant(w.org._id, w.users.member._id, w.projects.p1._id, 60, w.users.hr._id)

      const csv = sheetToCsv(await loadSheet(w.organizationId, page))
      const [header, ...lines] = csv.trim().split('\r\n')

      expect(header).toBe('Employee,Email,Role,"A, ""B""",BaseNeo SaaS,Total %,Remaining %,Status')
      expect(lines).toHaveLength(7)
      expect(lines.find((line) => line.startsWith('Dulmi Tester'))).toBe(
        `Dulmi Tester,${w.users.member.email},Team Member,60,0,60,40,Partially Allocated`
      )
    })
  })
})
