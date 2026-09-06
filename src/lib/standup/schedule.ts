/**
 * The sprint schedule read model (spec §15.6, UI-8, UI-9).
 *
 * Two rules from the UI section drive the shape rather than the storage:
 *
 * UI-9 — skipped days are returned, always, with their reason. Filtering them
 * out would make a sprint that lost a day to a holiday look like a shorter
 * sprint, and the reason would exist only in the memory of whoever declared it.
 *
 * UI-8 — "today" is resolved in the **project's** timezone and named in the
 * payload, so the client pins the right row without doing its own timezone
 * arithmetic against the viewer's clock.
 */
import { Sprint } from '@/models/Sprint'
import { Standup, type StandupShape, type StandupStatus } from '@/models/Standup'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { isoOfStoredDate, todayInTimezone, type IsoDate } from './calendar-dates'
import { StandupError } from './errors'

export interface ScheduleDay {
  standupId: string
  date: IsoDate
  status: StandupStatus
  shape: StandupShape
  sprintDayNumber: number
  totalSprintDays: number
  displayedDayNumber?: number
  scheduledStartAt: string
  durationMinutes: number
  facilitatorId: string
  expectedAttendeeIds: string[]
  /** UI-9: why this day does not run. */
  skippedReason?: string
  cancelledReason?: string
  wasBackfilled: boolean
  hasCalendarAnomaly: boolean
}

export interface SprintSchedule {
  sprintId: string
  sprintName: string
  projectId: string
  timezone: string
  /** Project-local today, so UI-8's pinned row needs no client-side timezone maths. */
  today: IsoDate
  dateRange: { from: IsoDate; to: IsoDate }
  totalSprintDays: number
  days: ScheduleDay[]
}

export interface ScheduleOptions {
  now?: Date
}

export async function getSprintSchedule(
  sprintId: string,
  options: ScheduleOptions = {}
): Promise<SprintSchedule> {
  const sprint = (await Sprint.findById(sprintId).lean()) as any
  if (!sprint) {
    throw new StandupError('NOT_FOUND', 'That sprint no longer exists.', { sprintId })
  }

  const projectId = sprint.project.toString()

  const [calendar, standups] = await Promise.all([
    WorkingCalendar.findOne({ project: projectId, scope: 'project' })
      .select('timezone')
      .lean() as Promise<any>,
    Standup.find({ sprint: sprintId }).sort({ standupDate: 1 }).lean() as Promise<any[]>
  ])

  const timezone = calendar?.timezone ?? 'UTC'

  const days: ScheduleDay[] = standups.map((standup) => ({
    standupId: String(standup._id),
    date: standup.standupDate,
    status: standup.status,
    shape: standup.shape,
    sprintDayNumber: standup.sprintDayNumber,
    totalSprintDays: standup.totalSprintDays,
    displayedDayNumber: standup.displayedDayNumber,
    scheduledStartAt: standup.scheduledStartAt.toISOString(),
    durationMinutes: standup.durationMinutes,
    facilitatorId: String(standup.facilitator),
    expectedAttendeeIds: (standup.expectedAttendees ?? []).map(String),
    skippedReason: standup.skippedReason,
    cancelledReason: standup.cancelledReason,
    wasBackfilled: standup.wasBackfilled === true,
    hasCalendarAnomaly: (standup.calendarAnomalies ?? []).length > 0
  }))

  return {
    sprintId,
    sprintName: sprint.name,
    projectId,
    timezone,
    today: todayInTimezone(timezone, options.now ?? new Date()),
    dateRange: {
      from: isoOfStoredDate(sprint.startDate),
      to: isoOfStoredDate(sprint.endDate)
    },
    // The live count, taken from the days that actually run — a skipped day is
    // listed but is not one of the sprint's working days.
    totalSprintDays: days.filter((day) => day.status !== 'Skipped_Holiday' && day.status !== 'Cancelled')
      .length,
    days
  }
}
