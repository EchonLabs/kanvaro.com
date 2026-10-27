/**
 * Assigning sprint work during planning (PC-8).
 *
 * Kanvaro used to ask for an owner at task creation — before the work had been
 * scoped or sized — and then ask again on the day-one stand-up board. This is
 * the single place ownership is now decided: once, during planning, with the
 * sprint's capacity in view, and early enough that planning poker can show the
 * round who the estimate is actually for.
 *
 * Split the same way as the rest of the module: `assertAssignableRoster` and
 * `diffAssignees` are pure and exhaustively testable, and everything that
 * touches the database lives in `applyPlanningAssignments`.
 */
import mongoose from 'mongoose'

import { Project } from '@/models/Project'
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'

import { StandupError } from './errors'

/** One task, one owner. `null` clears the assignment. */
export interface PlanningAssignment {
  taskId: string
  assigneeId: string | null
}

export interface PlanningAssignmentInput {
  sprintId: string
  userId: string
  organizationId: string
  assignments: PlanningAssignment[]
  /**
   * Admit a project QA who is not yet on the sprint team, adding them to
   * `Sprint.teamMembers` as part of the same request.
   */
  addToSprintTeam?: boolean
}

export interface PlanningAssignmentResult {
  updated: number
  tasks: Array<{ id: string; key?: string; title: string; assigneeId: string | null }>
  addedToSprintTeam: string[]
  /** Only genuinely new assignments — what notifications and activity fire for. */
  newlyAssigned: Array<{ taskId: string; taskTitle: string; assigneeId: string }>
}

/** Project roles that may be pulled onto a sprint team to take sprint work. */
const ADMISSIBLE_PROJECT_ROLES = ['project_qa_lead', 'project_tester']

/**
 * Refuses an assignee who is not on the sprint team.
 *
 * Capacity, the workload board and PA-5/PA-6 are all built from
 * `Sprint.teamMembers`. Work parked on somebody outside that roster does not
 * merely look untidy — its minutes disappear from every capacity number on the
 * planning screen, so the PM balances scope against a total that is wrong.
 *
 * Returns the ids that must be added to the roster for the assignment to be
 * legal, which is empty unless `addToSprintTeam` was asked for.
 */
export function assertAssignableRoster(
  sprintTeamIds: string[],
  assigneeIds: string[],
  options: { addToSprintTeam?: boolean; admissibleIds?: string[] } = {}
): string[] {
  const onTeam = new Set(sprintTeamIds)
  const outsiders = Array.from(new Set(assigneeIds.filter((id) => !onTeam.has(id))))
  if (outsiders.length === 0) return []

  if (!options.addToSprintTeam) {
    throw new StandupError(
      'VALIDATION_FAILED',
      `${outsiders.length === 1 ? 'That person is' : 'Those people are'} not on this sprint's team. Add them to the sprint, or assign the work to somebody who is.`,
      { outsiders }
    )
  }

  const admissible = new Set(options.admissibleIds ?? [])
  const refused = outsiders.filter((id) => !admissible.has(id))
  if (refused.length > 0) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'Only project members can be added to a sprint team this way.',
      { refused }
    )
  }

  return outsiders
}

/** Which assignees are new, so an idempotent re-assign notifies nobody. */
export function diffAssignees(
  before: string[],
  after: string[]
): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before)
  const afterSet = new Set(after)
  return {
    added: after.filter((id) => !beforeSet.has(id)),
    removed: before.filter((id) => !afterSet.has(id))
  }
}

const idOf = (value: any): string | undefined => {
  if (!value) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value._id) return value._id.toString()
  return value.toString()
}

/** The assignee ids currently on a task, in whichever shape it was stored. */
export function assigneeIdsOf(task: any): string[] {
  return (task?.assignedTo ?? [])
    .map((entry: any) => idOf(entry?.user ?? entry))
    .filter(Boolean) as string[]
}

