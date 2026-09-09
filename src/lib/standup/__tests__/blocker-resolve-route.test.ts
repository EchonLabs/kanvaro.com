import { NextRequest } from 'next/server'
import { PATCH } from '@/app/api/standups/[id]/blockers/[blockerId]/route'

jest.mock('@/lib/standup/blocker-service', () => ({
  updateBlocker: jest.fn()
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
        params: context.params
      })
  }
})

import { updateBlocker } from '@/lib/standup/blocker-service'

describe('PATCH /api/standups/:id/blockers/:blockerId', () => {
  it('resolves a blocker with a note', async () => {
    ;(updateBlocker as jest.Mock).mockResolvedValue({ _id: 'blocker-1', status: 'resolved' })

    const request = new NextRequest('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved', resolutionNote: 'Vendor sandbox came back up this morning.' })
    })
    const response = await PATCH(request, { params: { id: 'standup-1', blockerId: 'blocker-1' } })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(updateBlocker).toHaveBeenCalledWith(
      expect.objectContaining({ blockerId: 'blocker-1', status: 'resolved' })
    )
    expect(body.data.status).toBe('resolved')
  })

  it('maps a too-short resolution note to a 4xx', async () => {
    const { StandupError } = jest.requireActual('@/lib/standup/errors')
    ;(updateBlocker as jest.Mock).mockRejectedValue(
      new StandupError('VALIDATION_FAILED', 'A resolution note needs at least 10 characters when resolving a blocker.')
    )

    const request = new NextRequest('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved', resolutionNote: 'ok' })
    })
    const response = await PATCH(request, { params: { id: 'standup-1', blockerId: 'blocker-1' } })
    expect(response.status).toBe(422)
  })

  it('accepts an owner-only update with no resolution note', async () => {
    ;(updateBlocker as jest.Mock).mockResolvedValue({ _id: 'blocker-1', status: 'open', owner: 'user-2' })

    const request = new NextRequest('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({ owner: 'user-2' })
    })
    const response = await PATCH(request, { params: { id: 'standup-1', blockerId: 'blocker-1' } })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(updateBlocker).toHaveBeenCalledWith(
      expect.objectContaining({ blockerId: 'blocker-1', owner: 'user-2', status: undefined, resolutionNote: undefined })
    )
    expect(body.data.owner).toBe('user-2')
  })
})
