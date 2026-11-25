/**
 * The resource allocation routes: authentication, the permission each route
 * is gated on, and how a caller's permissions pick the service path.
 *
 * Services are mocked — their behaviour is proven in
 * `src/lib/resource-allocation/__tests__`. This suite is about the HTTP edge.
 */
import fs from 'fs'
import path from 'path'

import { NextRequest } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'

const USER = '5f00000000000000000000bb'
const ORG = '5f00000000000000000000aa'
const REQUEST_ID = '5f00000000000000000000cc'
const MEMBER = '5f00000000000000000000dd'

jest.mock('@/lib/db-config', () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }))

const mockAuth = jest.fn()
jest.mock('@/lib/auth-utils', () => ({ authenticateUser: () => mockAuth() }))

const mockPermissions = jest.fn()
jest.mock('@/lib/permissions/permission-service', () => ({
  PermissionService: { getUserPermissions: () => mockPermissions() }
}))

const allocation = {
  directChange: jest.fn(),
  getMemberAllocations: jest.fn(),
  getThreshold: jest.fn(),
  setThreshold: jest.fn()
}
jest.mock('@/lib/resource-allocation/allocation-service', () => allocation)

const requests = {
  createRequest: jest.fn(),
  getRequestDetail: jest.fn(),
  approveRequest: jest.fn(),
  rejectRequest: jest.fn(),
  cancelRequest: jest.fn(),
  listRequests: jest.fn()
}
jest.mock('@/lib/resource-allocation/request-service', () => requests)

const sheet = { loadSheet: jest.fn(), loadHistory: jest.fn(), sheetToCsv: jest.fn() }
jest.mock('@/lib/resource-allocation/sheet-service', () => sheet)

const routes = {
  sheet: require('@/app/api/resource-allocations/route'),
  member: require('@/app/api/resource-allocations/members/[userId]/route'),
  changes: require('@/app/api/resource-allocations/changes/route'),
  requests: require('@/app/api/resource-allocations/requests/route'),
  request: require('@/app/api/resource-allocations/requests/[id]/route'),
  approve: require('@/app/api/resource-allocations/requests/[id]/approve/route'),
  reject: require('@/app/api/resource-allocations/requests/[id]/reject/route'),
  cancel: require('@/app/api/resource-allocations/requests/[id]/cancel/route'),
  history: require('@/app/api/resource-allocations/history/route'),
  export: require('@/app/api/resource-allocations/export/route'),
  settings: require('@/app/api/resource-allocations/settings/route')
}

const ROUTE_FILES = [
  'route.ts',
  'members/[userId]/route.ts',
  'changes/route.ts',
  'requests/route.ts',
  'requests/[id]/route.ts',
  'requests/[id]/approve/route.ts',
  'requests/[id]/reject/route.ts',
  'requests/[id]/cancel/route.ts',
  'history/route.ts',
  'export/route.ts',
  'settings/route.ts'
]

const {
  RESOURCE_ALLOCATION_VIEW: VIEW,
  RESOURCE_ALLOCATION_MANAGE: MANAGE,
  RESOURCE_ALLOCATION_REQUEST: REQUEST,
  RESOURCE_ALLOCATION_APPROVE: APPROVE,
  RESOURCE_ALLOCATION_VIEW_HISTORY: HISTORY
} = Permission

const HR = [VIEW, MANAGE, APPROVE, HISTORY]
const PM = [VIEW, REQUEST, HISTORY]
const TEAM_MEMBER = [VIEW]
const CLIENT: Permission[] = []

function as(permissions: Permission[]) {
  mockAuth.mockResolvedValue({ user: { id: USER, organization: ORG, email: 'x@y.z', role: 'x' } })
  mockPermissions.mockResolvedValue({ globalPermissions: permissions, projectPermissions: new Map(), projectRoles: new Map() })
}

const get = (url = 'http://localhost/api/resource-allocations') => new NextRequest(url)
const post = (body: unknown = {}, method = 'POST') =>
  new NextRequest('http://localhost/api/resource-allocations', { method, body: JSON.stringify(body) })

