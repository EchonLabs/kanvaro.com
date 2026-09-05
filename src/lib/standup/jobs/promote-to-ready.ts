/**
 * Promotes due stand-ups to Ready and builds their snapshot (spec SCH-8, SCH-9,
 * N2).
 *
 * This is OB-1's first job: Phase 3 built the ticker, the lock and the
 * heartbeat, and until something is registered they run and find nothing to do.
 *
 * No `connectDB()` call. A tick is not a request, so Phase 3 connects once in
 * the scheduler itself; a second connect here would be the defect that fix
 * removed, not a safety net.
 */
import { formatInTimeZone } from 'date-fns-tz'

import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Standup } from '@/models/Standup'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { recordAudit, systemActor } from '../audit'
import { buildStandupSnapshot } from '../snapshot'
import { standupStrings } from '../strings'
import { sendStandupNotificationOnce } from './notify'
import { emptyResult, type JobResult } from './registry'

/**
 * The widest lead any project may configure (`readyLeadMinutes` max).
 *
 * Used to bound the scan: the query cannot know each project's lead before it
 * has loaded that project, so it takes the widest possible window and filters
 * per project afterwards. Without the bound this would scan every future
 * stand-up in the database on every tick.
 */
const MAX_LEAD_MINUTES = 120

const DEFAULT_LEAD_MINUTES = 15

export async function promoteToReady(now: Date = new Date()): Promise<JobResult> {
  const result = emptyResult('promote-to-ready')

  const due = (await Standup.find({
    status: 'Scheduled',
    scheduledStartAt: { $lte: new Date(now.getTime() + MAX_LEAD_MINUTES * 60_000) }
  })
    .sort({ scheduledStartAt: 1 })
    .lean()) as any[]

  if (due.length === 0) return result

  const projectIds = Array.from(new Set(due.map((standup) => standup.project.toString())))
  result.scannedProjects = projectIds.length

  const [settingsRows, calendars] = await Promise.all([
    ProjectStandupSettings.find({ project: { $in: projectIds } }).lean() as Promise<any[]>,
    WorkingCalendar.find({ project: { $in: projectIds }, scope: 'project' })
      .select('project timezone')
      .lean() as Promise<any[]>
  ])

  const settingsByProject = new Map(settingsRows.map((row) => [row.project.toString(), row]))
  const timezoneByProject = new Map(
    calendars.map((row) => [row.project.toString(), row.timezone as string])
  )

  for (const standup of due) {
    const projectId = standup.project.toString()

    try {
      const settings = settingsByProject.get(projectId)
      const leadMinutes = settings?.readyLeadMinutes ?? DEFAULT_LEAD_MINUTES
      const opensAt = new Date(standup.scheduledStartAt.getTime() - leadMinutes * 60_000)

      if (now.getTime() < opensAt.getTime()) {
        result.skipped += 1
        continue
      }

      const standupId = String(standup._id)

      // Snapshot first. A stand-up that reaches Ready without its numbers is
      // worse than one that is still Scheduled: the PM opens it and sees an
      // empty screen with no explanation.
      await buildStandupSnapshot(standupId, { persist: true })

      // Conditional on the status so a concurrent runner cannot promote twice.
      const promoted = await Standup.updateOne(
        { _id: standupId, status: 'Scheduled' },
        { $set: { status: 'Ready' }, $inc: { version: 1 } }
      )

      if (promoted.modifiedCount === 0) {
        result.skipped += 1
        continue
      }

      result.created += 1

      const timezone = timezoneByProject.get(projectId) ?? 'UTC'
      await sendStandupNotificationOnce({
        standupId,
        projectId,
        organizationId: standup.organization.toString(),
        notificationId: 'N2',
        recipientIds: [String(standup.facilitator)],
        title: standupStrings.notifications.readyTitle(),
        message: standupStrings.notifications.readyMessage({
          localTime: formatInTimeZone(standup.scheduledStartAt, timezone, 'HH:mm'),
          minutesUntil: Math.max(
            0,
            Math.round((standup.scheduledStartAt.getTime() - now.getTime()) / 60_000)
          )
        }),
        url: `/standups/${standupId}`
      })

      await recordAudit({
        actor: systemActor('promote-to-ready'),
        organizationId: standup.organization.toString(),
        action: 'standup_reconciled',
        entityType: 'standup',
        entityId: standupId,
        projectId,
        before: { status: 'Scheduled' },
        after: { status: 'Ready' }
      })
    } catch (error) {
      // NFR-16: one broken project must never stop every other project's
      // stand-ups from being promoted.
      result.errors.push({ projectId, message: (error as Error).message })
    }
  }

  return result
}
