/**
 * Panel 2's data (spec §15.8.4, RUN-9..RUN-13).
 *
 * Assembles yesterday's allocations, what was actually logged against them,
 * and the unplanned rows E39 demands — time logged against a task nobody
 * planned for that member, which must appear rather than vanish.
 *
 * The previous stand-up is resolved by `findPreviousStandup` in
 * `debt-position.ts`, shared with the variance engine on purpose: if Panel 2
 * and Panel 3 disagreed about which day "yesterday" was, they would show two
 * different stories about the same morning.
 */
import { Allocation } from '@/models/Allocation'
import { Task } from '@/models/Task'
import { TimeEntry } from '@/models/TimeEntry'
import { User } from '@/models/User'

import { STANDUP_MANUAL_TIME_ENTRY_CATEGORY } from '@/lib/time-tracking-server'

import { recordAudit } from './audit'
import { dayBoundsInTimezone } from './calendar-dates'
import { loadCalendarContext } from './calendar-service'
import {
  findPreviousStandup,
  resolveStatusSets
} from './debt-position'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Standup } from '@/models/Standup'
import { StandupError } from './errors'
import { formatMinutesAsHours, minutes, subtractMinutes, ZERO_MINUTES, type Minutes } from './minutes'
import { loadLoggedMinutes } from './time-logs'
import {
  partitionYesterday,
  type BucketedRows,
  type YesterdayRow
} from './yesterday'

export interface YesterdayPanelData {
  standupId: string
  previousStandupId?: string
  previousStandupDate?: string
  /** RUN-9's four buckets, in order, always all four. */
  buckets: BucketedRows[]
  computedAt: string
}

