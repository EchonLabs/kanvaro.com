/**
 * A production server with no JWT secrets must fail closed (500, logged) and
 * never fall back to a public default that would accept forged tokens.
 */
const findById = jest.fn()

jest.mock('@/lib/db-config', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@/models/User', () => ({ User: { findById: (...args: any[]) => findById(...args) } }))
jest.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (name === 'refreshToken' ? { value: 'forged' } : undefined), set: jest.fn() }),
  headers: () => ({ get: () => null })
}))

import { authenticateUser } from '../auth-utils'

const env = process.env as Record<string, string | undefined>
const saved = { NODE_ENV: env.NODE_ENV, JWT_SECRET: env.JWT_SECRET, JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET, REFRESH_TOKEN_SECRET: env.REFRESH_TOKEN_SECRET }

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete env[k]
    else env[k] = v
  }
  jest.restoreAllMocks()
})

it('returns 500 and never looks up a user when production has no secrets', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  env.NODE_ENV = 'production'
  delete env.JWT_SECRET
  delete env.JWT_REFRESH_SECRET
  delete env.REFRESH_TOKEN_SECRET

  expect(await authenticateUser()).toEqual({ error: 'Internal server error', status: 500 })
  expect(findById).not.toHaveBeenCalled()
})
