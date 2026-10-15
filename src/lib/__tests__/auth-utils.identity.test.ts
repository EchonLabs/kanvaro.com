/**
 * `AuthUser.id` must be a string primitive.
 *
 * Regression cover for a real lockout: `authenticateUser()` declared
 * `id: string` but assigned `user._id`, a mongoose ObjectId. Every route that
 * compared an id the honest way — `something.toString() === userId` — then
 * compared a string to an object and got `false` for everybody.
 *
 * It surfaced as planning poker refusing every vote with "You are not a
 * participant in this session", including the facilitator's own, while the
 * voter's id was plainly present in `participants`.
 */
import mongoose from 'mongoose'

const findById = jest.fn()

jest.mock('@/lib/db-config', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@/models/User', () => ({ User: { findById: (...args: any[]) => findById(...args) } }))
jest.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: { verify: () => ({ userId: 'irrelevant' }) },
  verify: () => ({ userId: 'irrelevant' })
}))
jest.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (name === 'accessToken' ? { value: 'token' } : undefined) }),
  headers: () => ({ get: () => null })
}))

describe('authenticateUser identity', () => {
  it('returns id and organization as string primitives, not ObjectIds', async () => {
    const userId = new mongoose.Types.ObjectId()
    const orgId = new mongoose.Types.ObjectId()

    findById.mockResolvedValue({
      _id: userId,
      organization: orgId,
      email: 'someone@example.com',
      role: 'team_member',
      isActive: true
    })

    const { authenticateUser } = await import('../auth-utils')
    const result = await authenticateUser()

    expect('user' in result).toBe(true)
    const { user } = result as { user: { id: string; organization: string } }

    expect(typeof user.id).toBe('string')
    expect(user.id).toBe(userId.toString())
    expect(typeof user.organization).toBe('string')
    expect(user.organization).toBe(orgId.toString())
  })

  it('compares equal to a stored ObjectId the way the routes do', async () => {
    const userId = new mongoose.Types.ObjectId()

    findById.mockResolvedValue({
      _id: userId,
      organization: new mongoose.Types.ObjectId(),
      email: 'someone@example.com',
      role: 'team_member',
      isActive: true
    })

    const { authenticateUser } = await import('../auth-utils')
    const result = await authenticateUser()
    const { user } = result as { user: { id: string } }

    // This is the exact shape of the poker participant check.
    const participants = [userId]
    expect(participants.some((p) => p.toString() === user.id)).toBe(true)
  })
})
