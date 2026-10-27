/**
 * `GET /api/poker-sessions/:id/stream` and the broadcasts the write routes make.
 *
 * `withPokerPermission` is mocked (as in reveal-state-route.test.ts) — the
 * wrapper's org/permission checks have their own coverage; here we test the
 * handler: it refuses a finished session, registers the connection, and the
 * vote route still answers identically when broadcasting misbehaves.
 */
import { NextRequest } from 'next/server'

function loadStream(pokerSession: any) {
  jest.resetModules()
  jest.doMock('@/lib/standup/route-helpers', () => {
    const actual = jest.requireActual('@/lib/standup/route-helpers')
    return {
      ...actual,
      withPokerPermission: (_config: any, handler: any) => async (request: NextRequest) =>
        handler(request, { userId: 'u1', pokerSession, params: {} })
    }
  })
  return {
    route: require('@/app/api/poker-sessions/[id]/stream/route'),
    broadcaster: require('@/lib/poker-broadcaster')
  }
}

describe('GET /api/poker-sessions/:id/stream', () => {
  afterEach(() => jest.resetModules())

  it('refuses to stream a session that is no longer open', async () => {
    const { route } = loadStream({ _id: { toString: () => 's1' }, status: 'completed' })

    const response = await route.GET(new NextRequest('http://localhost/x'), { params: { id: 's1' } })

    expect(response.status).toBe(409)
  })

  it('opens an event stream, announces itself and registers for change signals', async () => {
    const { route, broadcaster } = loadStream({ _id: { toString: () => 's1' }, status: 'open' })
    const abort = new AbortController()

    const response = await route.GET(new NextRequest('http://localhost/x', { signal: abort.signal }), {
      params: { id: 's1' }
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(broadcaster.getPokerConnectionCount('s1')).toBe(1)

    const reader = response.body!.getReader()
    const first = new TextDecoder().decode((await reader.read()).value)
    expect(JSON.parse(first.replace(/^data: /, '').trim()).type).toBe('connected')

    broadcaster.broadcastPokerChange('s1', { reason: 'vote', taskId: 't1', round: 1 })
    const second = new TextDecoder().decode((await reader.read()).value)
    expect(JSON.parse(second.replace(/^data: /, '').trim())).toMatchObject({
      type: 'poker_changed',
      reason: 'vote'
    })

    abort.abort()
    expect(broadcaster.getPokerConnectionCount('s1')).toBe(0)
  })
})

describe('POST vote — signals the change, response unchanged', () => {
  afterEach(() => jest.resetModules())

  it('broadcasts a vote signal and still returns counts only', async () => {
    jest.resetModules()

    const entry = { task: { toString: () => 't1' }, status: 'voting', roundCount: 1 }
    const pokerSession = {
      _id: { toString: () => 's1' },
      status: 'open',
      deckType: 'fibonacci',
      allowRevote: true,
      hideVoterIdentity: false,
      autoRevealOnAllVoted: true,
      participants: [{ toString: () => 'u1' }, { toString: () => 'u2' }],
      queue: [entry],
      save: jest.fn()
    }

    jest.doMock('@/lib/standup/route-helpers', () => {
      const actual = jest.requireActual('@/lib/standup/route-helpers')
      return {
        ...actual,
        withPokerPermission: (_config: any, handler: any) => async (request: NextRequest) =>
          handler(request, { userId: 'u1', pokerSession, params: { taskId: 't1' } })
      }
    })
    jest.doMock('@/models/PokerSession', () => ({
      PokerVote: {
        findOneAndUpdate: jest.fn(async () => ({})),
        find: jest.fn(() => ({
          select: () => ({ lean: async () => [{ voter: { toString: () => 'u1' } }] })
        }))
      }
    }))
    // Error-swallowing lives in the broadcaster itself (see
    // poker-broadcaster.test.ts); here we only check the route signals the
    // right change and its count-only response is untouched.
    jest.doMock('@/lib/poker-broadcaster', () => ({
      broadcastPokerChange: jest.fn(() => 0)
    }))

    const { POST } = require('@/app/api/poker-sessions/[id]/tasks/[taskId]/vote/route')
    const { broadcastPokerChange } = require('@/lib/poker-broadcaster')

    const response = await POST(
      new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ card: 5 }) }),
      {}
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({ round: 1, voted: 1, expected: 2, readyToReveal: false })
    expect(broadcastPokerChange).toHaveBeenCalledWith('s1', { reason: 'vote', taskId: 't1', round: 1 })
  })
})
