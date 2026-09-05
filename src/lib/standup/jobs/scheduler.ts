/**
 * The in-process ticker that drives the stand-up jobs (plan D-B).
 *
 * Kanvaro ships self-hosted Docker first, and that path has no scheduler at all
 * — no cron in the image, no worker container, and `bull` is a dependency that
 * nothing imports. Without this, stand-ups would never become Ready, never send
 * a reminder and never be marked Missed on the deployment most users run.
 *
 * A plain interval in the Next server process rather than a queue, because the
 * app is a single long-lived container and a queue would mean requiring Redis,
 * which is optional here. Correctness under multiple instances comes from the
 * Mongo advisory lock in `lock.ts`, not from there being only one ticker.
 *
 * One UTC tick serves every timezone: each job resolves project-local time
 * itself (NFR-J2). There is deliberately no per-project timer.
 */
import connectDB from '@/lib/db-config'

import { recordSchedulerTick } from './heartbeat'
import { runStandupJob } from './runner'
import { STANDUP_JOB_NAMES, type StandupJobName } from './registry'

export const TICK_INTERVAL_MS = 60_000

type RunFn = (job: StandupJobName) => Promise<unknown>
type RecordTickFn = (input: {
  durationMs: number
  jobsRun: number
  errorCount: number
}) => Promise<void>
type ConnectFn = () => Promise<unknown>

let timer: NodeJS.Timeout | null = null
/** Guards against a slow tick overlapping the next interval. */
let ticking = false

/** Unset means enabled. Only an explicit "false" turns it off (plan §3.1). */
export const schedulerIsEnabled = (): boolean =>
  process.env.KANVARO_INTERNAL_SCHEDULER?.trim().toLowerCase() !== 'false'

export function startScheduler(
  options: { run?: RunFn; recordTick?: RecordTickFn; connect?: ConnectFn } = {}
): void {
  if (timer) return

  const run: RunFn = options.run ?? ((job) => runStandupJob(job))
  const recordTick: RecordTickFn = options.recordTick ?? recordSchedulerTick
  const connect: ConnectFn = options.connect ?? connectDB

  timer = setInterval(() => {
    void tick(run, recordTick, connect)
  }, TICK_INTERVAL_MS)

  // Never hold the process open for a tick. Without this a container refuses to
  // exit on SIGTERM until the interval fires.
  timer.unref?.()

  // Announce the start, so "is the scheduler running?" is answerable from the
  // logs alone. Until jobs are registered a tick writes nothing, which would
  // otherwise make a working scheduler indistinguishable from a dead one.
  // eslint-disable-next-line no-console -- NFR-16: this IS the observability surface.
  console.log(
    JSON.stringify({
      event: 'standup.scheduler.started',
      at: new Date().toISOString(),
      intervalMs: TICK_INTERVAL_MS,
      jobs: STANDUP_JOB_NAMES.length
    })
  )
}

export function stopScheduler(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
  ticking = false
}

/**
 * Runs each job in sequence, swallowing individual failures.
 *
 * Sequential rather than parallel so one tick cannot open seven concurrent
 * aggregations against a small Mongo. Failures are swallowed because a throw
 * here would kill the interval callback and stop the scheduler permanently —
 * the runner has already recorded the failed heartbeat and log line.
 */
async function tick(
  run: RunFn,
  recordTick: RecordTickFn,
  connect: ConnectFn
): Promise<void> {
  // A tick slower than the interval must not stack up behind itself. Without
  // this, a database that has gone away accumulates one pending tick per minute.
  if (ticking) return
  ticking = true

  const startedAt = Date.now()

  try {
    // Nothing else connects for us: the ticker is not a request, so no route
    // handler has called connectDB(). Skipping this leaves every write sitting
    // in mongoose's command buffer indefinitely — no error, no data, and a
    // scheduler that looks perfectly healthy.
    try {
      await connect()
    } catch (error) {
      // Cannot do any work without a database. No heartbeat is written, so
      // SCHEDULER_STALE fires, which is the honest signal.
      // eslint-disable-next-line no-console -- NFR-16: this IS the observability surface.
      console.log(
        JSON.stringify({
          event: 'standup.scheduler.tick_skipped',
          at: new Date().toISOString(),
          reason: 'database_unavailable',
          message: (error as Error).message
        })
      )
      return
    }

    let jobsRun = 0
    let errorCount = 0

    for (const job of STANDUP_JOB_NAMES) {
      try {
        if ((await run(job)) !== null) jobsRun += 1
      } catch {
        // Already recorded by the runner. Keep ticking.
        errorCount += 1
      }
    }

    // Recorded even when every job was a no-op: this is the scheduler's liveness
    // signal, and a tick that found nothing to do is still a live tick.
    await recordTick({ durationMs: Date.now() - startedAt, jobsRun, errorCount })
  } finally {
    ticking = false
  }
}
