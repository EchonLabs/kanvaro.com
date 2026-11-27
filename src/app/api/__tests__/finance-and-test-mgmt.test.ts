/**
 * Decision record F8: the finance and test-management routes had not been
 * permission-reviewed. Gaps found and closed:
 * - test case / plan / suite lists checked no permission and returned the
 *   whole organisation to roles that hold no test read permission;
 * - budget and burn-rate reads used project:read, which every role holds
 *   globally, and the budget list without a project returned every entry;
 * - expenses could be created/edited/deleted with project access alone;
 * - the financial report and its export covered every project (the export had
 *   no organisation filter at all) and showed income without
 *   financial:view_income.
 */
import { NextRequest } from 'next/server'
import { ProjectRole } from '@/lib/permissions/permission-definitions'

afterEach(() => jest.resetModules())

const ME = { id: 'u1', organization: 'org1', role: 'team_member' }

/** Query chain resolving to `value`, recording .find filters elsewhere. */
const chain = (value: any): any => {
  const c: any = {}
  for (const m of ['populate', 'select', 'sort', 'skip', 'limit', 'lean']) c[m] = () => c
  c.then = (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject)
  return c
}

function mockAuth(role = 'team_member') {
  jest.doMock('@/lib/db-config', () => ({ __esModule: true, default: async () => undefined, connectDB: async () => undefined }))
  jest.doMock('@/lib/auth-utils', () => ({ authenticateUser: async () => ({ user: { ...ME, role } }) }))
}

/** PermissionService with fixed answers. */
function mockPermissions(opts: {
  projectRoles?: Record<string, string>
  accessible?: string[]
  granted?: string[]
}) {
  const projectRoles = new Map(Object.entries(opts.projectRoles || {}))
  const accessible = opts.accessible || []
  const granted = new Set(opts.granted || [])
  jest.doMock('@/lib/permissions/permission-service', () => ({
    PermissionService: {
      getUserPermissions: async () => ({ globalPermissions: [], projectPermissions: new Map(), projectRoles, userRole: ME.role }),
      canAccessProject: async (_u: string, p: string) => accessible.includes(p),
      getAccessibleProjects: async () => accessible,
      hasPermission: async (_u: string, perm: string) => granted.has(perm)
    }
  }))
}

describe('resolveTestListProjectFilter', () => {
  function load(hasRead: boolean, projectRoles: Record<string, string>) {
    jest.doMock('@/lib/permissions/test-permission-helper', () => ({ hasTestPermission: async () => hasRead }))
    mockPermissions({ projectRoles })
    return require('@/lib/test-management-scope')
  }

  it('gives holders of the read permission every project (unchanged)', async () => {
    const { resolveTestListProjectFilter } = load(true, {})
    expect(await resolveTestListProjectFilter({ user: ME, readPermission: 'test_case:read' })).toEqual({ filter: undefined })
  })

  it('limits everyone else to projects where they work, excluding viewer and client roles', async () => {
    const { resolveTestListProjectFilter } = load(false, {
      p1: ProjectRole.PROJECT_MEMBER,
      p2: ProjectRole.PROJECT_TESTER,
      p3: ProjectRole.PROJECT_VIEWER,
      p4: ProjectRole.PROJECT_CLIENT
    })
    expect(await resolveTestListProjectFilter({ user: ME, readPermission: 'test_case:read' }))
      .toEqual({ filter: { $in: ['p1', 'p2'] } })
  })

  it('refuses a requested project outside that set', async () => {
    const { resolveTestListProjectFilter } = load(false, { p1: ProjectRole.PROJECT_MEMBER })
    const result = await resolveTestListProjectFilter({ user: ME, readPermission: 'test_case:read', requestedProjectId: 'p9' })
    expect(result.error.status).toBe(403)
  })
})

describe.each([
  ['test-cases', 'TestCase', 'test_case:read'],
  ['test-plans', 'TestPlan', 'test_plan:read'],
  ['test-suites', 'TestSuite', 'test_suite:read']
])('GET /api/%s', (path, modelName) => {
  function load(hasRead: boolean) {
    mockAuth()
    mockPermissions({ projectRoles: { p1: ProjectRole.PROJECT_MEMBER } })
    jest.doMock('@/lib/permissions/test-permission-helper', () => ({ hasTestPermission: async () => hasRead }))
    const filters: any[] = []
    const model = { find: (q: any) => { filters.push(q); return chain([]) }, countDocuments: async () => 0 }
    jest.doMock('@/models', () => ({ TestCase: model, TestPlan: model, TestSuite: model, Project: {} }))
    return { route: require(`@/app/api/${path}/route`), filters }
  }

  it(`limits a caller without the ${modelName} read permission to their projects`, async () => {
    const { route, filters } = load(false)
    await route.GET(new NextRequest(`http://localhost/api/${path}`))
    expect(filters[0]).toMatchObject({ organization: 'org1', project: { $in: ['p1'] } })
  })

  it('refuses a project the caller does not work on', async () => {
    const { route, filters } = load(false)
    const res = await route.GET(new NextRequest(`http://localhost/api/${path}?projectId=p9`))
    expect(res.status).toBe(403)
    expect(filters).toHaveLength(0)
  })

  it('keeps the whole organisation for holders of the read permission', async () => {
    const { route, filters } = load(true)
    await route.GET(new NextRequest(`http://localhost/api/${path}`))
    expect(filters[0].project).toBeUndefined()
  })
})

