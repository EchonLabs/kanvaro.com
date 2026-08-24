import { JobHeartbeat } from '@/models/JobHeartbeat'
import { SCHEDULER_HEARTBEAT_JOB } from '@/lib/standup/jobs/heartbeat'
import { getActiveDegradations } from '@/lib/standup/degradation'

import { ids, syncIndexes, useMongo } from './helpers/mongo'

describe('getActiveDegradations', () => {
  useMongo()

  const originalSecret = process.env.CRON_SECRET

  beforeEach(async () => {
    await syncIndexes(JobHeartbeat)
    process.env.CRON_SECRET = 'set-so-it-is-quiet'
  })

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = originalSecret
  })

  const scope = { organizationId: ids.organization.toString() }

  const heartbeat = (job: string, minutesAgo: number) =>
    JobHeartbeat.create({
      job,
      ranAt: new Date(Date.now() - minutesAgo * 60_000),
      durationMs: 10,
      ok: true
    })

  const codes = async () => (await getActiveDegradations(scope)).map((d) => d.code)

  it('reports SCHEDULER_STALE when the scheduler has never ticked', async () => {
    expect(await codes()).toContain('SCHEDULER_STALE')
  })

  it('stays quiet when the scheduler ticked recently', async () => {
    await heartbeat(SCHEDULER_HEARTBEAT_JOB, 2)

    expect(await getActiveDegradations(scope)).toEqual([])
  })

  /**
   * The bug this replaced: staleness was measured from the newest *job*
   * heartbeat. Until Phase 5 registers the first job a tick writes nothing, so a
   * perfectly healthy scheduler reported a permanent false alarm — and a false
   * alarm on the flagship degrade-loudly notice teaches people to ignore it.
   */
  it('stays quiet when the scheduler is ticking even though no job has ever run', async () => {
    await heartbeat(SCHEDULER_HEARTBEAT_JOB, 1)

    expect(await JobHeartbeat.countDocuments({ job: { $ne: SCHEDULER_HEARTBEAT_JOB } })).toBe(0)
    expect(await codes()).not.toContain('SCHEDULER_STALE')
  })

  it('reports SCHEDULER_STALE when jobs ran recently but the ticker has stopped', async () => {
    // A job driven by an external cron while the in-process ticker is dead. The
    // notice is about the scheduler, so a recent job row must not silence it.
    await heartbeat(SCHEDULER_HEARTBEAT_JOB, 90)
    await heartbeat('promote-to-ready', 1)

    expect(await codes()).toContain('SCHEDULER_STALE')
  })

  it('reports the age in the message, leading with the effect', async () => {
    await heartbeat(SCHEDULER_HEARTBEAT_JOB, 47)

    const stale = (await getActiveDegradations(scope)).find((d) => d.code === 'SCHEDULER_STALE')

    expect(stale?.severity).toBe('warning')
    // Plan §3 rule 3: the effect on the reader, not the cause.
    expect(stale?.message).toMatch(/not being promoted automatically/i)
    expect(stale?.message).toMatch(/47 minutes ago/)
    expect(stale?.action?.href).toBe('/docs/internal/operations/background-jobs')
  })

  it('reports CRON_ROUTES_UNAUTHENTICATED as info when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET
    await heartbeat(SCHEDULER_HEARTBEAT_JOB, 1)

    const found = await getActiveDegradations(scope)

    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ code: 'CRON_ROUTES_UNAUTHENTICATED', severity: 'info' })
  })
})
