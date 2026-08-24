/**
 * Marks un-run stand-ups Missed at the project's local end of day (spec SCH-12,
 * SCH-13, SCH-15, N8, E47, E48).
 *
 * NFR-J2 is the whole design constraint. The ticker fires on a UTC clock, but
 * "the end of its project local day" is a different instant for every project,
 * so the job resolves each project's local date itself with `date-fns-tz`. A
 * single global midnight sweep would mark a Colombo team missed at 05:30 their
 * time and let a New York team's stand-up sit un-missed for hours.
 *
 * A missed stand-up is not a dead end: SCH-14 lets the PM back-fill it inside
 * the window, which is why the status is `Missed` and not `Cancelled`.
 */
import { formatInTimeZone } from 'date-fns-tz'

import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { recordAudit, systemActor } from '../audit'
import type { IsoDate } from '../calendar-dates'
import { standupStrings } from '../strings'
import { sendStandupNotificationOnce } from './notify'
import { emptyResult, type JobResult } from './result'

/** Statuses that mean the stand-up never ran and its day is over. */
const MISSABLE = ['Scheduled', 'Ready']

/** SCH-15's two thresholds. */
const NOTIFY_PM_AFTER = 2
const NOTIFY_ADMIN_AFTER = 3

/**
 * What happens to a missed day's work (SCH-13).
 *
 * **Phase 9 seam.** The carry-forward register is Phase 9's; until it exists
 * there is nothing to roll, so the default is a no-op that is accurate rather
 * than permissive. The call shape is fixed here so Phase 9 fills the body
 * rather than changing the caller.
 */
export interface MissedRollForward {
  missedStandupId: string
  missedDate: IsoDate
  toStandupId: string | null
  toDate: IsoDate | null
  origin: 'missed_standup'
}

export type MissedRollForwardHandler = (input: MissedRollForward) => Promise<void>

const rollForwardPending: MissedRollForwardHandler = async () => {}

export interface MarkMissedOptions {
  rollForward?: MissedRollForwardHandler
}

export async function markMissed(
  now: Date = new Date(),
  options: MarkMissedOptions = {}
): Promise<JobResult> {
  const result = emptyResult('mark-missed')

  // Anything scheduled more than a day ahead cannot be past its own local day
  // in any timezone, so the scan is bounded without needing the timezone first.
  const candidates = (await Standup.find({
    status: { $in: MISSABLE },
    scheduledStartAt: { $lte: new Date(now.getTime() + 24 * 3_600_000) }
  })
    .sort({ standupDate: 1 })
    .lean()) as any[]

  if (candidates.length === 0) return result

  const projectIds = Array.from(new Set(candidates.map((doc) => doc.project.toString())))
  result.scannedProjects = projectIds.length

  const calendars = (await WorkingCalendar.find({
    project: { $in: projectIds },
    scope: 'project'
  })
    .select('project timezone')
    .lean()) as any[]

  const timezoneByProject = new Map(
    calendars.map((row) => [row.project.toString(), row.timezone as string])
  )

  const rollForward = options.rollForward ?? rollForwardPending

  for (const standup of candidates) {
    const projectId = standup.project.toString()

    try {
      const timezone = timezoneByProject.get(projectId) ?? 'UTC'
      const todayThere = formatInTimeZone(now, timezone, 'yyyy-MM-dd')

      // Its day is over only once the project's local date has moved past it.
      if (todayThere <= standup.standupDate) {
        result.skipped += 1
        continue
      }

      const standupId = String(standup._id)

      const missed = await Standup.updateOne(
        { _id: standupId, status: { $in: MISSABLE } },
        { $set: { status: 'Missed', missedAt: now }, $inc: { version: 1 } }
      )

      if (missed.modifiedCount === 0) {
        result.skipped += 1
        continue
      }

      result.repaired += 1

      const next = (await Standup.findOne({
        sprint: standup.sprint,
        standupDate: { $gt: standup.standupDate },
        status: { $in: ['Scheduled', 'Ready'] }
      })
        .sort({ standupDate: 1 })
        .select('_id standupDate')
        .lean()) as any

      await rollForward({
        missedStandupId: standupId,
        missedDate: standup.standupDate,
        toStandupId: next ? String(next._id) : null,
        toDate: next ? next.standupDate : null,
        origin: 'missed_standup'
      })

      await sendStandupNotificationOnce({
        standupId,
        projectId,
        organizationId: standup.organization.toString(),
        notificationId: 'N8',
        recipientIds: [String(standup.facilitator)],
        title: standupStrings.notifications.missedTitle(),
        message: standupStrings.notifications.missedMessage({ date: standup.standupDate }),
        url: `/standups/${standupId}`,
        priority: 'high'
      })

      await escalate(standup, standupId, projectId, now)

      await recordAudit({
        actor: systemActor('mark-missed'),
        organizationId: standup.organization.toString(),
        action: 'standup_missed',
        entityType: 'standup',
        entityId: standupId,
        projectId,
        before: { status: standup.status },
        after: { status: 'Missed', missedAt: now.toISOString() }
      })
    } catch (error) {
      result.errors.push({ projectId, message: (error as Error).message })
    }
  }

  return result
}

/**
 * SCH-15's escalation ladder.
 *
 * The streak is counted backwards from this stand-up over the sprint's own
 * stand-ups, so a completed day breaks it. Counting total misses instead would
 * escalate on a sprint that missed three scattered days over a month, which is
 * a different — and much less urgent — problem.
 */
async function escalate(
  standup: any,
  standupId: string,
  projectId: string,
  now: Date
): Promise<void> {
  const earlier = (await Standup.find({
    sprint: standup.sprint,
    standupDate: { $lte: standup.standupDate },
    status: { $nin: ['Skipped_Holiday', 'Cancelled'] }
  })
    .sort({ standupDate: -1 })
    .select('standupDate status')
    .lean()) as any[]

  let streak = 0
  for (const row of earlier) {
    if (row.status !== 'Missed') break
    streak += 1
  }

  if (streak < NOTIFY_PM_AFTER) return

  const sprint = (await Sprint.findById(standup.sprint).select('createdBy').lean()) as any

  const isThird = streak >= NOTIFY_ADMIN_AFTER

  await sendStandupNotificationOnce({
    standupId,
    projectId,
    organizationId: standup.organization.toString(),
    notificationId: 'N8',
    variantKey: isThird ? 'N8_ESCALATION_3' : 'N8_ESCALATION_2',
    recipientIds: [String(standup.facilitator), String(sprint?.createdBy ?? '')],
    title: isThird
      ? standupStrings.notifications.missedThriceTitle()
      : standupStrings.notifications.missedTwiceTitle(),
    message: isThird
      ? standupStrings.notifications.missedThriceMessage({ count: streak })
      : standupStrings.notifications.missedTwiceMessage({ count: streak }),
    url: `/standups/${standupId}`,
    priority: 'high'
  })

  if (!isThird) return

  // Raised once. A fourth miss is the same warning, not a new one.
  await Sprint.updateOne(
    { _id: standup.sprint, 'healthWarnings.code': { $ne: 'CONSECUTIVE_MISSES' } },
    {
      $push: {
        healthWarnings: {
          code: 'CONSECUTIVE_MISSES',
          message: standupStrings.notifications.missedThriceMessage({ count: streak }),
          raisedAt: now,
          context: { streak, throughDate: standup.standupDate }
        }
      }
    }
  )
}