export async function loadYesterdayPanel(standupId: string): Promise<YesterdayPanelData> {
  const standup = (await Standup.findById(standupId).lean()) as any
  if (!standup) {
    throw new StandupError('NOT_FOUND', 'That stand-up no longer exists.', { standupId })
  }

  const settings = (await ProjectStandupSettings.findOne({ project: standup.project }).lean()) as any
  const statusSets = resolveStatusSets(settings)

  const previous = await findPreviousStandup(standup)
  if (!previous) {
    // Day one, or a sprint whose earlier stand-ups were all skipped. The panel
    // renders its empty state rather than an empty list of buckets.
    return {
      standupId,
      buckets: partitionYesterday({ rows: [], statusSets }),
      computedAt: new Date().toISOString()
    }
  }

  const allocations = (await Allocation.find({ standup: previous._id })
    .sort({ createdAt: 1 })
    .lean()) as any[]

  const memberIds = Array.from(
    new Set([
      ...allocations.map((row) => String(row.member)),
      ...(standup.expectedAttendees ?? []).map((id: unknown) => String(id))
    ])
  )

  const calendar = await loadCalendarContext(
    String(standup.project),
    previous.standupDate,
    previous.standupDate
  )

  const logged = await loadLoggedMinutes({
    projectId: String(standup.project),
    date: previous.standupDate,
    timezone: calendar.timezone,
    memberIds
  })

  // Every task that either was planned or had time logged against it.
  const taskIds = Array.from(
    new Set([
      ...allocations.map((row) => String(row.task)),
      ...logged.pairs().map((pair) => pair.taskId)
    ])
  )

  const [tasks, people] = await Promise.all([
    Task.find({ _id: { $in: taskIds } })
      .select('displayId title status remainingEstimateMinutes standupSpillCount')
      .lean() as Promise<any[]>,
    User.find({ _id: { $in: memberIds } })
      .select('firstName lastName email')
      .lean() as Promise<any[]>
  ])

  const taskById = new Map(tasks.map((task) => [String(task._id), task]))
  const nameById = new Map(
    people.map((person) => [
      String(person._id),
      [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email
    ])
  )

  const planned = new Set(
    allocations.map((row) => `${String(row.member)}:${String(row.task)}`)
  )

  const rows: YesterdayRow[] = allocations.map((row) => {
    const memberId = String(row.member)
    const taskId = String(row.task)
    const task = taskById.get(taskId)
    const loggedMinutes = logged.forMemberTask(memberId, taskId)
    const plannedMinutes = minutes(row.plannedMinutes ?? 0)

    return {
      allocationId: String(row._id),
      taskId,
      taskKey: task?.displayId,
      title: task?.title ?? '',
      memberId,
      memberName: nameById.get(memberId) ?? memberId,
      // Rows written before Phase 8 carry no stamp; the current status then
      // reads as unchanged, which is the conservative bucket.
      previousStatus: row.taskStatusAtAllocation ?? task?.status ?? 'unknown',
      currentStatus: task?.status ?? 'unknown',
      plannedMinutes,
      loggedMinutes,
      dayVarianceMinutes: subtractMinutes(loggedMinutes, plannedMinutes),
      remainingEstimateMinutes: minutes(task?.remainingEstimateMinutes ?? 0),
      ageInStandups: ageOf(task, row),
      unplanned: false
    }
  })

  // E39. Time logged against something nobody planned for that member is real
  // work and belongs on the panel, flagged, rather than disappearing because no
  // allocation happens to point at it.
  for (const pair of logged.pairs()) {
    if (planned.has(`${pair.memberId}:${pair.taskId}`)) continue
    const task = taskById.get(pair.taskId)

    rows.push({
      taskId: pair.taskId,
      taskKey: task?.displayId,
      title: task?.title ?? '',
      memberId: pair.memberId,
      memberName: nameById.get(pair.memberId) ?? pair.memberId,
      previousStatus: task?.status ?? 'unknown',
      currentStatus: task?.status ?? 'unknown',
      plannedMinutes: ZERO_MINUTES,
      loggedMinutes: pair.minutes,
      dayVarianceMinutes: pair.minutes,
      remainingEstimateMinutes: minutes(task?.remainingEstimateMinutes ?? 0),
      ageInStandups: 1,
      unplanned: true
    })
  }

  return {
    standupId,
    previousStandupId: String(previous._id),
    previousStandupDate: previous.standupDate,
    buckets: partitionYesterday({ rows, statusSets }),
    computedAt: new Date().toISOString()
  }
}

/**
 * RUN-12's age badge, in stand-ups rather than days (CFW-2's unit).
 *
 * `Task.standupSpillCount` is Phase 9's to maintain; until it exists, an
 * allocation that continues another is at least the second in its chain.
 */
function ageOf(task: any, allocation: any): number {
  if (Number.isInteger(task?.standupSpillCount) && task.standupSpillCount > 0) {
    return task.standupSpillCount
  }
  return allocation?.carriedFromAllocation || allocation?.carryChainRoot ? 2 : 1
}

/**
 * RUN-10's "adjust that member's logged hours for that day", without
 * rewriting a timer entry someone else owns.
 *
 * A row's `loggedMinutes` is a sum over every `TimeEntry` that day (§12.1);
 * there is no single number to edit. So the PM's adjustment is written as its
 * own entry, tagged `STANDUP_MANUAL_TIME_ENTRY_CATEGORY`, sized to make the
 * *total* equal what the PM typed — increase it, and the entry's duration
 * grows; decrease it, and the entry's duration shrinks, floored at zero. It
 * can never go negative, so a request to reduce the total below what real
 * timer entries already logged that day is refused rather than silently
 * clamped: the honest answer is "delete or edit those entries directly",
 * not a number that quietly stops matching the timesheet.
 */
export async function adjustLoggedMinutes(input: {
  standupId: string
  taskId: string
  memberId: string
  requestedMinutes: number
  actor: { userId: string }
}): Promise<{ loggedMinutes: Minutes }> {
  const standup = (await Standup.findById(input.standupId).lean()) as any
  if (!standup) {
    throw new StandupError('NOT_FOUND', 'That stand-up no longer exists.', {
      standupId: input.standupId
    })
  }

  if (!Number.isInteger(input.requestedMinutes) || input.requestedMinutes < 0) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'Logged hours must be zero or a positive whole number of minutes.',
      { field: 'loggedMinutes' }
    )
  }

  const previous = await findPreviousStandup(standup)
  if (!previous) {
    throw new StandupError('VALIDATION_FAILED', 'There is no previous day to adjust.', {
      standupId: input.standupId
    })
  }

  const calendar = await loadCalendarContext(
    String(standup.project),
    previous.standupDate,
    previous.standupDate
  )
  const { from, to } = dayBoundsInTimezone(previous.standupDate, calendar.timezone)

  const entries = (await TimeEntry.find({
    task: input.taskId,
    user: input.memberId,
    status: 'completed',
    startTime: { $gte: from, $lt: to }
  }).lean()) as any[]

  const manual = entries.find((entry) => entry.category === STANDUP_MANUAL_TIME_ENTRY_CATEGORY)
  const otherMinutes = entries
    .filter((entry) => String(entry._id) !== String(manual?._id))
    .reduce((sum, entry) => sum + Math.round(entry.duration ?? 0), 0)

  const manualMinutes = input.requestedMinutes - otherMinutes
  if (manualMinutes < 0) {
    throw new StandupError(
      'VALIDATION_FAILED',
      `Cannot reduce logged hours below the ${formatMinutesAsHours(minutes(otherMinutes))} already tracked outside the stand-up.`,
      { otherMinutes }
    )
  }

  const before = { loggedMinutes: otherMinutes + (manual?.duration ?? 0) }

  if (manual) {
    await TimeEntry.updateOne({ _id: manual._id }, { $set: { duration: manualMinutes } })
  } else if (manualMinutes > 0) {
    await TimeEntry.create({
      user: input.memberId,
      organization: standup.organization,
      project: standup.project,
      task: input.taskId,
      description: 'Logged hours adjusted during stand-up',
      startTime: from,
      duration: manualMinutes,
      isBillable: false,
      status: 'completed',
      category: STANDUP_MANUAL_TIME_ENTRY_CATEGORY
    })
  }

  await recordAudit({
    actor: { type: 'user', userId: input.actor.userId },
    organizationId: String(standup.organization),
    projectId: String(standup.project),
    action: 'standup_attendance_set',
    entityType: 'task',
    entityId: input.taskId,
    before,
    after: { loggedMinutes: input.requestedMinutes },
    context: { standupId: input.standupId, memberId: input.memberId, adjustedLoggedHours: true }
  })

  return { loggedMinutes: minutes(input.requestedMinutes) }
}

export type { YesterdayRow, BucketedRows }
