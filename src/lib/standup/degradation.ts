/**
 * The degrade-loudly contract (plan §3).
 *
 * Release one deliberately ships without several things the spec asks for.
 * Every one of them is represented here, so an absent capability announces
 * itself on screen instead of looking like working software that quietly does
 * nothing. A descope with no notice is a defect, not a shortcut.
 *
 * Codes are declared for every registered descope, including the ones whose
 * detection lands in a later phase, so no later phase has to widen this type.
 */
import { JobHeartbeat } from '@/models/JobHeartbeat'

import { cronSecretIsConfigured } from './jobs/auth'
import { SCHEDULER_HEARTBEAT_JOB } from './jobs/heartbeat'
import { standupStrings } from './strings'

export type DegradationCode =
  | 'SCHEDULER_STALE'
  | 'HOLIDAY_COVERAGE_GAP'
  | 'TIME_LOGGING_MANUAL'
  | 'LEAVE_DATA_MANUAL'
  | 'LIVE_UPDATES_DEGRADED'
  | 'CROSS_PROJECT_LOAD_UNAVAILABLE'
  | 'COMPLETION_INTERRUPTED'
  | 'CRON_ROUTES_UNAUTHENTICATED'

export type DegradationSeverity = 'info' | 'warning' | 'blocking'

export interface Degradation {
  code: DegradationCode
  severity: DegradationSeverity
  /** Plain language, from `strings.ts`. States the effect, not the cause. */
  message: string
  action?: { label: string; href: string }
  detectedAt: Date
}

export interface DegradationScope {
  organizationId: string
  projectId?: string
  sprintId?: string
}

/**
 * Two ticker intervals plus generous slack. Short enough that a PM discovers a
 * dead scheduler before the stand-up they were relying on, long enough that a
 * slow job or a container restart does not cry wolf.
 */
export const SCHEDULER_STALE_AFTER_MS = 15 * 60 * 1000

// Docs are served under /docs/internal/<slug> (see src/app/docs/internal/[...slug]).
// A bare /docs/operations/... path 404s, and a degradation whose action link is
// broken is a broken degradation.
const SCHEDULER_DOCS = '/docs/internal/operations/background-jobs'

export async function getActiveDegradations(
  _scope: DegradationScope
): Promise<Degradation[]> {
  const found: Degradation[] = []
  const now = new Date()

  // The scheduler's own heartbeat, not the newest job's. A job row means a job
  // had work to do; it says nothing about whether the ticker is alive, and until
  // the first job is registered there are no job rows at all.
  const newest = await JobHeartbeat.findOne({ job: SCHEDULER_HEARTBEAT_JOB })
    .sort({ ranAt: -1 })
    .lean<{ ranAt: Date } | null>()
  const ageMs = newest ? now.getTime() - new Date(newest.ranAt).getTime() : Infinity

  if (ageMs > SCHEDULER_STALE_AFTER_MS) {
    found.push({
      code: 'SCHEDULER_STALE',
      severity: 'warning',
      message: newest
        ? standupStrings.degradation.schedulerStale({ minutes: Math.floor(ageMs / 60_000) })
        : standupStrings.degradation.schedulerStaleNever,
      action: { label: standupStrings.degradation.schedulerStaleAction, href: SCHEDULER_DOCS },
      detectedAt: now
    })
  }

  if (!cronSecretIsConfigured()) {
    found.push({
      code: 'CRON_ROUTES_UNAUTHENTICATED',
      severity: 'info',
      message: standupStrings.degradation.cronRoutesUnauthenticated,
      action: {
        label: standupStrings.degradation.cronRoutesUnauthenticatedAction,
        href: SCHEDULER_DOCS
      },
      detectedAt: now
    })
  }

  return found
}
