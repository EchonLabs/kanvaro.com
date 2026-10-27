/**
 * Logged time, indexed for the variance engine (spec §12.1).
 *
 * "How many minutes did this person log on this task on this date" is asked by
 * the classifier, by Panel 2's yesterday review, by the run screen and by the
 * E40 recompute path. Written four times it becomes four subtly different day
 * boundaries, and a variance number that changes depending on who asked is
 * worse than no number at all — so it is written once, here.
 *
 * **The day is the project's calendar day, not a UTC day.** A stand-up's date
 * is a date in the project timezone (§7.1), and `dayBoundsInTimezone` turns it
 * into the half-open instant range the query needs. In Colombo that moves the
 * boundary five and a half hours; an entry at 00:15 local belongs to today
 * even though UTC still calls it yesterday.
 *
 * **Only completed entries count.** A running timer is not logged work: the
 * hours are still being spent, and counting them measures a plan against
 * itself mid-execution.
 *
 * **`isApproved` is deliberately not filtered on.** Approval is a billing
 * workflow that runs days later. A stand-up has to reflect what happened
 * yesterday morning, not what a manager has since signed off — filtering on it
 * would make this morning's variance depend on somebody else's inbox.
 */
import { Types } from 'mongoose'

import { TimeEntry } from '@/models/TimeEntry'

import { dayBoundsInTimezone, type IsoDate } from './calendar-dates'
import { minutes, ZERO_MINUTES, type Minutes } from './minutes'

export interface LoggedMinutesQuery {
  projectId: string
  /** The stand-up's calendar date, in the project timezone. */
  date: IsoDate
  timezone: string
  /** Everybody the stand-up expects. Time logged by anybody else is not its business. */
  memberIds: string[]
}

export interface LoggedPair {
  memberId: string
  taskId: string
  minutes: Minutes
}

export interface LoggedMinutesIndex {
  /** Minutes this member logged on this task on that date. Zero when absent. */
  forMemberTask(memberId: string, taskId: string): Minutes
  /** Every (member, task) pair with logged time that day — E39's unplanned rows. */
  pairs(): LoggedPair[]
  totalForMember(memberId: string): Minutes
}

const key = (memberId: string, taskId: string) => `${memberId}:${taskId}`

/** One day's logged time for one stand-up's members, as an index. */
export async function loadLoggedMinutes(
  query: LoggedMinutesQuery
): Promise<LoggedMinutesIndex> {
  const { from, to } = dayBoundsInTimezone(query.date, query.timezone)

  const rows: { _id: { user: unknown; task: unknown }; minutes: number }[] =
    query.memberIds.length === 0
      ? []
      : await TimeEntry.aggregate([
          {
            $match: {
              project: toObjectIdMatch(query.projectId),
              user: { $in: query.memberIds.map(toObjectIdMatch) },
              // A project-level entry with no task belongs to no allocation and
              // must not surface as unplanned work against one.
              task: { $ne: null, $exists: true },
              status: 'completed',
              startTime: { $gte: from, $lt: to }
            }
          },
          { $group: { _id: { user: '$user', task: '$task' }, minutes: { $sum: '$duration' } } }
        ])

  const byPair = new Map<string, Minutes>()
  const byMember = new Map<string, Minutes>()
  const pairs: LoggedPair[] = []

  for (const row of rows) {
    const memberId = String(row._id.user)
    const taskId = String(row._id.task)
    const value = minutes(Math.round(row.minutes))

    byPair.set(key(memberId, taskId), value)
    byMember.set(memberId, minutes((byMember.get(memberId) ?? 0) + value))
    pairs.push({ memberId, taskId, minutes: value })
  }

  return {
    forMemberTask: (memberId, taskId) => byPair.get(key(memberId, taskId)) ?? ZERO_MINUTES,
    pairs: () => pairs,
    totalForMember: (memberId) => byMember.get(memberId) ?? ZERO_MINUTES
  }
}

/**
 * Running total logged against each task, across every member and every day —
 * the second half of §12.1's task-scope variance.
 *
 * Aggregated from `TimeEntry` rather than read off `Task.totalLoggedMinutes`.
 * That mirror is maintained by the time-tracking module and can lag; if it
 * disagreed with the day figures above — which come from this same
 * collection — one row of the variance panel would contradict the one below
 * it, and the PM would have no way to tell which number to believe.
 */
export async function loadTotalLoggedOnTasks(taskIds: string[]): Promise<Map<string, Minutes>> {
  const totals = new Map<string, Minutes>()
  if (taskIds.length === 0) return totals

  for (const taskId of taskIds) totals.set(taskId, ZERO_MINUTES)

  const rows: { _id: unknown; minutes: number }[] = await TimeEntry.aggregate([
    { $match: { task: { $in: taskIds.map(toObjectIdMatch) }, status: 'completed' } },
    { $group: { _id: '$task', minutes: { $sum: '$duration' } } }
  ])

  for (const row of rows) {
    totals.set(String(row._id), minutes(Math.round(row.minutes)))
  }

  return totals
}

/**
 * Aggregation pipelines do not cast strings to ObjectIds the way queries do,
 * so ids are converted explicitly. A malformed id becomes a value that matches
 * nothing rather than throwing: a stale id in a request should return no hours,
 * not a 500.
 */
function toObjectIdMatch(id: string): unknown {
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id
}
