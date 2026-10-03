/**
 * A malformed id in the path must read as absent, not as a server fault.
 *
 * Every one of these helpers takes an id straight from the URL and hands it to
 * `Model.findById`. Mongoose answers a non-ObjectId string with a `CastError`,
 * which is thrown rather than returned — so it fell through each helper's
 * `try` to the generic handler and the caller got
 * `500 / INTERNAL_ERROR / "Something went wrong."`, plus a stack trace in the
 * server log for what is only ever a bad link or a typo'd client request.
 *
 * 404 is what these helpers already decided the answer should be. Each one
 * builds a `missing` response for the id that does not resolve, and
 * `withStandupIdPermission` says why in its own comment: another
 * organisation's stand-up "must look absent, not forbidden". An id that could
 * never name a record is the same case — there is nothing there to describe.
 *
 * Asserted through the real wrappers rather than on a predicate, because the
 * defect was never in the test for validity; it was in there being no test at
 * all before the query ran.
 */
import { NextRequest } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'

import { useMongo } from './helpers/mongo'

const mockOrgId = '5f00000000000000000000aa'
const mockUserId = '5f00000000000000000000bb'

jest.mock('@/lib/db-config', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/lib/auth-utils', () => ({
  authenticateUser: jest.fn().mockResolvedValue({
    user: { id: mockUserId, organization: mockOrgId }
  })
}))

jest.mock('@/lib/permissions/permission-service', () => ({
  PermissionService: {
    hasPermission: jest.fn().mockResolvedValue(true),
    requireProjectAccess: jest.fn().mockResolvedValue(undefined)
  }
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const helpers = require('../route-helpers')

/**
 * Every id-keyed wrapper, with the param name it reads and a value that is not
 * an ObjectId. `twelveChars` is the trap case: `ObjectId.isValid` accepts any
 * 12-character string and casts it to a *different* id, so a validity check
 * written with that function alone would let it through to silently address
 * the wrong record.
 */
const WRAPPERS = [
  { name: 'withStandupIdPermission', param: 'id' },
  { name: 'withSprintPermission', param: 'id' },
  { name: 'withPokerPermission', param: 'id' },
  { name: 'withCarryForwardItemPermission', param: 'itemId' },
  { name: 'withBlockerPermission', param: 'id' }
] as const

const BAD_IDS = ['not-an-id', '', 'twelveChars!', '6abe33ff9a94f9b8b3c0bdb', 'zzzzzzzzzzzzzzzzzzzzzzzz']

describe('id-keyed route helpers, given a malformed id', () => {
  useMongo()

  const invoke = (wrapper: string, param: string, id: string) => {
    const handler = jest.fn()
    const wrapped = helpers[wrapper]({ permission: Permission.STANDUP_VIEW }, handler)
    const request = new NextRequest(`http://localhost/api/whatever/${id}`, { method: 'GET' })
    return { response: wrapped(request, { params: { [param]: id } }), handler }
  }

  describe.each(WRAPPERS)('$name', ({ name, param }) => {
    it.each(BAD_IDS)('answers 404 for %p rather than a 500', async (id) => {
      const { response } = invoke(name, param, id)
      expect((await response).status).toBe(404)
    })

    it('never runs the handler', async () => {
      const { response, handler } = invoke(name, param, 'not-an-id')
      await response
      expect(handler).not.toHaveBeenCalled()
    })

    it('does not leak the rejected value back to the caller', async () => {
      const { response } = invoke(name, param, 'not-an-id')
      const body = await (await response).json()
      expect(body.error.code).toBe('NOT_FOUND')
      expect(JSON.stringify(body)).not.toContain('not-an-id')
    })
  })
})

/**
 * `withStandupPermission` is the odd one out: it addresses no record of its own,
 * so there is nothing to call absent. It takes a project id — from a path param
 * or, for `/api/standup/health`, from `?projectId=` — purely to scope the
 * permission check, and hands it straight to `PermissionService`, which casts it
 * against `Project` and threw the same `CastError` one layer further in.
 *
 * A bad filter value is a bad request, so this one answers 422 rather than 404,
 * and it must not silently fall through to the organisation-wide check: that
 * check passes only for a role holding the permission org-wide, which would
 * quietly answer a *different*, broader question than the caller asked.
 */
describe('withStandupPermission, given a malformed project id', () => {
  useMongo()

  const invoke = (options: Record<string, unknown>, url: string, params = {}) => {
    const handler = jest.fn()
    const wrapped = helpers.withStandupPermission(
      { permission: Permission.STANDUP_VIEW, ...options },
      handler
    )
    return { response: wrapped(new NextRequest(url, { method: 'GET' }), { params }), handler }
  }

  it('refuses a malformed ?projectId= with 422 rather than a 500', async () => {
    const { response } = invoke(
      { projectIdQuery: 'projectId' },
      'http://localhost/api/standup/health?projectId=not-an-id'
    )

    expect((await response).status).toBe(422)
    expect((await (await response).json()).error.code).toBe('VALIDATION_FAILED')
  })

  it('refuses a malformed project path param with 422 rather than a 500', async () => {
    const { response } = invoke(
      { projectIdParam: 'id' },
      'http://localhost/api/projects/not-an-id/standup-settings',
      { id: 'not-an-id' }
    )

    expect((await response).status).toBe(422)
  })

  it('never runs the handler', async () => {
    const { response, handler } = invoke(
      { projectIdQuery: 'projectId' },
      'http://localhost/api/standup/health?projectId=not-an-id'
    )
    await response
    expect(handler).not.toHaveBeenCalled()
  })

  it('still runs when no project id is supplied at all — the org-wide case', async () => {
    const { response, handler } = invoke({}, 'http://localhost/api/standup/health')
    await response
    expect(handler).toHaveBeenCalled()
  })
})
