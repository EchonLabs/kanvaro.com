/**
 * Records that a planning poker round estimated some tasks (PC-9).
 *
 * PC-9 asks whether a round actually happened, and it answers that from the
 * poker session queue rather than from `Task.estimateMethod` — so that a PM
 * correcting a number by hand afterwards does not retroactively invalidate the
 * round. That means a fixture cannot satisfy PC-9 by setting
 * `estimateMethod: 'poker'` on a task; there has to be a session saying so.
 *
 * This is the one place integration fixtures create that session, so a change
 * to how coverage is recorded moves one file rather than eight.
 */
import mongoose from 'mongoose'

import { PokerSession } from '@/models/PokerSession'

export async function seedPokerCoverage(params: {
  organization: mongoose.Types.ObjectId | string
  project: mongoose.Types.ObjectId | string
  sprint: mongoose.Types.ObjectId | string
  facilitator: mongoose.Types.ObjectId | string
  taskIds: Array<mongoose.Types.ObjectId | string>
}) {
  if (params.taskIds.length === 0) return null

  return PokerSession.create({
    organization: params.organization,
    project: params.project,
    sprint: params.sprint,
    facilitator: params.facilitator,
    createdBy: params.facilitator,
    participants: [params.facilitator],
    status: 'completed',
    completedAt: new Date(),
    queue: params.taskIds.map((taskId) => ({
      task: taskId,
      status: 'estimated',
      roundCount: 1,
      finalValue: 3,
      consensusReached: true,
      estimatedAt: new Date(),
      estimatedBy: params.facilitator
    }))
  })
}

/** Covers every non-archived task currently in a sprint. */
export async function coverSprintTasks(params: {
  organization: mongoose.Types.ObjectId | string
  project: mongoose.Types.ObjectId | string
  sprint: mongoose.Types.ObjectId | string
  facilitator: mongoose.Types.ObjectId | string
}) {
  const { Task } = await import('@/models/Task')
  const tasks = await Task.find({ sprint: params.sprint, archived: { $ne: true } })
    .select('_id')
    .lean()

  return seedPokerCoverage({
    ...params,
    taskIds: (tasks as any[]).map((task) => task._id)
  })
}
