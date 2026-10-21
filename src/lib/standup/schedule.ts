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
import mongoose from 'mongoose'

import { Allocation } from '@/models/Allocation'
import { CarryForwardItem, OPEN_CARRY_FORWARD_STATUSES } from '@/models/CarryForwardItem'
import { MemberSprintDebtSummary } from '@/models/MemberSprintDebtSummary'
import { Sprint } from '@/models/Sprint'
import { Standup, type StandupShape, type StandupStatus } from '@/models/Standup'
import { StandupOverride } from '@/models/StandupOverride'
import { StandupSummary } from '@/models/StandupSummary'
import { User } from '@/models/User'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { isoOfStoredDate, todayInTimezone, type IsoDate } from './calendar-dates'
import { StandupError } from './errors'
import { loadSprintHealthTotals } from './jobs/sprint-health'
import { minutes, type Minutes } from './minutes'
import { computeSprintHealth } from './sprint-health'

export interface ScheduleDayMetrics {
  /** Allocation percentage (0-100) of planned minutes vs standard attendee capacity (spec §15.7). */
  allocationPercentage?: number
  totalPlannedMinutes?: number
  /** Number of capacity/planning overrides issued on this stand-up (spec §15.7). */
  overridesCount?: number
  /** Number of active carry-forward items on this day (spec §15.7). */
  carryForwardCount?: number
  /** Actual duration of the meeting in minutes if completed. */
  actualDurationMinutes?: number
  /** Attendance breakdown (present count / expected count). */
  attendance?: { present: number; total: number }
}

export interface ScheduleDay extends ScheduleDayMetrics {
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
  facilitatorName: string
  expectedAttendeeIds: string[]
  /** UI-9: why this day does not run. */
  skippedReason?: string
  cancelledReason?: string
  wasBackfilled: boolean
  hasCalendarAnomaly: boolean
}

export interface SprintHealthSummary {
  estimateDebt: {
    outstandingMinutes: Minutes
    affectedMembersCount: number
  }
  carryForward: {
    openCount: number
    oldestAgeInStandups: number
    chronicCount: number
  }
  overrides: {
    totalCount: number
  }
  capacityBalance: {
    remainingEstimateMinutes: Minutes
    remainingCapacityMinutes: Minutes
    overageMinutes: Minutes
    exceedsCapacity: boolean
  }
  progress: {
    completedDays: number
    missedDays: number
    totalWorkingDays: number
    percentComplete: number
  }
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
  health?: SprintHealthSummary
}

export interface ScheduleOptions {
  now?: Date
}

