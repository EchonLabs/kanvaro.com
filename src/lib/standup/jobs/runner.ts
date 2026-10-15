import { JobHeartbeat } from '@/models/JobHeartbeat'

import { withJobLock } from './lock'
import { logJobRun } from './log'
import {
  emptyResult,
  STANDUP_JOBS,
  type JobResult,
  type StandupJob,
  type StandupJobName
} from './registry'

/**
 * How long a runner may hold a job's lock. Comfortably longer than any job
 * should take, short enough that a crashed runner frees the key within one
 * ticker interval or two rather than blocking until someone notices.
 */
const LOCK_TTL_SECONDS = 300

const lockKey = (job: StandupJobName) => `standup-job:${job}`

/**
 * Executes one named job under its lock, then records a heartbeat and one
 * structured log line.
 *
 * Returns `null` when the job is skipped — another runner holds the lock, or
 * the job has no implementation registered yet. Neither is an error: two
 * schedulers ticking at once is the expected steady state.
 *
 * `override` exists for tests, so the machinery can be exercised without any
 * real job being implemented.
 */
export async function runStandupJob(
  name: StandupJobName,
  now: Date = new Date(),
  override?: StandupJob
): Promise<JobResult | null> {
  const job = override ?? STANDUP_JOBS[name]
  if (!job) return null

  return withJobLock(lockKey(name), LOCK_TTL_SECONDS, async () => {
    const startedAt = Date.now()

    try {
      const result = await job(now)
      await record(result, Date.now() - startedAt, true)
      return result
    } catch (error) {
      const failure: JobResult = {
        ...emptyResult(name),
        errors: [{ projectId: '*', message: (error as Error).message }]
      }
      await record(failure, Date.now() - startedAt, false)
      throw error
    }
  })
}

async function record(result: JobResult, durationMs: number, ok: boolean): Promise<void> {
  logJobRun({ result, durationMs, ok })

  await JobHeartbeat.create({
    job: result.job,
    ranAt: new Date(),
    durationMs,
    ok,
    scannedProjects: result.scannedProjects,
    created: result.created,
    skipped: result.skipped,
    repaired: result.repaired,
    errorCount: result.errors.length
  })
}
