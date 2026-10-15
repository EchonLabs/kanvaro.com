/**
 * The seven scheduled jobs of spec §18.1.
 *
 * A job is a pure `(now) => Promise<JobResult>` function so it can be driven by
 * the in-process ticker, by an HTTP route, or by a test, without knowing which.
 * Everything shared — locking, heartbeats, logging — lives in the runner.
 *
 * The types and `emptyResult` live in `./result` so the jobs can use them
 * without importing this module, which imports them.
 */
import { escalateCarryForward } from './escalate-carry-forward'
import { generationAudit } from './generation-audit'
import { markMissed } from './mark-missed'
import { promoteToReady } from './promote-to-ready'
import { sendReminders } from './send-reminders'
import { runSprintHealthJob } from './sprint-health'

export {
  emptyResult,
  type JobResult,
  type StandupJob,
  type StandupJobName
} from './result'

import type { StandupJob, StandupJobName } from './result'

export const STANDUP_JOB_NAMES: readonly StandupJobName[] = [
  'promote-to-ready',
  'send-reminders',
  'mark-missed',
  'generation-audit',
  'escalate-carry-forward',
  'sprint-health',
  'readmodel-refresh'
]

/**
 * The jobs that exist today.
 *
 * Four land in Phase 5, `escalate-carry-forward` in Phase 9, `sprint-health` in
 * Phase 10. `readmodel-refresh` has nothing to refresh while D-J keeps the
 * board view computed live. The runner treats an unregistered name as a skip,
 * not an error, so the ticker is unaffected by that one remaining gap.
 */
export const STANDUP_JOBS: Partial<Record<StandupJobName, StandupJob>> = {
  'promote-to-ready': promoteToReady,
  'send-reminders': sendReminders,
  'mark-missed': markMissed,
  'generation-audit': generationAudit,
  'escalate-carry-forward': escalateCarryForward,
  'sprint-health': runSprintHealthJob
}
