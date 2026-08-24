/**
 * The seven scheduled jobs of spec §18.1.
 *
 * A job is a pure `(now) => Promise<JobResult>` function so it can be driven by
 * the in-process ticker, by an HTTP route, or by a test, without knowing which.
 * Everything shared — locking, heartbeats, logging — lives in the runner.
 */
export type StandupJobName =
  | 'promote-to-ready'
  | 'send-reminders'
  | 'mark-missed'
  | 'generation-audit'
  | 'escalate-carry-forward'
  | 'sprint-health'
  | 'readmodel-refresh'

export const STANDUP_JOB_NAMES: readonly StandupJobName[] = [
  'promote-to-ready',
  'send-reminders',
  'mark-missed',
  'generation-audit',
  'escalate-carry-forward',
  'sprint-health',
  'readmodel-refresh'
]

export interface JobResult {
  job: StandupJobName
  scannedProjects: number
  created: number
  skipped: number
  repaired: number
  /**
   * Per-project failures. A job must keep going after one project throws —
   * otherwise a single broken project silently stops every other project's
   * stand-ups, which is the failure mode NFR-16's counts exist to expose.
   */
  errors: Array<{ projectId: string; message: string }>
}

export type StandupJob = (now: Date) => Promise<JobResult>

export const emptyResult = (job: StandupJobName): JobResult => ({
  job,
  scannedProjects: 0,
  created: 0,
  skipped: 0,
  repaired: 0,
  errors: []
})

/**
 * Populated as each job lands in Phase 5 and beyond. Empty here on purpose:
 * Phase 3 builds the machinery, not the jobs.
 */
export const STANDUP_JOBS: Partial<Record<StandupJobName, StandupJob>> = {}
