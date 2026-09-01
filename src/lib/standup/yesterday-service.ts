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
import { User } from '@/models/User'

import { loadCalendarContext } from './calendar-service'
import {
  findPreviousStandup,
  resolveStatusSets
} from './debt-position'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Standup } from '@/models/Standup'
import { StandupError } from './errors'
import { minutes, subtractMinutes, ZERO_MINUTES, type Minutes } from './minutes'
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

export type { YesterdayRow, BucketedRows }
