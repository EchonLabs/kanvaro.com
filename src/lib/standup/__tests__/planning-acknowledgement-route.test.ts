/**
 * `PATCH /api/sprints/:id/planning-session` — advisory acknowledgements (PLN-7).
 *
 * The screen kept acknowledgements in component state and the route only wrote
 * them onto `checklistResults`, which stays empty until completion. Any reload
 * — including the round trip through a checklist Fix — lost every tick.
 *
 * `withSprintPermission` is mocked as in `poker-session-unit-route.test.ts`;
 * the session itself is the real model against the in-memory database.
 */
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { SprintPlanningSession } from '@/models/SprintPlanningSession'

import { ids, useMongo } from './helpers/mongo'

const { organization, project, user } = ids
const sprintId = new mongoose.Types.ObjectId()

jest.mock('@/lib/standup/audit', () => ({ recordAudit: jest.fn() }))

jest.mock('@/lib/standup/route-helpers', () => {
  const actual = jest.requireActual('@/lib/standup/route-helpers')
  const { toErrorResponse } = jest.requireActual('@/lib/standup/errors')
  const { NextResponse } = jest.requireActual('next/server')
  return {
    ...actual,
    withSprintPermission: (_config: any, handler: any) => async (request: NextRequest) => {
      try {
        return await handler(request, {
          sprintId: String(sprintId),
          sprint: {},
          organizationId: String(organization),
          projectId: String(project),
          userId: String(user)
        })
      } catch (error) {
        const { status, body } = toErrorResponse(error)
        return NextResponse.json(body, { status })
      }
    }
  }
})

import { GET, PATCH } from '@/app/api/sprints/[id]/planning-session/route'

const patch = (body: Record<string, unknown>) =>
  (PATCH as any)(
    new NextRequest(`http://localhost/api/sprints/${sprintId}/planning-session`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    }),
    { params: { id: String(sprintId) } }
  )

const read = async () => {
  const response = await (GET as any)(
    new NextRequest(`http://localhost/api/sprints/${sprintId}/planning-session`),
    { params: { id: String(sprintId) } }
  )
  const body = await response.json()
  return (body.data.session.acknowledgements ?? []).map((entry: any) => entry.checkId)
}

describe('planning-session acknowledgements', () => {
  useMongo()

  beforeEach(async () => {
    await SprintPlanningSession.create({
      organization,
      project,
      sprint: sprintId,
      facilitator: user,
      participants: [user],
      createdBy: user
    })
  })

  it('keeps a tick on the open session, so a reload still shows it', async () => {
    const response = await patch({ acknowledgedCheckIds: ['PA-3'] })

    expect(response.status).toBe(200)
    expect(await read()).toEqual(['PA-3'])
  })

  it('treats the list as the whole set, so un-ticking is saved too', async () => {
    await patch({ acknowledgedCheckIds: ['PA-3', 'PA-4'] })
    await patch({ acknowledgedCheckIds: ['PA-4'] })
    expect(await read()).toEqual(['PA-4'])

    await patch({ acknowledgedCheckIds: [] })
    expect(await read()).toEqual([])
  })

  it('keeps the original author and time when the same tick is resent', async () => {
    await patch({ acknowledgedCheckIds: ['PA-3'] })
    const first = (await SprintPlanningSession.findOne({ sprint: sprintId }).lean()) as any

    await patch({ acknowledgedCheckIds: ['PA-3', 'PA-4'] })
    const second = (await SprintPlanningSession.findOne({ sprint: sprintId }).lean()) as any

    expect(second.acknowledgements[0].acknowledgedAt).toEqual(first.acknowledgements[0].acknowledgedAt)
  })

  it('refuses to acknowledge a blocking check', async () => {
    const response = await patch({ acknowledgedCheckIds: ['PC-3'] })

    expect(response.status).toBe(422)
    expect(await read()).toEqual([])
  })

  it('leaves acknowledgements alone when only the goal is saved', async () => {
    await patch({ acknowledgedCheckIds: ['PA-3'] })
    await patch({ sprintGoal: 'Ship the export pipeline to every customer' })

    expect(await read()).toEqual(['PA-3'])
  })
})
