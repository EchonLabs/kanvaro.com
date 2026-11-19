import mongoose from 'mongoose'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'

const idOf = (value: any): string | undefined => {
  if (!value) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value._id) return value._id.toString()
  return value.toString()
}

/** Extracts unique assignee IDs from a task including its subtasks. */
function assigneeIdsOfTask(task: any): string[] {
  const ids: Array<string | undefined> = (task?.assignedTo ?? []).map((entry: any) => idOf(entry?.user ?? entry))
  for (const subtask of task?.subtasks ?? []) {
    ids.push(idOf(subtask?.assignedTo))
    for (const nested of subtask?.subtasks ?? []) {
      ids.push(idOf(nested?.assignedTo))
    }
  }
  return ids.filter((id): id is string => !!id && mongoose.Types.ObjectId.isValid(id))
}

/**
 * Adds task assignees to Sprint.teamMembers and upcoming standups.
 */
export async function syncSprintTeamFromTasks(taskIds: Array<string | mongoose.Types.ObjectId>): Promise<void> {
  if (!taskIds || taskIds.length === 0) return

  const tasks = (await Task.find({ _id: { $in: taskIds }, sprint: { $ne: null } })
    .select('sprint assignedTo subtasks')
    .lean()) as any[]

  const assigneesBySprint = new Map<string, Set<string>>()
  for (const task of tasks) {
    const sprintId = idOf(task.sprint)
    if (!sprintId) continue
    const set = assigneesBySprint.get(sprintId) ?? new Set<string>()
    assigneeIdsOfTask(task).forEach((id) => set.add(id))
    assigneesBySprint.set(sprintId, set)
  }

  for (const [sprintId, assignees] of Array.from(assigneesBySprint.entries())) {
    if (assignees.size === 0) continue
    const memberIds = Array.from(assignees).map((id) => new mongoose.Types.ObjectId(id))

    const result = await Sprint.updateOne(
      { _id: sprintId, status: { $nin: ['completed', 'cancelled'] } },
      { $addToSet: { teamMembers: { $each: memberIds } } }
    )

    // Add new members to upcoming standups that haven't started yet
    if (result.modifiedCount > 0) {
      await Standup.updateMany(
        { sprint: sprintId, status: { $in: ['Scheduled', 'Ready'] } },
        { $addToSet: { expectedAttendees: { $each: memberIds } } }
      )
    }
  }
}