export async function applyPlanningAssignments(
  input: PlanningAssignmentInput
): Promise<PlanningAssignmentResult> {
  const { sprintId, userId, assignments } = input

  if (!assignments.length) {
    throw new StandupError('VALIDATION_FAILED', 'No assignments were sent.')
  }

  const sprint = await Sprint.findById(sprintId)
  if (!sprint) {
    throw new StandupError('NOT_FOUND', 'That sprint no longer exists.', { sprintId })
  }

  // Assignment belongs to the planning step. Allowing it on an Active sprint
  // would put ownership back in the stand-up, which is the duplication this
  // whole change exists to remove; a running sprint reassigns through the
  // allocation board instead.
  if (sprint.status !== 'planning') {
    throw new StandupError(
      'VALIDATION_FAILED',
      'Tasks are assigned while the sprint is being planned. Open a planning session first.',
      { status: sprint.status }
    )
  }

  const taskIds = assignments.map((entry) => entry.taskId)
  const tasks = await Task.find({
    _id: { $in: taskIds },
    sprint: sprintId,
    archived: { $ne: true }
  })
    .select('displayId title assignedTo')
    .lean()

  const tasksById = new Map((tasks as any[]).map((task) => [task._id.toString(), task]))
  const missing = taskIds.filter((id) => !tasksById.has(id))
  if (missing.length > 0) {
    throw new StandupError(
      'NOT_FOUND',
      `${missing.length === 1 ? 'A task is' : `${missing.length} tasks are`} no longer in this sprint.`,
      { missing }
    )
  }

  const assigneeIds = Array.from(
    new Set(assignments.map((entry) => entry.assigneeId).filter(Boolean) as string[])
  )

  const sprintTeamIds = (sprint.teamMembers ?? []).map((id: any) => id.toString())

  let admissibleIds: string[] = []
  if (input.addToSprintTeam && assigneeIds.some((id) => !sprintTeamIds.includes(id))) {
    const project = await Project.findById(sprint.project).select('teamMembers projectRoles').lean()
    const projectTeamIds = new Set(
      ((project as any)?.teamMembers ?? []).map((entry: any) => idOf(entry?.memberId)).filter(Boolean)
    )
    const qaIds = new Set(
      ((project as any)?.projectRoles ?? [])
        .filter((entry: any) => ADMISSIBLE_PROJECT_ROLES.includes(entry?.role))
        .map((entry: any) => idOf(entry?.user))
        .filter(Boolean)
    )
    // Either on the project team or holding a QA role on it — both are people
    // the project already trusts with its work.
    admissibleIds = assigneeIds.filter((id) => projectTeamIds.has(id) || qaIds.has(id))
  }

  const toAddToTeam = assertAssignableRoster(sprintTeamIds, assigneeIds, {
    addToSprintTeam: input.addToSprintTeam,
    admissibleIds
  })

  // Before the tasks, not after: the checklist's member roster and every
  // capacity number are read from `teamMembers`, so a newly admitted QA must
  // already be on it by the time the assignment lands.
  if (toAddToTeam.length > 0) {
    await Sprint.updateOne(
      { _id: sprintId },
      { $addToSet: { teamMembers: { $each: toAddToTeam.map((id) => new mongoose.Types.ObjectId(id)) } } }
    )
  }

  const rates = await resolveHourlyRates(sprint.project, assigneeIds)

  const newlyAssigned: PlanningAssignmentResult['newlyAssigned'] = []
  const operations: any[] = []
  const resultTasks: PlanningAssignmentResult['tasks'] = []

  for (const entry of assignments) {
    const task = tasksById.get(entry.taskId)
    const before = assigneeIdsOf(task)
    const after = entry.assigneeId ? [entry.assigneeId] : []

    for (const added of diffAssignees(before, after).added) {
      newlyAssigned.push({ taskId: entry.taskId, taskTitle: task.title, assigneeId: added })
    }

    operations.push({
      updateOne: {
        // Per-task payloads differ, so `bulkWrite` rather than `updateMany`.
        // Safe against the model's estimate guard, which only refuses writes
        // that touch estimate fields on a locked task.
        filter: { _id: new mongoose.Types.ObjectId(entry.taskId), sprint: sprint._id },
        update: {
          $set: {
            assignedTo: after.map((id) => ({
              user: new mongoose.Types.ObjectId(id),
              ...(rates.has(id) ? { hourlyRate: rates.get(id) } : {})
            }))
          }
        }
      }
    })

    resultTasks.push({
      id: entry.taskId,
      key: task.displayId,
      title: task.title,
      assigneeId: entry.assigneeId
    })
  }

  const written = await Task.bulkWrite(operations)

  return {
    updated: written.modifiedCount ?? operations.length,
    tasks: resultTasks,
    addedToSprintTeam: toAddToTeam,
    newlyAssigned
  }
}

/**
 * Per-member hourly rates, mirroring what the task update route stamps.
 *
 * The rate is denormalised onto `assignedTo` so historical cost survives a
 * later change to the member's project rate.
 */
async function resolveHourlyRates(
  projectId: any,
  assigneeIds: string[]
): Promise<Map<string, number>> {
  const rates = new Map<string, number>()
  if (!assigneeIds.length) return rates

  const project = await Project.findById(projectId).select('teamMembers').lean()
  for (const entry of ((project as any)?.teamMembers ?? []) as any[]) {
    const memberId = idOf(entry?.memberId)
    if (memberId && typeof entry.hourlyRate === 'number' && entry.hourlyRate >= 0) {
      rates.set(memberId, entry.hourlyRate)
    }
  }
  return rates
}
