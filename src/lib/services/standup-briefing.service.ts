import mongoose from 'mongoose'
import { ActivityLog } from '@/models/ActivityLog'
import { TimeEntry } from '@/models/TimeEntry'
import { StandupCommitment } from '@/models/StandupCommitment'
import {
  IStandupBriefingSnapshot,
  IStandupBriefingGap,
  IStandupBriefingNoMovement,
  IStandupBriefingZeroTime,
  IStandupBriefingOpenNote,
} from '@/models/StandupSession'

/**
 * Returns a Set of taskId strings that had at least one status change
 * within the given working circle window.
 */
export async function detectNoMovement(
  taskIds: mongoose.Types.ObjectId[],
  circleStart: Date,
  circleEnd: Date
): Promise<Set<string>> {
  if (taskIds.length === 0) return new Set()

  const logs = await ActivityLog.find({
    action: 'task_status_changed',
    entityId: { $in: taskIds },
    createdAt: { $gte: circleStart, $lte: circleEnd },
  }).select('entityId').lean()

  const movedIds = new Set<string>()
  for (const log of logs) {
    if (log.entityId) movedIds.add(log.entityId.toString())
  }
  return movedIds
}

/**
 * Returns a map of `${userId}_${taskId}` → total minutes logged
 * within the working circle window.
 */
export async function aggregateTimeLogs(
  userIds: mongoose.Types.ObjectId[],
  taskIds: mongoose.Types.ObjectId[],
  circleStart: Date,
  circleEnd: Date
): Promise<Map<string, number>> {
  if (userIds.length === 0 || taskIds.length === 0) return new Map()

  const entries = await TimeEntry.find({
    user: { $in: userIds },
    task: { $in: taskIds },
    startTime: { $gte: circleStart },
    endTime: { $lte: circleEnd },
    status: { $in: ['completed', 'paused'] },
  }).select('user task duration').lean()

  const timeMap = new Map<string, number>()
  for (const entry of entries) {
    if (!entry.task) continue
    const key = `${entry.user}_${entry.task}`
    timeMap.set(key, (timeMap.get(key) ?? 0) + (entry.duration ?? 0))
  }
  return timeMap
}

/**
 * Finds all unresolved PM notes from previous standup commitments for this project
 * where the note has not been resolved and the task is still not done.
 */
async function fetchOpenNotes(
  projectId: mongoose.Types.ObjectId,
  beforeDate: Date
): Promise<IStandupBriefingOpenNote[]> {
  const unresolvedCommitments = await StandupCommitment.find({
    project: projectId,
    date: { $lt: beforeDate },
    'pmNote.resolved': false,
    pmNote: { $ne: null },
  })
    .populate('user', 'firstName lastName')
    .lean()

  const openNotes: IStandupBriefingOpenNote[] = []

  for (const commitment of unresolvedCommitments) {
    if (!commitment.pmNote) continue

    const daysDiff = Math.floor(
      (beforeDate.getTime() - new Date(commitment.date).getTime()) / (1000 * 60 * 60 * 24)
    )

    // Surface one note per commitment (notes apply to the whole commitment / person)
    // Use the first unfulfilled task as the representative task
    const openTask = commitment.tasks.find((t: any) => !t.fulfilled)
    if (!openTask) continue

    openNotes.push({
      commitmentId: commitment._id as mongoose.Types.ObjectId,
      taskId: openTask.task as mongoose.Types.ObjectId,
      taskTitle: openTask.taskTitle,
      userId: commitment.user as mongoose.Types.ObjectId,
      noteContent: commitment.pmNote.content,
      noteCreatedAt: commitment.pmNote.createdAt,
      daysOpen: daysDiff,
    })
  }

  return openNotes
}

export interface BuildBriefingOptions {
  projectId: mongoose.Types.ObjectId
  sessionDate: Date
  workingCircleStart: Date
  workingCircleEnd: Date
  previousSessionId: mongoose.Types.ObjectId | null
}

/**
 * Main entry point — builds the complete briefing snapshot for a standup session.
 * Reads yesterday's commitments, scores them against current task state + activity logs,
 * and surfaces open PM notes.
 */
