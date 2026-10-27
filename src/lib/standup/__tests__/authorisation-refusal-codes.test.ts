/**
 * Plain authorisation refusals answer `FORBIDDEN`, not `OVERRIDE_NOT_PERMITTED`.
 *
 * `OVERRIDE_NOT_PERMITTED` has one meaning in the §17.2 catalogue: the
 * completion check you tried to override is a hard block (O6–O10). It became
 * the module's informal "403 of convenience", so five unrelated refusals —
 * none of which involves an override, or a completion check, or any
 * overridable thing at all — reported themselves as override failures.
 *
 * The codes are the contract the UI switches on to choose between a jump link,
 * a retry and a blocking dialog. A client that sees `OVERRIDE_NOT_PERMITTED`
 * has every reason to explain the override rules to someone whose actual
 * problem is that they are not the facilitator. The status was already 403 in
 * every case, so this changes only the code — the part that carries the reason.
 *
 * The debt route (the fifth) is pinned in `variance-routes.test.ts`, next to
 * the rest of its NFR-13 coverage.
 *
 * Each route is invoked for real with its permission wrapper replaced, the way
 * `reveal-state-route.test.ts` does it: the wrapper has its own coverage, and
 * what matters here is the handler's own branch. Because the wrapper — which
 * normally maps a thrown `StandupError` onto the §17.1 envelope — is the thing
 * being stubbed, these assert the thrown error's `code` and `status` directly.
 */
import { NextRequest } from 'next/server'

const FACILITATOR = '5f00000000000000000000f1'
const SOMEBODY_ELSE = '5f00000000000000000000f2'

/** A poker session whose facilitator is deliberately not the caller. */
const pokerSession = (overrides: Record<string, unknown> = {}) => ({
  _id: { toString: () => '5f00000000000000000000a1' },
  // `open`, and the queue entry `voting`, so the vote route reaches its
  // participant check rather than refusing earlier on session or task state.
  status: 'open',
  deckType: 'fibonacci',
  allowRevote: false,
  facilitator: { toString: () => FACILITATOR },
  participants: [],
  queue: [{ task: { toString: () => 'task-1' }, status: 'voting', roundCount: 1 }],
  ...overrides
})

function loadPokerRoute(routePath: string, context: Record<string, unknown>) {
  jest.resetModules()

  jest.doMock('@/lib/standup/route-helpers', () => ({
    ...jest.requireActual('@/lib/standup/route-helpers'),
    withPokerPermission:
      (_config: any, handler: any) => async (request: NextRequest) => handler(request, context)
  }))

  return require(routePath)
}

const request = (body: unknown = {}) =>
  new NextRequest('http://localhost/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

const caught = async (run: () => Promise<unknown>) => {
  try {
    await run()
  } catch (error) {
    return error as { code?: string; status?: number }
  }
  throw new Error('expected the route to refuse, but it did not throw')
}

afterEach(() => {
  jest.resetModules()
})

describe('poker reveal — only the facilitator', () => {
  it('refuses a non-facilitator with FORBIDDEN', async () => {
    const { POST } = loadPokerRoute(
      '@/app/api/poker-sessions/[id]/tasks/[taskId]/reveal/route',
      { pokerSession: pokerSession(), params: { taskId: 'task-1' }, userId: SOMEBODY_ELSE }
    )

    const error = await caught(() => POST(request(), { params: {} }))

    expect(error.code).toBe('FORBIDDEN')
    expect(error.status).toBe(403)
  })
})

describe('poker finalize — only the facilitator', () => {
  it('refuses a non-facilitator with FORBIDDEN', async () => {
    const { POST } = loadPokerRoute(
      '@/app/api/poker-sessions/[id]/tasks/[taskId]/finalize/route',
      {
        pokerSession: pokerSession(),
        params: { taskId: 'task-1' },
        userId: SOMEBODY_ELSE,
        organizationId: '5f00000000000000000000b1',
        projectId: '5f00000000000000000000c1'
      }
    )

    const error = await caught(() => POST(request({ finalEstimate: 5 }), { params: {} }))

    expect(error.code).toBe('FORBIDDEN')
    expect(error.status).toBe(403)
  })
})

describe('poker vote — participants only', () => {
  it('refuses an observer who is not on the participant list with FORBIDDEN', async () => {
    const { POST } = loadPokerRoute('@/app/api/poker-sessions/[id]/tasks/[taskId]/vote/route', {
      pokerSession: pokerSession({ participants: [{ toString: () => FACILITATOR }] }),
      params: { taskId: 'task-1' },
      userId: SOMEBODY_ELSE,
      organizationId: '5f00000000000000000000b1',
      projectId: '5f00000000000000000000c1'
    })

    const error = await caught(() => POST(request({ card: 5 }), { params: {} }))

    expect(error.code).toBe('FORBIDDEN')
    expect(error.status).toBe(403)
  })
})

describe('planning assignments — needs task_assign as well as sprint_update', () => {
  it('refuses a caller without TASK_ASSIGN with FORBIDDEN', async () => {
    jest.resetModules()

    jest.doMock('@/lib/standup/route-helpers', () => ({
      ...jest.requireActual('@/lib/standup/route-helpers'),
      withSprintPermission:
        (_config: any, handler: any) => async (req: NextRequest) =>
          handler(req, {
            sprintId: '5f00000000000000000000d1',
            sprint: {},
            organizationId: '5f00000000000000000000b1',
            projectId: '5f00000000000000000000c1',
            userId: SOMEBODY_ELSE
          })
    }))

    // SPRINT_UPDATE passed (the wrapper let us in); TASK_ASSIGN is the one
    // this route checks for itself, and the one being refused.
    jest.doMock('@/lib/permissions/permission-service', () => ({
      PermissionService: { hasPermission: jest.fn().mockResolvedValue(false) }
    }))

    const { POST } = require('@/app/api/sprints/[id]/planning-session/assignments/route')

    const error = await caught(() =>
      POST(request({ assignments: [{ taskId: 'x', assigneeId: 'y' }] }), { params: {} })
    )

    expect(error.code).toBe('FORBIDDEN')
    expect(error.status).toBe(403)
  })
})
