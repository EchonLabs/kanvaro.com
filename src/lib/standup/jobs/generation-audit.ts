/**
 * Repairs schedules that drifted away from the calendar (spec §18.1, NFR-16).
 *
 * D-A rules out a transaction, so generation and reconciliation are idempotent
 * instead of atomic. That trade is only safe if something re-runs them: a
 * process killed halfway through a reconcile leaves a schedule that disagrees
 * with `resolveWorkingDay()` and nothing on screen to say so. This job is that
 * something.
 *
 * It repairs by calling the reconciler rather than by writing its own fixes, so
 * there is exactly one implementation of CAL-12/13 in the system. A refusal
 * (SCH-7 — the repair would damage completed history) is reported as a
 * per-project error and left for a human, never forced through.
 */
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'

import { loadCalendarContext } from '../calendar-service'
import { isoOfStoredDate } from '../calendar-dates'
import { reconcileSprintSchedule } from '../reconcile'
import { resolveWorkingDaysFrom, workingDatesFrom } from '../working-day'

import { emptyResult, type JobResult } from './result'

/** Sprints whose schedule is supposed to be live. */
const AUDITABLE_SPRINT_STATES = ['planned', 'active']

/** Statuses that mean a date is genuinely covered by a live stand-up. */
const LIVE_STATUSES = ['Scheduled', 'Ready', 'In_Progress', 'Completed', 'Reopened', 'Missed']

export async function generationAudit(now: Date = new Date()): Promise<JobResult> {
  const result = emptyResult('generation-audit')

  const sprints = (await Sprint.find({
    status: { $in: AUDITABLE_SPRINT_STATES },
    archived: { $ne: true }
  }).lean()) as any[]

  if (sprints.length === 0) return result

  result.scannedProjects = new Set(sprints.map((sprint) => sprint.project.toString())).size

  for (const sprint of sprints) {
    const projectId = sprint.project.toString()

    try {
      const from = isoOfStoredDate(sprint.startDate)
      const to = isoOfStoredDate(sprint.endDate)
      if (from > to) continue

      const context = await loadCalendarContext(projectId, from, to)
      const workingDates = workingDatesFrom(resolveWorkingDaysFrom(from, to, context))

      const existing = (await Standup.find({ sprint: sprint._id })
        .select('standupDate status')
        .lean()) as any[]

      const liveByDate = new Map<string, string>()
      for (const doc of existing) {
        if (LIVE_STATUSES.indexOf(doc.status) !== -1) {
          liveByDate.set(doc.standupDate, doc.status)
        }
      }

      const missing = workingDates.filter((date) => !liveByDate.has(date))
      const stranded = Array.from(liveByDate.keys()).filter(
        (date) => workingDates.indexOf(date) === -1
      )

      if (missing.length === 0 && stranded.length === 0) {
        result.skipped += 1
        continue
      }

      // The trigger names what the drift looks like, not what caused it — the
      // cause is unknowable by the time this job sees it. It still matters
      // which kind it is: a stand-up stranded *outside* the sprint range is a
      // range change, and only the range triggers refuse rather than cancel
      // when completed history is in the way (SCH-7). Reporting that refusal is
      // the correct outcome for an unattended job; quietly cancelling the days
      // around a completed stand-up is not.
      const strandedOutOfRange = stranded.filter((date) => date < from || date > to)

      const trigger = strandedOutOfRange.some((date) => date < from)
        ? 'sprint_start_later'
        : strandedOutOfRange.length > 0
          ? 'sprint_end_earlier'
          : missing.length > 0
            ? 'date_became_working'
            : 'date_became_non_working'

      const reconciled = await reconcileSprintSchedule(String(sprint._id), trigger, {
        systemActorName: 'generation-audit'
      })

      const repaired =
        reconciled.created + reconciled.skipped + reconciled.cancelled

      if (repaired > 0) result.repaired += repaired
      else result.skipped += 1
    } catch (error) {
      // A refused repair is information, not a crash: the schedule stays as it
      // is and the count tells an operator to look (NFR-16).
      result.errors.push({ projectId, message: (error as Error).message })
    }
  }

  return result
}
