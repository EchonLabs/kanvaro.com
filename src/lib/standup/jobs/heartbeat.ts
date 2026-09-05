/**
 * The scheduler's own liveness signal.
 *
 * Distinct from a job's heartbeat on purpose. `SCHEDULER_STALE` answers "is the
 * ticker ticking?", which is not the same question as "has any job had work to
 * do?" — and conflating them produced a real defect: with no jobs registered a
 * tick wrote nothing, so a perfectly healthy scheduler reported a permanent
 * false alarm. A false alarm on the flagship degrade-loudly notice is worse than
 * no notice, because it teaches people to ignore it.
 *
 * Stored in the same collection as job heartbeats under a reserved name, so the
 * whole liveness picture is one query and one retention policy.
 */
import { JobHeartbeat } from '@/models/JobHeartbeat'

/**
 * Reserved. Double-underscored so it can never collide with a StandupJobName,
 * which is a closed union of kebab-case names.
 */
export const SCHEDULER_HEARTBEAT_JOB = '__scheduler__'

/**
 * Records that the ticker completed a pass.
 *
 * Never throws: the scheduler must keep ticking through a database blip, and a
 * missed heartbeat degrades into a `SCHEDULER_STALE` notice, which is the
 * intended behaviour rather than something to escalate here.
 */
export async function recordSchedulerTick(input: {
  durationMs: number
  jobsRun: number
  errorCount: number
}): Promise<void> {
  try {
    await JobHeartbeat.create({
      job: SCHEDULER_HEARTBEAT_JOB,
      ranAt: new Date(),
      durationMs: input.durationMs,
      ok: input.errorCount === 0,
      scannedProjects: 0,
      created: 0,
      skipped: 0,
      repaired: input.jobsRun,
      errorCount: input.errorCount
    })
  } catch {
    // Deliberately swallowed. See the note above.
  }
}
