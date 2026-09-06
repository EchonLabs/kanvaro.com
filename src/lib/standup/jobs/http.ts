/**
 * The decision logic behind `/api/cron/standup/[job]`, kept out of the route.
 *
 * The route itself must call `connectDB()`, which connects to whatever the setup
 * wizard recorded in `config.json` and cannot be pointed at a test database — so
 * a route-level test would either hit a real server or fight the in-memory
 * harness for mongoose's global connection. Extracting the decisions here keeps
 * them testable and leaves the route a thin adapter, which is how the rest of
 * this module is built.
 */
import { runStandupJob } from './runner'
import { STANDUP_JOB_NAMES, type JobResult, type StandupJobName } from './registry'
import { isCronRequestAuthorised } from './auth'

export interface CronJobResponse {
  status: number
  body: unknown
}

export type JobRunner = (job: StandupJobName) => Promise<JobResult | null>

export async function handleCronJobRequest(
  headers: { get(name: string): string | null },
  job: string,
  run: JobRunner = (name) => runStandupJob(name)
): Promise<CronJobResponse> {
  if (!isCronRequestAuthorised(headers)) {
    return { status: 401, body: { error: { code: 'UNAUTHORISED' } } }
  }

  if (!STANDUP_JOB_NAMES.includes(job as StandupJobName)) {
    return { status: 404, body: { error: { code: 'NOT_FOUND' } } }
  }

  const result = await run(job as StandupJobName)

  // `ran`, not `skipped`: JobResult already carries a `skipped` *count* of items
  // the job passed over, and reusing the name here would collide with it.
  //
  // A null result is a skip, not a failure — another runner held the lock, or the
  // job is not implemented yet. 200 keeps Vercel from retrying a healthy no-op.
  return {
    status: 200,
    // `result` already carries `job`, so it is not repeated here.
    body: result ? { ran: true, ...result } : { job, ran: false }
  }
}
