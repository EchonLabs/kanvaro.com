/**
 * `GET /api/poker-sessions/:id/tasks/:taskId/reveal-state` (Task 1 —
 * dead/broken poker-reveal fix, spec §8.4, PLN-11).
 *
 * The reveal POST route is the only place vote values are computed, but its
 * response only ever reaches the single browser that called it — the
 * facilitator's. This route re-derives the same result from the same stored
 * `PokerVote` rows so any participant can poll for it.
 *
 * `withPokerPermission` is mocked directly rather than exercised for real —
 * the point of this test is the handler's own branching (revealed vs
 * not-revealed, vote re-derivation), not the shared permission wrapper,
 * which has its own coverage elsewhere. `GET` is bound to its handler once,
 * at module-import time, by calling `withPokerPermission(options, handler)`
 * — so varying the poker-session context between tests requires
 * `jest.resetModules()` and a fresh `require()` per test, not swapping a
 * mock's return value after the fact.
 */
import { NextRequest } from 'next/server'

type LoadOptions = {
  context: any
  votes?: Array<{ voter: string; card: string | number }>
}

function loadRoute({ context, votes = [] }: LoadOptions) {
  jest.resetModules()

  jest.doMock('@/lib/standup/route-helpers', () => {
    const actual = jest.requireActual('@/lib/standup/route-helpers')
    return {
      ...actual,
      withPokerPermission: (_config: any, handler: any) => async (request: NextRequest, _routeContext: any) =>
        handler(request, context)
    }
  })

  jest.doMock('@/models/PokerSession', () => ({
    PokerVote: {
      find: jest.fn(() => ({
        select: () => ({
          lean: async () => votes.map((vote) => ({ voter: { toString: () => vote.voter }, card: vote.card }))
        })
      }))
    }
  }))

  jest.doMock('@/models/User', () => ({
    User: { find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })) }
  }))

  return require('@/app/api/poker-sessions/[id]/tasks/[taskId]/reveal-state/route')
}

describe('GET /api/poker-sessions/:id/tasks/:taskId/reveal-state', () => {
  afterEach(() => {
    jest.resetModules()
  })

  it('returns revealed: false when the queue entry has not been revealed yet', async () => {
    const { GET } = loadRoute({
      context: {
        userId: 'user-1',
        pokerSession: { queue: [{ task: { toString: () => 'task-1' }, status: 'voting' }] },
        params: { taskId: 'task-1' }
      }
    })

    const response = await GET(new NextRequest('http://localhost/x'), { params: { id: 'session-1', taskId: 'task-1' } })
    const body = await response.json()
    expect(body.data.revealed).toBe(false)
  })

  it('returns revealed: false for a task not present in the queue at all', async () => {
    const { GET } = loadRoute({
      context: {
        userId: 'user-1',
        pokerSession: { queue: [] },
        params: { taskId: 'task-1' }
      }
    })

    const response = await GET(new NextRequest('http://localhost/x'), { params: { id: 'session-1', taskId: 'task-1' } })
    const body = await response.json()
    expect(body.data.revealed).toBe(false)
  })

  it('re-derives the vote spread from PokerVote rows once the entry is revealed', async () => {
    const { GET } = loadRoute({
      context: {
        userId: 'user-1',
        pokerSession: {
          _id: 'session-1',
          deckType: 'fibonacci',
          consensusRule: 'facilitator_decides',
          hideVoterIdentity: false,
          queue: [{ task: { toString: () => 'task-1' }, status: 'revealed', roundCount: 1 }]
        },
        params: { taskId: 'task-1' }
      },
      votes: [
        { voter: 'voter-1', card: 3 },
        { voter: 'voter-2', card: 5 }
      ]
    })

    const response = await GET(new NextRequest('http://localhost/x'), { params: { id: 'session-1', taskId: 'task-1' } })
    const body = await response.json()

    expect(body.data.revealed).toBe(true)
    expect(body.data.round).toBe(1)
    expect(body.data.votes).toHaveLength(2)
    expect(body.data.min).toBe(3)
    expect(body.data.max).toBe(5)
  })

  it('hides voter identity when the session has hideVoterIdentity set', async () => {
    const { GET } = loadRoute({
      context: {
        userId: 'user-1',
        pokerSession: {
          _id: 'session-1',
          deckType: 'fibonacci',
          consensusRule: 'facilitator_decides',
          hideVoterIdentity: true,
          queue: [{ task: { toString: () => 'task-1' }, status: 'revealed', roundCount: 1 }]
        },
        params: { taskId: 'task-1' }
      },
      votes: [{ voter: 'voter-1', card: 3 }]
    })

    const response = await GET(new NextRequest('http://localhost/x'), { params: { id: 'session-1', taskId: 'task-1' } })
    const body = await response.json()

    expect(body.data.votes[0].voterId).toBeNull()
    expect(body.data.votes[0].voterName).toBeNull()
  })
})