describe('GET /api/budget and /api/burn-rate', () => {
  function loadBudget() {
    mockAuth()
    mockPermissions({ accessible: ['p1'] })
    const filters: any[] = []
    jest.doMock('@/models/BudgetEntry', () => ({
      BudgetEntry: { find: (q: any) => { filters.push(q); return chain([]) }, countDocuments: async () => 0 }
    }))
    jest.doMock('@/models/Project', () => ({ Project: { findById: async (id: string) => ({ _id: id }) } }))
    jest.doMock('@/models/User', () => ({ User: {} }))
    return { route: require('@/app/api/budget/route'), filters }
  }

  it('budget list without a project covers only accessible projects (it listed every entry)', async () => {
    const { route, filters } = loadBudget()
    await route.GET(new NextRequest('http://localhost/api/budget'))
    expect(filters[0].project).toEqual({ $in: ['p1'] })
  })

  it('budget list for an inaccessible project is refused', async () => {
    const { route, filters } = loadBudget()
    expect((await route.GET(new NextRequest('http://localhost/api/budget?projectId=p9'))).status).toBe(403)
    expect(filters).toHaveLength(0)
  })

  it('burn-rate for an inaccessible project is refused', async () => {
    mockAuth()
    mockPermissions({ accessible: ['p1'] })
    jest.doMock('@/models/BurnRate', () => ({ BurnRate: { find: () => chain([]) } }))
    const route = require('@/app/api/burn-rate/route')
    expect((await route.GET(new NextRequest('http://localhost/api/burn-rate?projectId=p9'))).status).toBe(403)
  })
})

describe('/api/projects/:id/expenses writes', () => {
  function load(granted: string[]) {
    mockAuth()
    mockPermissions({ accessible: ['p1'], granted })
    const create = jest.fn()
    jest.doMock('@/models/Expense', () => {
      const Expense: any = jest.fn().mockImplementation(() => ({ save: create }))
      Expense.findOne = async () => null
      Expense.findById = async () => null
      Expense.deleteOne = async () => ({})
      return { Expense }
    })
    jest.doMock('@/models/Project', () => ({ Project: { findById: () => chain({ _id: 'p1', settings: { allowExpenseTracking: true } }) } }))
    jest.doMock('@/models/Organization', () => ({ Organization: { findById: async () => ({ currency: 'USD' }) } }))
    return { route: require('@/app/api/projects/[id]/expenses/route'), create }
  }

  const params = { params: { id: 'p1' } }

  it.each(['POST', 'PUT', 'DELETE'] as const)('%s is refused with project access but no financial:create_expense', async (method) => {
    const { route, create } = load([])
    const url = method === 'DELETE' ? 'http://localhost/x?expenseId=e1' : 'http://localhost/x'
    const req = new NextRequest(url, { method, body: method === 'DELETE' ? undefined : JSON.stringify({ name: 'Lunch', amount: 10 }) })
    expect((await route[method](req, params)).status).toBe(403)
    expect(create).not.toHaveBeenCalled()
  })

  it('POST passes the permission check with financial:create_expense', async () => {
    const { route } = load(['financial:create_expense'])
    const req = new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({}) })
    expect((await route.POST(req, params)).status).not.toBe(403)
  })
})

describe('GET /api/reports/financial and its export', () => {
  function loadReport(granted: string[]) {
    mockAuth()
    mockPermissions({ accessible: ['64b0000000000000000000a1'], granted })
    jest.doMock('@/lib/permissions/permission-utils', () => ({ hasPermission: async () => true }))
    const projectFilters: any[] = []
    const incomeMatches: any[] = []
    jest.doMock('@/models/registry', () => ({}))
    jest.doMock('@/models/Project', () => ({ Project: { find: (q: any) => { projectFilters.push(q); return chain([]) } } }))
    jest.doMock('@/models/BudgetEntry', () => ({ BudgetEntry: { find: () => chain([]), aggregate: async () => [] } }))
    jest.doMock('@/models/Expense', () => ({ Expense: { aggregate: async () => [], find: () => chain([]) } }))
    jest.doMock('@/models/ProjectIncome', () => ({
      ProjectIncome: { aggregate: async (pipeline: any[]) => { incomeMatches.push(pipeline[0].$match); return [] } }
    }))
    return { route: require('@/app/api/reports/financial/route'), projectFilters, incomeMatches }
  }

  it('covers only accessible projects', async () => {
    const { route, projectFilters } = loadReport([])
    await route.GET(new NextRequest('http://localhost/api/reports/financial'))
    expect(projectFilters[0]._id.$in.map(String)).toEqual(['64b0000000000000000000a1'])
  })

  it('refuses a project filter outside the accessible set', async () => {
    const { route } = loadReport([])
    const res = await route.GET(new NextRequest('http://localhost/api/reports/financial?project=64b0000000000000000000ff'))
    expect(res.status).toBe(403)
  })

  it('hides income without financial:view_income', async () => {
    const { route, incomeMatches } = loadReport([])
    await route.GET(new NextRequest('http://localhost/api/reports/financial'))
    expect(incomeMatches.length).toBeGreaterThan(0)
    for (const match of incomeMatches) expect(match.project).toEqual({ $in: [] })
  })

  it('export is scoped to accessible projects (it had no filter at all)', async () => {
    mockAuth()
    mockPermissions({ accessible: ['p1'] })
    jest.doMock('@/lib/permissions/permission-utils', () => ({ hasPermission: async () => true }))
    const filters: any[] = []
    jest.doMock('@/models/BudgetEntry', () => ({ BudgetEntry: { find: (q: any) => { filters.push(q); return chain([]) } } }))
    jest.doMock('@/models/Project', () => ({ Project: {} }))
    const route = require('@/app/api/reports/financial/export/route')
    await route.GET(new NextRequest('http://localhost/x?format=json&search=' + encodeURIComponent('a.*')))
    expect(filters[0].project).toEqual({ $in: ['p1'] })
    expect(filters[0].$or[0].description.$regex).toBe('a\\.\\*')
  })
})
