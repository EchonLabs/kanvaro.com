/**
 * `/api/projects/:id/standup-settings` â€” the estimation unit (PLN-10/13).
 *
 * The unit is a plain enum on the settings document, but two things around it
 * need pinning: the PUT must refuse a value the poker route would choke on
 * later, and the GET must report story points for a document saved before the
 * field existed (a lean read skips schema defaults), or the settings screen
 * shows neither option selected.
 */
import { NextRequest } from 'next/server'

type LoadOptions = {
  stored?: Record<string, unknown> | null
}

function loadRoute({ stored = null }: LoadOptions = {}) {
  jest.resetModules()

  const findOneAndUpdate = jest.fn((_query: any, update: any) => ({
    lean: async () => ({ _id: 'settings-1', ...(stored ?? {}), ...update.$set })
  }))

  jest.doMock('@/lib/standup/route-helpers', () => {
    const actual = jest.requireActual('@/lib/standup/route-helpers')
    const { toErrorResponse } = jest.requireActual('@/lib/standup/errors')
    const { NextResponse } = jest.requireActual('next/server')
    return {
      ...actual,
      withStandupPermission: (_config: any, handler: any) => async (request: NextRequest) => {
        try {
          return await handler(request, {
            userId: 'pm-1',
            organizationId: 'org-1',
            projectId: 'project-1'
          })
        } catch (error) {
          const { status, body } = toErrorResponse(error)
          return NextResponse.json(body, { status })
        }
      }
    }
  })

  // The real model's constructor supplies GET's defaults; only the queries are
  // stubbed, so the defaults under test are the schema's own.
  jest.doMock('@/models/ProjectStandupSettings', () => {
    const actual = jest.requireActual('@/models/ProjectStandupSettings')
    const Model = actual.ProjectStandupSettings
    Model.findOne = jest.fn(() => ({ lean: async () => stored }))
    Model.findOneAndUpdate = findOneAndUpdate
    return { ...actual, ProjectStandupSettings: Model }
  })

  jest.doMock('@/lib/standup/audit', () => ({
    auditSnapshot: jest.fn(() => ({})),
    recordAudit: jest.fn(async () => undefined)
  }))

  jest.doMock('@/lib/standup/ceremonies', () => ({
    listUnattendedCeremonies: jest.fn(async () => [])
  }))

  const route = require('@/app/api/projects/[id]/standup-settings/route')
  return { GET: route.GET, PUT: route.PUT, findOneAndUpdate }
}

const put = (PUT: any, body: Record<string, unknown>) =>
  PUT(
    new NextRequest('http://localhost/api/projects/project-1/standup-settings', {
      method: 'PUT',
      body: JSON.stringify(body)
    }),
    { params: { id: 'project-1' } }
  )

const get = (GET: any) =>
  GET(new NextRequest('http://localhost/api/projects/project-1/standup-settings'), {
    params: { id: 'project-1' }
  })

describe('standup-settings route â€” estimation unit', () => {
  afterEach(() => {
    jest.resetModules()
  })

  it('saves hours', async () => {
    const { PUT, findOneAndUpdate } = loadRoute()

    const response = await put(PUT, { estimationUnit: 'hours' })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(findOneAndUpdate.mock.calls[0][1].$set.estimationUnit).toBe('hours')
    expect(body.data.settings.estimationUnit).toBe('hours')
  })

  it('saves story points', async () => {
    const { PUT, findOneAndUpdate } = loadRoute({ stored: { estimationUnit: 'hours' } })

    await put(PUT, { estimationUnit: 'story_points' })

    expect(findOneAndUpdate.mock.calls[0][1].$set.estimationUnit).toBe('story_points')
  })

  it('refuses an unknown unit without writing', async () => {
    const { PUT, findOneAndUpdate } = loadRoute()

    const response = await put(PUT, { estimationUnit: 'days' })
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error.code).toBe('VALIDATION_FAILED')
    expect(findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('leaves the unit alone when a save does not mention it', async () => {
    const { PUT, findOneAndUpdate } = loadRoute({ stored: { estimationUnit: 'hours' } })

    await put(PUT, { durationMinutes: 20 })

    expect(findOneAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('estimationUnit')
  })

  it('reports story points for a project that has never been configured', async () => {
    const { GET } = loadRoute({ stored: null })

    const body = await (await get(GET)).json()

    expect(body.data.settings.estimationUnit).toBe('story_points')
  })

  it('reports story points for a document saved before the unit existed', async () => {
    const { GET } = loadRoute({ stored: { _id: 'settings-1', pointsToHours: 4 } })

    const body = await (await get(GET)).json()

    expect(body.data.settings.estimationUnit).toBe('story_points')
  })

  it('reports the stored unit', async () => {
    const { GET } = loadRoute({ stored: { _id: 'settings-1', estimationUnit: 'hours' } })

    const body = await (await get(GET)).json()

    expect(body.data.settings.estimationUnit).toBe('hours')
  })
})
