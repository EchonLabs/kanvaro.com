/**
 * The N1 pre-stand-up reminder (spec §9.5, SCH-16, SCH-17).
 *
 * "Update your tasks and log your time before the meeting" is what keeps the
 * stand-up to fifteen minutes, so this job is not a courtesy — it is the thing
 * that makes §6.4's seven-step run fit in the time box.
 *
 * The reminder is deliberately not tied to the Ready transition: a project can
 * set a 60-minute reminder lead and a 15-minute ready lead, and the attendee
 * needs the earlier one.
 */
import { formatInTimeZone } from 'date-fns-tz'

import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Standup } from '@/models/Standup'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { standupStrings } from '../strings'
import { sendStandupNotificationOnce } from './notify'
import { emptyResult, type JobResult } from './result'

/** The widest reminder lead a project may configure. Bounds the scan. */
const MAX_LEAD_MINUTES = 1440

const DEFAULT_LEAD_MINUTES = 60

/** Only a stand-up that is still going to happen is worth reminding about. */
const REMINDABLE = ['Scheduled', 'Ready']

export async function sendReminders(now: Date = new Date()): Promise<JobResult> {
  const result = emptyResult('send-reminders')

  const upcoming = (await Standup.find({
    status: { $in: REMINDABLE },
    scheduledStartAt: {
      $gte: now,
      $lte: new Date(now.getTime() + MAX_LEAD_MINUTES * 60_000)
    }
  })
    .sort({ scheduledStartAt: 1 })
    .lean()) as any[]

  if (upcoming.length === 0) return result

  const projectIds = Array.from(new Set(upcoming.map((standup) => standup.project.toString())))
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

  for (const standup of upcoming) {
    const projectId = standup.project.toString()

    try {
      const leadMinutes =
        settingsByProject.get(projectId)?.reminderLeadMinutes ?? DEFAULT_LEAD_MINUTES

      // SCH-16 makes the reminder individually switchable, and zero is how the
      // configuration screen expresses "off".
      if (leadMinutes === 0) {
        result.skipped += 1
        continue
      }

      const remindAt = new Date(standup.scheduledStartAt.getTime() - leadMinutes * 60_000)
      if (now.getTime() < remindAt.getTime()) {
        result.skipped += 1
        continue
      }

      const timezone = timezoneByProject.get(projectId) ?? 'UTC'

      const sent = await sendStandupNotificationOnce({
        standupId: String(standup._id),
        projectId,
        organizationId: standup.organization.toString(),
        notificationId: 'N1',
        recipientIds: (standup.expectedAttendees ?? []).map(String),
        title: standupStrings.notifications.reminderTitle(),
        message: standupStrings.notifications.reminderMessage({
          localTime: formatInTimeZone(standup.scheduledStartAt, timezone, 'HH:mm')
        }),
        url: `/standups/${String(standup._id)}`,
        // One ledger key per attendee: a member added to the sprint after the
        // first reminder still gets theirs.
        perRecipient: true
      })

      result.created += sent
      if (sent === 0) result.skipped += 1
    } catch (error) {
      result.errors.push({ projectId, message: (error as Error).message })
    }
  }

  return result
}