describe('resource allocation routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    as(HR)
  })

  it('every route file exports force-dynamic and goes through withRaPermission', () => {
    for (const file of ROUTE_FILES) {
      const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/resource-allocations', file), 'utf8')
      expect(source).toContain('withRaPermission')
    }
    for (const route of Object.values(routes)) {
      expect(route.dynamic).toBe('force-dynamic')
    }
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ error: 'No authentication tokens', status: 401 })
    const response = await routes.sheet.GET(get())
    expect(response.status).toBe(401)
  })

  it('GET / is allowed for a team member (VIEW) and passes the query through', async () => {
    as(TEAM_MEMBER)
    sheet.loadSheet.mockResolvedValue({ rows: [] })

    const response = await routes.sheet.GET(
      get('http://localhost/api/resource-allocations?q=dul&role=QA%20Engineer&status=pending&page=2&limit=20')
    )

    expect(response.status).toBe(200)
    expect(sheet.loadSheet).toHaveBeenCalledWith(ORG, {
      q: 'dul',
      role: 'QA Engineer',
      project: undefined,
      status: 'pending',
      page: 2,
      limit: 20
    })
    expect(await response.json()).toEqual({ success: true, data: { rows: [] } })
  })

  it('GET / refuses a client with 403', async () => {
    as(CLIENT)
    const response = await routes.sheet.GET(get())
    expect(response.status).toBe(403)
    expect(sheet.loadSheet).not.toHaveBeenCalled()
  })

  it('GET / ignores an unknown status filter', async () => {
    sheet.loadSheet.mockResolvedValue({ rows: [] })
    await routes.sheet.GET(get('http://localhost/api/resource-allocations?status=bogus'))
    expect(sheet.loadSheet.mock.calls[0][1].status).toBeUndefined()
  })

  it('caps the page size', async () => {
    sheet.loadSheet.mockResolvedValue({ rows: [] })
    await routes.sheet.GET(get('http://localhost/api/resource-allocations?limit=5000&page=-3'))
    expect(sheet.loadSheet.mock.calls[0][1]).toMatchObject({ page: 1, limit: 100 })
  })

  it('GET /members/[userId] reads one member', async () => {
    as(TEAM_MEMBER)
    allocation.getMemberAllocations.mockResolvedValue({ total: 50 })
    const response = await routes.member.GET(get(), { params: { userId: MEMBER } })
    expect(response.status).toBe(200)
    expect(allocation.getMemberAllocations).toHaveBeenCalledWith(ORG, MEMBER)
  })

  it('POST /changes applies directly for MANAGE holders, even if they also hold REQUEST', async () => {
    as([...HR, REQUEST])
    allocation.directChange.mockResolvedValue({ mode: 'applied', totalAfter: 90, addedToProjects: [] })
    const body = { memberId: MEMBER, lines: [{ projectId: 'p', newPercent: 10 }], reason: 'x' }

    const response = await routes.changes.POST(post(body))

    expect(response.status).toBe(201)
    expect(allocation.directChange).toHaveBeenCalledWith({ userId: USER, organizationId: ORG }, body)
    expect(requests.createRequest).not.toHaveBeenCalled()
  })

  it('POST /changes creates a request for REQUEST-only holders', async () => {
    as(PM)
    requests.createRequest.mockResolvedValue({ _id: REQUEST_ID })

    const response = await routes.changes.POST(post({ memberId: MEMBER, lines: [], reason: 'x' }))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ success: true, data: { mode: 'requested', requestId: REQUEST_ID } })
    expect(allocation.directChange).not.toHaveBeenCalled()
  })

  it('POST /changes is 403 for a team member', async () => {
    as(TEAM_MEMBER)
    const response = await routes.changes.POST(post({}))
    expect(response.status).toBe(403)
  })

  it('history, requests and export are 403 for a team member (no VIEW_HISTORY)', async () => {
    as(TEAM_MEMBER)
    expect((await routes.history.GET(get())).status).toBe(403)
    expect((await routes.requests.GET(get())).status).toBe(403)
    expect((await routes.request.GET(get(), { params: { id: REQUEST_ID } })).status).toBe(403)
    expect((await routes.export.GET(get())).status).toBe(403)
  })

  it('GET /requests shows approvers every request', async () => {
    requests.listRequests.mockResolvedValue({ items: [], total: 0 })
    await routes.requests.GET(get('http://localhost/api/resource-allocations/requests?status=pending'))
    expect(requests.listRequests).toHaveBeenCalledWith(ORG, { status: 'pending', requestedBy: undefined, page: 1, limit: 10 })
  })

  it('GET /requests scopes non-approvers to their own requests', async () => {
    as(PM)
    requests.listRequests.mockResolvedValue({ items: [], total: 0 })
    await routes.requests.GET(get())
    expect(requests.listRequests).toHaveBeenCalledWith(ORG, expect.objectContaining({ requestedBy: USER }))
  })

  it('GET /requests/[id] is 404 to a PM who is not the requester', async () => {
    as(PM)
    requests.getRequestDetail.mockResolvedValue({ requestedBy: { _id: 'someone-else' } })
    const response = await routes.request.GET(get(), { params: { id: REQUEST_ID } })
    expect(response.status).toBe(404)
  })

  it('GET /requests/[id] is visible to the requester', async () => {
    as(PM)
    requests.getRequestDetail.mockResolvedValue({ requestedBy: { _id: USER } })
    const response = await routes.request.GET(get(), { params: { id: REQUEST_ID } })
    expect(response.status).toBe(200)
  })

  it('approve passes acknowledgeStale through; PMs cannot approve', async () => {
    requests.approveRequest.mockResolvedValue({ status: 'approved', totalAfter: 60 })
    const response = await routes.approve.POST(post({ acknowledgeStale: true }), { params: { id: REQUEST_ID } })
    expect(response.status).toBe(200)
    expect(requests.approveRequest).toHaveBeenCalledWith({ userId: USER, organizationId: ORG }, REQUEST_ID, {
      acknowledgeStale: true
    })

    as(PM)
    expect((await routes.approve.POST(post({}), { params: { id: REQUEST_ID } })).status).toBe(403)
    expect((await routes.reject.POST(post({}), { params: { id: REQUEST_ID } })).status).toBe(403)
  })

  it('reject passes the note through', async () => {
    requests.rejectRequest.mockResolvedValue({ status: 'rejected' })
    await routes.reject.POST(post({ note: 'No' }), { params: { id: REQUEST_ID } })
    expect(requests.rejectRequest).toHaveBeenCalledWith({ userId: USER, organizationId: ORG }, REQUEST_ID, 'No')
  })

  it('cancel is available to PMs', async () => {
    as(PM)
    requests.cancelRequest.mockResolvedValue({ status: 'cancelled' })
    const response = await routes.cancel.POST(post(), { params: { id: REQUEST_ID } })
    expect(response.status).toBe(200)
  })

  it('maps OVER_THRESHOLD to 422 with details', async () => {
    const { ResourceAllocationError } = jest.requireActual('@/lib/resource-allocation/errors')
    allocation.directChange.mockRejectedValue(
      new ResourceAllocationError('OVER_THRESHOLD', 'Allocation exceeds available capacity by 20%.', {
        totalAfter: 120,
        threshold: 100,
        exceedsBy: 20
      })
    )

    const response = await routes.changes.POST(post({}))

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      error: {
        code: 'OVER_THRESHOLD',
        message: 'Allocation exceeds available capacity by 20%.',
        details: { totalAfter: 120, threshold: 100, exceedsBy: 20 }
      }
    })
  })

  it('hides unexpected errors behind a 500', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    sheet.loadSheet.mockRejectedValue(new Error('boom'))
    const response = await routes.sheet.GET(get())
    expect(response.status).toBe(500)
    expect((await response.json()).error.code).toBe('INTERNAL_ERROR')
    spy.mockRestore()
  })

  it('export sets text/csv and an attachment filename, with every row', async () => {
    sheet.loadSheet.mockResolvedValue({ rows: [] })
    sheet.sheetToCsv.mockReturnValue('Employee\r\n')

    const response = await routes.export.GET(get())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="resource-allocation-\d{4}-\d{2}-\d{2}\.csv"$/)
    expect(await response.text()).toBe('Employee\r\n')
    expect(sheet.loadSheet.mock.calls[0][1].limit).toBeGreaterThanOrEqual(100000)
  })

  it('GET /settings reads the threshold for any viewer', async () => {
    as(TEAM_MEMBER)
    allocation.getThreshold.mockResolvedValue(100)
    const response = await routes.settings.GET(get())
    expect(await response.json()).toEqual({ success: true, data: { overAllocationThresholdPercent: 100 } })
  })

  it('PUT /settings is 403 for a PM and 200 for HR', async () => {
    as(PM)
    expect((await routes.settings.PUT(post({ overAllocationThresholdPercent: 120 }, 'PUT'))).status).toBe(403)

    as(HR)
    allocation.setThreshold.mockResolvedValue(120)
    const response = await routes.settings.PUT(post({ overAllocationThresholdPercent: 120 }, 'PUT'))
    expect(response.status).toBe(200)
    expect(allocation.setThreshold).toHaveBeenCalledWith(ORG, 120)
  })
})
