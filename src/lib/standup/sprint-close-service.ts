/**
 * The database side of CC-8 / CFW-9 (spec §15.8.11). Loads and writes what
 * `sprint-close.ts`'s pure evaluators need; owns no rules of its own.
 */
import { Task } from '@/models/Task'
import type { SprintCloseDispositionType } from '@/models/Task'
import { User } from '@/models/User'
import { loadCapacityContext } from './capacity-context'
import { loadCarryForwardPanel } from './carry-forward-service'
import { recordAudit, type AuditActor } from './audit'
import { resolveStandupOwner } from './task-ownership'
import {
  computeProjectedOutcome,
  evaluateFinalDayCarryForwardDisposition,
  evaluateTaskDispositions,
  type CarryForwardDispositionRow,
  type OpenTaskReadiness
} from './sprint-close'
import { minutes, ZERO_MINUTES } from './minutes'
import { StandupError } from './errors'

const DONE_STATUSES = new Set(['done', 'cancelled'])

export interface SprintCloseReadinessView {
  standupId: string
  shape: string
  openTasks: OpenTaskReadiness[]
  carryForwardItems: CarryForwardDispositionRow[]
  taskFailures: number
  carryForwardFailures: number
}

export async function loadSprintCloseReadiness(
  standupId: string
): Promise<SprintCloseReadinessView> {
  const context = await loadCapacityContext(standupId)

  const tasks = (await Task.find({
    sprint: context.sprintId,
    archived: { $ne: true },
    status: { $nin: Array.from(DONE_STATUSES) }
  })
    .select('displayId remainingEstimateMinutes assignedTo standupOwner sprintCloseDisposition')
    .lean()) as any[]

  // The board's own per-member gap, summed, is "hours available today" for
  // whoever the task's assignees are — cheap and already computed for the
  // capacity board this same page renders.
  const totalGapMinutes = context.memberIds.reduce((sum, memberId) => {
    const gap = context.computeFor(memberId, { allocatedMinutes: ZERO_MINUTES }).gapMinutes
    return sum + Math.max(0, gap)
  }, 0)

  const ownerIds = tasks
    .map((task) =>
      resolveStandupOwner({
        standupOwner: task.standupOwner ? String(task.standupOwner) : undefined,
        assignedTo: (task.assignedTo ?? []).map((entry: any) => String(entry.user))
      })
    )
    .filter((id): id is string => id !== undefined)
  const owners = (await User.find({ _id: { $in: Array.from(new Set(ownerIds)) } })
    .select('firstName lastName email')
    .lean()) as any[]
  const ownerNameById = new Map(
    owners.map((person) => [
      String(person._id),
      [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || person.email || String(person._id)
    ])
  )

  const openTasks: OpenTaskReadiness[] = tasks.map((task) => {
    const remaining = minutes(task.remainingEstimateMinutes ?? 0)
    const hoursAvailableTodayMinutes = minutes(totalGapMinutes)
    const ownerId = resolveStandupOwner({
      standupOwner: task.standupOwner ? String(task.standupOwner) : undefined,
      assignedTo: (task.assignedTo ?? []).map((entry: any) => String(entry.user))
    })
    return {
      taskId: String(task._id),
      taskKey: task.displayId,
      ownerName: ownerId ? ownerNameById.get(ownerId) : undefined,
      remainingEstimateMinutes: remaining,
      hoursAvailableTodayMinutes,
      projectedOutcome: computeProjectedOutcome({
        remainingEstimateMinutes: remaining,
        hoursAvailableTodayMinutes
      }),
      disposition: task.sprintCloseDisposition?.type
    }
  })

  const carryForwardPanel = await loadCarryForwardPanel(standupId)
  const carryForwardItems: CarryForwardDispositionRow[] = carryForwardPanel.items.map((item) => ({
    itemId: item.itemId,
    taskKey: item.taskKey,
    status: item.status,
    hasResolution: item.resolution !== undefined
  }))

  return {
    standupId,
    shape: context.standup.shape,
    openTasks,
    carryForwardItems,
    // Counted by the same two pure evaluators the run screen and the
    // completion saga use, rather than by a third inline copy of CC-8's and
    // CFW-9's rules — a copy that could (and did) drift from the open-status
    // set they actually test against.
    taskFailures: evaluateTaskDispositions(openTasks).offenders.length,
    carryForwardFailures: evaluateFinalDayCarryForwardDisposition(carryForwardItems).offenders
      .length
  }
}

export interface SetTaskDispositionInput {
  standupId: string
  taskId: string
  type: SprintCloseDispositionType
  note?: string
  actor: { userId: string }
}

export async function setTaskDisposition(input: SetTaskDispositionInput): Promise<void> {
  const context = await loadCapacityContext(input.standupId)

  const task = await Task.findOne({ _id: input.taskId, sprint: context.sprintId })
  if (!task) {
    throw new StandupError('NOT_FOUND', 'That task is not in this sprint.', {
      taskId: input.taskId
    })
  }

  const before = task.sprintCloseDisposition
    ? { ...(task.sprintCloseDisposition.toObject?.() ?? task.sprintCloseDisposition) }
    : null

  task.sprintCloseDisposition = {
    type: input.type,
    setAt: new Date(),
    setBy: input.actor.userId as any,
    note: input.note
  }
  await task.save()

  await recordAudit({
    actor: { type: 'user', userId: input.actor.userId } as AuditActor,
    organizationId: context.organizationId,
    projectId: context.projectId,
    action: 'sprint_close_disposition_set',
    entityType: 'task',
    entityId: String(task._id),
    entityName: task.displayId,
    before,
    after: task.sprintCloseDisposition,
    context: { standupId: context.standupId, date: context.date }
  })
}
