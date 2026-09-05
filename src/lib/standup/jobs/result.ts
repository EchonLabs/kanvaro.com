/**
 * The job result shape and its empty value.
 *
 * Split out of `registry.ts` on purpose. The registry imports every job so it
 * can name them, and every job needs `emptyResult` — importing it from the
 * registry would make that a runtime cycle. A cycle that happens to work today
 * because of when the values are read is not a thing to leave in a scheduler.
 */
export type StandupJobName =
  | 'promote-to-ready'
  | 'send-reminders'
  | 'mark-missed'
  | 'generation-audit'
  | 'escalate-carry-forward'
  | 'sprint-health'
  | 'readmodel-refresh'

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