export async function buildBriefingSnapshot(
  options: BuildBriefingOptions
): Promise<IStandupBriefingSnapshot> {
  const { projectId, sessionDate, workingCircleStart, workingCircleEnd, previousSessionId } = options

  const gaps: IStandupBriefingGap[] = []
  const noMovementTasks: IStandupBriefingNoMovement[] = []
  const zeroTimeTasks: IStandupBriefingZeroTime[] = []

  if (previousSessionId) {
    const previousCommitments = await StandupCommitment.find({
      standupSession: previousSessionId,
    }).lean()

    if (previousCommitments.length > 0) {
      // Collect all unique task IDs and user IDs from yesterday's commitments
      const allTaskIds: mongoose.Types.ObjectId[] = []
      const allUserIds: mongoose.Types.ObjectId[] = []

      for (const commitment of previousCommitments) {
        allUserIds.push(commitment.user as mongoose.Types.ObjectId)
        for (const t of commitment.tasks) {
          allTaskIds.push(t.task as mongoose.Types.ObjectId)
        }
      }

      const [movedTaskIds, timeMap] = await Promise.all([
        detectNoMovement(allTaskIds, workingCircleStart, workingCircleEnd),
        aggregateTimeLogs(allUserIds, allTaskIds, workingCircleStart, workingCircleEnd),
      ])

      // Re-fetch live task statuses in a single query
      const { Task } = await import('@/models/Task')
      const liveTasks = await Task.find({ _id: { $in: allTaskIds } })
        .select('_id status')
        .lean()
      const liveStatusMap = new Map(liveTasks.map((t) => [(t._id as any).toString(), t.status]))

      for (const commitment of previousCommitments) {
        const userId = commitment.user as mongoose.Types.ObjectId
        const daysSinceCommitment = Math.floor(
          (sessionDate.getTime() - new Date(commitment.date).getTime()) / (1000 * 60 * 60 * 24)
        )

        for (const t of commitment.tasks) {
          const taskId = t.task as mongoose.Types.ObjectId
          const taskIdStr = taskId.toString()
          const currentStatus = liveStatusMap.get(taskIdStr) ?? t.statusAtCommitment
          const timeLogged = timeMap.get(`${userId}_${taskIdStr}`) ?? 0
          const moved = movedTaskIds.has(taskIdStr)
          const isDone = currentStatus === 'done'

          if (!isDone) {
            gaps.push({
              userId,
              taskId,
              taskTitle: t.taskTitle,
              statusAtCommitment: t.statusAtCommitment,
              currentStatus,
              daysOpen: daysSinceCommitment,
            })

            if (!moved) {
              noMovementTasks.push({
                taskId,
                taskTitle: t.taskTitle,
                assignedUserId: userId,
                lastMovedAt: null,
              })
            }

            if (timeLogged === 0) {
              zeroTimeTasks.push({
                taskId,
                taskTitle: t.taskTitle,
                assignedUserId: userId,
              })
            }
          }
        }
      }
    }
  }

  const openNotes = await fetchOpenNotes(projectId, sessionDate)

  return {
    generatedAt: new Date(),
    gaps,
    noMovementTasks,
    zeroTimeTasks,
    openNotes,
  }
}

/**
 * Computes per-user commitment fulfillment stats for historical trend data.
 * Used by the analysis service to enrich the Groq payload.
 */
export async function computeHistoricalTrends(
  projectId: mongoose.Types.ObjectId,
  beforeDate: Date,
  lookbackDays: number = 7
): Promise<{
  sessionsAnalyzed: number
  avgTeamFulfillmentRate: number
  recurringCarryOvers: { taskTitle: string; taskId: string; daysOpen: number }[]
  perMember: { userId: string; name: string; fulfillmentRate: number }[]
}> {
  const since = new Date(beforeDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000)

  const commitments = await StandupCommitment.find({
    project: projectId,
    date: { $gte: since, $lt: beforeDate },
  })
    .populate('user', 'firstName lastName')
    .lean()

  if (commitments.length === 0) {
    return { sessionsAnalyzed: 0, avgTeamFulfillmentRate: 0, recurringCarryOvers: [], perMember: [] }
  }

  const sessionDates = new Set(commitments.map((c) => new Date(c.date).toDateString()))
  const sessionsAnalyzed = sessionDates.size

  let totalCommitted = 0
  let totalFulfilled = 0

  // Track carry-over frequency per task
  const carryOverCount = new Map<string, { taskTitle: string; count: number; taskId: string }>()
  const memberStats = new Map<string, { name: string; committed: number; fulfilled: number }>()

  for (const commitment of commitments) {
    const user = commitment.user as any
    const userId = user._id?.toString() ?? commitment.user.toString()
    const name = user.firstName ? `${user.firstName} ${user.lastName}` : userId

    if (!memberStats.has(userId)) {
      memberStats.set(userId, { name, committed: 0, fulfilled: 0 })
    }
    const stats = memberStats.get(userId)!

    for (const t of commitment.tasks) {
      totalCommitted++
      stats.committed++
      if (t.fulfilled) {
        totalFulfilled++
        stats.fulfilled++
      } else {
        const taskIdStr = t.task.toString()
        const existing = carryOverCount.get(taskIdStr)
        if (existing) {
          existing.count++
        } else {
          carryOverCount.set(taskIdStr, { taskTitle: t.taskTitle, count: 1, taskId: taskIdStr })
        }
      }
    }
  }

  const avgTeamFulfillmentRate = totalCommitted > 0 ? totalFulfilled / totalCommitted : 0

  const recurringCarryOvers = Array.from(carryOverCount.values())
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((c) => ({ taskTitle: c.taskTitle, taskId: c.taskId, daysOpen: c.count }))

  const perMember = Array.from(memberStats.entries()).map(([userId, s]) => ({
    userId,
    name: s.name,
    fulfillmentRate: s.committed > 0 ? s.fulfilled / s.committed : 0,
  }))

  return { sessionsAnalyzed, avgTeamFulfillmentRate, recurringCarryOvers, perMember }
}
