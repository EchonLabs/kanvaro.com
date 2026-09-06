import { JobLock } from '@/models/JobLock'
import { withJobLock } from '@/lib/standup/jobs/lock'

import { syncIndexes, useMongo } from './helpers/mongo'

describe('withJobLock', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(JobLock)
  })

  it('runs the function and releases the lock', async () => {
    const result = await withJobLock('demo', 60, async () => 'ran')

    expect(result).toBe('ran')
    expect(await JobLock.countDocuments({ key: 'demo' })).toBe(0)
  })

  it('refuses a second holder while the first is running', async () => {
    let inner: string | null = 'not-run'

    const outer = await withJobLock('demo', 60, async () => {
      inner = await withJobLock('demo', 60, async () => 'second')
      return 'first'
    })

    expect(outer).toBe('first')
    expect(inner).toBeNull()
  })

  it('releases the lock when the function throws, and rethrows', async () => {
    await expect(
      withJobLock('demo', 60, async () => {
        throw new Error('job blew up')
      })
    ).rejects.toThrow('job blew up')

    expect(await JobLock.countDocuments({ key: 'demo' })).toBe(0)
  })

  it('claims a lock whose expiry has passed', async () => {
    // A runner that died without releasing. The TTL monitor only sweeps once a
    // minute, so the claim must not depend on the document being gone.
    await JobLock.create({
      key: 'demo',
      owner: 'dead-runner',
      acquiredAt: new Date(Date.now() - 120_000),
      expiresAt: new Date(Date.now() - 60_000)
    })

    expect(await withJobLock('demo', 60, async () => 'reclaimed')).toBe('reclaimed')
  })

  it('does not release a lock another owner has since claimed', async () => {
    await withJobLock('demo', 60, async () => {
      await JobLock.updateOne({ key: 'demo' }, { $set: { owner: 'someone-else' } })
      return 'done'
    })

    expect(await JobLock.countDocuments({ key: 'demo', owner: 'someone-else' })).toBe(1)
  })
})
