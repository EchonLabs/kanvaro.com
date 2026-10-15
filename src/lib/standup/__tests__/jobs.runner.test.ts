import { JobHeartbeat } from '@/models/JobHeartbeat'
import { JobLock } from '@/models/JobLock'
import { emptyResult } from '@/lib/standup/jobs/registry'
import { runStandupJob } from '@/lib/standup/jobs/runner'

import { syncIndexes, useMongo } from './helpers/mongo'

describe('runStandupJob', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(JobLock, JobHeartbeat)
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('runs the job and records a heartbeat', async () => {
    const result = await runStandupJob('mark-missed', new Date(), async () => ({
      ...emptyResult('mark-missed'),
      scannedProjects: 2,
      repaired: 1
    }))

    expect(result?.repaired).toBe(1)

    const beat = await JobHeartbeat.findOne({ job: 'mark-missed' }).lean()
    expect(beat).toMatchObject({ ok: true, scannedProjects: 2, repaired: 1, errorCount: 0 })
  })

  it('returns null and writes no heartbeat when the lock is held', async () => {
    await JobLock.create({
      key: 'standup-job:mark-missed',
      owner: 'other-runner',
      acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000)
    })

    const result = await runStandupJob('mark-missed', new Date(), async () =>
      emptyResult('mark-missed')
    )

    expect(result).toBeNull()
    expect(await JobHeartbeat.countDocuments()).toBe(0)
  })

  it('records a failed heartbeat and rethrows when the job throws', async () => {
    await expect(
      runStandupJob('sprint-health', new Date(), async () => {
        throw new Error('aggregate failed')
      })
    ).rejects.toThrow('aggregate failed')

    const beat = await JobHeartbeat.findOne({ job: 'sprint-health' }).lean()
    expect(beat).toMatchObject({ ok: false, errorCount: 1 })
    // The lock must not survive the failure, or the job is wedged until its TTL.
    expect(await JobLock.countDocuments()).toBe(0)
  })

  it('is a no-op for a job that has no implementation yet', async () => {
    expect(await runStandupJob('readmodel-refresh')).toBeNull()
    expect(await JobHeartbeat.countDocuments()).toBe(0)
  })

  it('leaves identical state when run twice (NFR-7)', async () => {
    const job = async () => ({ ...emptyResult('generation-audit'), scannedProjects: 3 })

    await runStandupJob('generation-audit', new Date(), job)
    await runStandupJob('generation-audit', new Date(), job)

    // Two runs, two heartbeats — but no leaked locks and no divergent counts.
    const beats = await JobHeartbeat.find({ job: 'generation-audit' }).lean()
    expect(beats).toHaveLength(2)
    expect(beats.every((b) => b.scannedProjects === 3 && b.ok)).toBe(true)
    expect(await JobLock.countDocuments()).toBe(0)
  })
})
