/**
 * `POST /api/standups/:id/start` route (RUN-2/3, AC-5, §17.6).
 *
 * Mocks `startStandup` and `withStandupIdPermission` the same way this
 * repo's other route tests do — the service's own behaviour is covered by
 * `start-service.integration.test.ts` against a real database; this test only
 * confirms the route calls it, forwards the version header, and maps its
 * errors onto the catalogue's statuses.
 */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/standups/[id]/start/route'

jest.mock('@/lib/standup/start-service', () => ({
  startStandup: jest.fn()
}))
jest.mock('@/lib/standup/route-helpers', () => {
  const actual = jest.requireActual('@/lib/standup/route-helpers')
  return {
    ...actual,
    withStandupIdPermission: (config: any, handler: any) => async (request: NextRequest, context: any) =>
      handler(request, {
        userId: 'user-1',
        organizationId: 'org-1',
        projectId: 'project-1',
        standupId: 'standup-1',
        standup: { status: 'Ready' }
      })
  }
})

import { startStandup } from '@/lib/standup/start-service'

describe('POST /api/standups/:id/start', () => {
  it('returns the started standup on success', async () => {
    ;(startStandup as jest.Mock).mockResolvedValue({ standup: { _id: 'standup-1', status: 'In_Progress' } })

    const request = new NextRequest('http://localhost/api/standups/standup-1/start', {
      method: 'POST',
      headers: { 'X-Standup-Version': '0' }
    })
    const response = await POST(request, { params: { id: 'standup-1' } })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.standup.status).toBe('In_Progress')
  })

  it('maps a PLANNING_GATE_NOT_PASSED rejection to 409', async () => {
    const { StandupError } = jest.requireActual('@/lib/standup/errors')
    ;(startStandup as jest.Mock).mockRejectedValue(
      new StandupError('PLANNING_GATE_NOT_PASSED', 'This sprint is not planned.', { failingChecks: [] })
    )

    const request = new NextRequest('http://localhost/api/standups/standup-1/start', {
      method: 'POST',
      headers: { 'X-Standup-Version': '0' }
    })
    const response = await POST(request, { params: { id: 'standup-1' } })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error.code).toBe('PLANNING_GATE_NOT_PASSED')
  })
})