/** Falls back to the email, then the id — a blank name row is unusable. */
function displayName(person: any): string {
  const full = [person.firstName, person.lastName].filter(Boolean).join(' ').trim()
  return full || person.email || String(person._id)
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
  const sprintObjectId = new mongoose.Types.ObjectId(sprintId)

  const [
    calendar,
    standups,
    summaries,
    allocationAgg,
    overrideAgg,
    cfwItems,
    debtSummaries
  ] = await Promise.all([
    WorkingCalendar.findOne({ project: projectId, scope: 'project' })
      .select('timezone standardMinutesPerDay')
      .lean() as Promise<any>,
    Standup.find({ sprint: sprintId }).sort({ standupDate: 1 }).lean() as Promise<any[]>,
    StandupSummary.find({ sprint: sprintObjectId })
      .select('standup attendance overridesIssued carryForwardState headerFacts')
      .lean() as Promise<any[]>,
    Allocation.aggregate([
      { $match: { sprint: sprintObjectId } },
      {
        $group: {
          _id: '$standup',
          totalPlannedMinutes: { $sum: '$plannedMinutes' },
          count: { $sum: 1 }
        }
      }
    ]),
    StandupOverride.aggregate([
      { $match: { sprint: sprintObjectId } },
      { $group: { _id: '$standup', count: { $sum: 1 } } }
    ]),
    CarryForwardItem.find({
      sprint: sprintObjectId,
      status: { $in: OPEN_CARRY_FORWARD_STATUSES }
    }).select('currentStandup ageInStandups tags').lean() as Promise<any[]>,
    MemberSprintDebtSummary.find({ sprint: sprintObjectId })
      .select('outstandingMinutes member')
      .lean() as Promise<any[]>
  ])

  const timezone = calendar?.timezone ?? 'UTC'
  const standardDayMinutes = calendar?.standardMinutesPerDay ?? 480

  const facilitatorIds = Array.from(new Set(standups.map((standup) => String(standup.facilitator))))
  const facilitators = await User.find({ _id: { $in: facilitatorIds } })
    .select('firstName lastName email')
    .lean() as any[]
  const facilitatorNameById = new Map(facilitators.map((person) => [String(person._id), displayName(person)]))

  // Index auxiliary data by standupId string
  const summaryByStandup = new Map(summaries.map((s) => [String(s.standup), s]))
  const allocationByStandup = new Map(
    allocationAgg.map((a) => [String(a._id), a.totalPlannedMinutes as number])
  )
  const overrideCountByStandup = new Map(
    overrideAgg.map((o) => [String(o._id), o.count as number])
  )

  // Pre-calculate sprint-wide health metrics (spec §15.7)
  let outstandingDebtMinutes = 0
  let affectedMembersCount = 0
  for (const row of debtSummaries) {
    if (row.outstandingMinutes > 0) {
      outstandingDebtMinutes += row.outstandingMinutes
      affectedMembersCount += 1
    }
  }

  const openCfwCount = cfwItems.length
  let oldestCfwAge = 0
  let chronicCfwCount = 0
  const cfwCountByStandup = new Map<string, number>()

  for (const item of cfwItems) {
    const age = item.ageInStandups ?? 0
    if (age > oldestCfwAge) oldestCfwAge = age
    // §13.4: "chronic" is a tag CFW-14 stamps onto the item, not a stored
    // boolean of its own — `age >= 3` is kept as a fallback for an item that
    // has aged into chronic territory but has not yet been re-tagged.
    if ((item.tags ?? []).includes('chronic') || age >= 3) chronicCfwCount += 1
    if (item.currentStandup) {
      const standupKey = String(item.currentStandup)
      cfwCountByStandup.set(standupKey, (cfwCountByStandup.get(standupKey) ?? 0) + 1)
    }
  }

  let totalOverridesCount = 0
  for (const o of overrideAgg) {
    totalOverridesCount += o.count
  }

  // Load scope vs capacity balance (CC-11 / §10.3)
  let capacityBalance = {
    remainingEstimateMinutes: minutes(0),
    remainingCapacityMinutes: minutes(0),
    overageMinutes: minutes(0),
    exceedsCapacity: false
  }

  try {
    const totals = await loadSprintHealthTotals(sprint, options.now ?? new Date())
    const healthResult = computeSprintHealth(totals)
    capacityBalance = {
      remainingEstimateMinutes: totals.remainingEstimateMinutes,
      remainingCapacityMinutes: totals.remainingCapacityMinutes,
      overageMinutes: healthResult.overageMinutes,
      exceedsCapacity: healthResult.exceedsCapacity
    }
  } catch {
    // Graceful fallback for tests/environments without initialized working calendar
  }

  const days: ScheduleDay[] = standups.map((standup) => {
    const standupId = String(standup._id)
    const summary = summaryByStandup.get(standupId)
    const isCompleted = standup.status === 'Completed'
    const isOpenable = standup.status !== 'Skipped_Holiday' && standup.status !== 'Cancelled'

    // Operational metrics
    const totalPlanned = allocationByStandup.get(standupId)
    const expectedAttendeesCount = (standup.expectedAttendees ?? []).length
    const expectedCapacity = expectedAttendeesCount * standardDayMinutes

    let allocationPercentage: number | undefined
    if (isOpenable && totalPlanned !== undefined && expectedCapacity > 0) {
      allocationPercentage = Math.min(100, Math.round((totalPlanned / expectedCapacity) * 100))
    }

    // Overrides count: from summary if completed, or live overrides
    const overridesCount = summary?.overridesIssued?.length ?? overrideCountByStandup.get(standupId) ?? (isCompleted ? 0 : undefined)

    // Carry-forward count: from summary if completed, or live items
    const carryForwardCount = summary?.carryForwardState?.length ?? cfwCountByStandup.get(standupId) ?? (isCompleted ? 0 : undefined)

    // Actual duration: from standup or summary
    const actualDurationMinutes =
      standup.actualDurationMinutes ?? summary?.headerFacts?.durationMinutes ?? undefined

    // Attendance breakdown
    let attendance: { present: number; total: number } | undefined
    if (standup.attendance && standup.attendance.length > 0) {
      const present = standup.attendance.filter((a: any) => a.state === 'present').length
      attendance = { present, total: standup.attendance.length }
    } else if (summary?.attendance && summary.attendance.length > 0) {
      const present = summary.attendance.filter((a: any) => a.status === 'present').length
      attendance = { present, total: summary.attendance.length }
    }

    return {
      standupId,
      date: standup.standupDate,
      status: standup.status,
      shape: standup.shape,
      sprintDayNumber: standup.sprintDayNumber,
      totalSprintDays: standup.totalSprintDays,
      displayedDayNumber: standup.displayedDayNumber,
      scheduledStartAt: standup.scheduledStartAt.toISOString(),
      durationMinutes: standup.durationMinutes,
      facilitatorId: String(standup.facilitator),
      facilitatorName: facilitatorNameById.get(String(standup.facilitator)) ?? String(standup.facilitator),
      expectedAttendeeIds: (standup.expectedAttendees ?? []).map(String),
      skippedReason: standup.skippedReason,
      cancelledReason: standup.cancelledReason,
      wasBackfilled: standup.wasBackfilled === true,
      hasCalendarAnomaly: (standup.calendarAnomalies ?? []).length > 0,
      allocationPercentage,
      totalPlannedMinutes: totalPlanned,
      overridesCount,
      carryForwardCount,
      actualDurationMinutes,
      attendance
    }
  })

  const totalWorkingDays = days.filter(
    (day) => day.status !== 'Skipped_Holiday' && day.status !== 'Cancelled'
  ).length
  const completedDays = days.filter((day) => day.status === 'Completed').length
  const missedDays = days.filter((day) => day.status === 'Missed').length
  const percentComplete = totalWorkingDays > 0 ? Math.round((completedDays / totalWorkingDays) * 100) : 0

  const health: SprintHealthSummary = {
    estimateDebt: {
      outstandingMinutes: minutes(outstandingDebtMinutes),
      affectedMembersCount
    },
    carryForward: {
      openCount: openCfwCount,
      oldestAgeInStandups: oldestCfwAge,
      chronicCount: chronicCfwCount
    },
    overrides: {
      totalCount: totalOverridesCount
    },
    capacityBalance,
    progress: {
      completedDays,
      missedDays,
      totalWorkingDays,
      percentComplete
    }
  }

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
    totalSprintDays: totalWorkingDays,
    days,
    health
  }
}
