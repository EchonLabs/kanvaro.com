/**
 * Database-backed planning operations (spec §8, §17.4).
 *
 * The loader half of the split the module uses throughout: `planning-checklist`
 * owns the rules, this owns the queries that feed them. Keeping them apart is
 * what let the twelve checks be tested exhaustively without a database.
 */
import mongoose from 'mongoose'

import { MemberCapacity } from '@/models/MemberCapacity'
import { Sprint } from '@/models/Sprint'
import { SprintPlanningSession } from '@/models/SprintPlanningSession'
import { Task } from '@/models/Task'

import { resolveWorkingDays } from './calendar-service'
import { StandupError } from './errors'
import { generateStandupsForSprint, type GenerateResult } from './generation'
import {
  evaluatePlanningChecklist,
  type ChecklistInput,
  type ChecklistMemberInput,
  type ChecklistResult,
  type ChecklistTaskInput
} from './planning-checklist'
import { type PlanningWaiver } from './planning-gate'
import { assertTransition, type SprintState } from './sprint-states'

const isoOf = (date: Date) => new Date(date).toISOString().slice(0, 10)

/**
 * Loads everything the checklist needs and runs it.
 *
 * Working days come from the Phase 1 calendar engine rather than a weekday
 * count, so PC-7 and the capacity figures respect holidays and project
 * overrides — a sprint spanning Poya week genuinely has fewer days.
 */
export async function evaluateSprintChecklist(
  sprintId: string,
  options: { locale?: string } = {}
): Promise<{ checklist: ChecklistResult; sprint: any }> {
  const sprint = await Sprint.findById(sprintId).lean()
  if (!sprint) {
    throw new StandupError('NOT_FOUND', 'That sprint no longer exists.', { sprintId })
  }

  const projectId = (sprint as any).project.toString()
  const startDate = isoOf((sprint as any).startDate)
  const endDate = isoOf((sprint as any).endDate)

  const [tasks, resolutions, capacities] = await Promise.all([
    Task.find({ sprint: sprintId, archived: { $ne: true } })
      .select(
        'displayId title type priority description originalEstimateMinutes estimateMethod assignedTo'
      )
      .lean(),
    startDate <= endDate
      ? resolveWorkingDays(projectId, startDate as any, endDate as any)
      : Promise.resolve([]),
    MemberCapacity.find({ project: projectId, isActive: true }).lean()
  ])

  const workingDayCount = resolutions.filter((day) => day.isWorkingDay).length

  const capacityByMember = new Map<string, number>()
  for (const record of capacities as any[]) {
    capacityByMember.set(record.member.toString(), record.dailyCapacityMinutes)
  }

  const members: ChecklistMemberInput[] = ((sprint as any).teamMembers ?? []).map(
    (memberId: mongoose.Types.ObjectId) => ({
      memberId: memberId.toString(),
      // Names are resolved by the route, which already populates users for the
      // response. A raw id here would appear verbatim in a PA-5 warning.
      name: memberId.toString(),
      dailyCapacityMinutes: capacityByMember.get(memberId.toString()) ?? 480
    })
  )

  const checklistTasks: ChecklistTaskInput[] = (tasks as any[]).map((task) => ({
    id: task._id.toString(),
    key: task.displayId,
    title: task.title,
    type: task.type,
    priority: task.priority,
    description: task.description,
    originalEstimateMinutes: task.originalEstimateMinutes,
    estimateMethod: task.estimateMethod,
    assigneeIds: (task.assignedTo ?? [])
      .map((entry: any) => entry?.user?.toString())
      .filter(Boolean)
  }))

  const input: ChecklistInput = {
    sprintGoal: (sprint as any).goal,
    tasks: checklistTasks,
    members,
    workingDayCount,
    startDate,
    endDate,
    locale: options.locale
  }

  return { checklist: evaluatePlanningChecklist(input), sprint }
}

/**
 * Attaches display names to a checklist result.
 *
 * PA-5 and PA-6 name a person, and an ObjectId in that sentence is worse than
 * no sentence. Done as a second pass so the evaluator stays pure.
 */
export function withMemberNames(
  checklist: ChecklistResult,
  names: Map<string, string>
): ChecklistResult {
  const rename = (item: (typeof checklist.items)[number]) => {
    if (!item.message || !item.offendingIds?.length) return item
    let message = item.message
    names.forEach((name, id) => {
      message = message.split(id).join(name)
    })
    return { ...item, message }
  }

  const items = checklist.items.map(rename)
  return {
    ...checklist,
    items,
    mandatory: items.filter((item) => item.kind === 'mandatory'),
    advisory: items.filter((item) => item.kind === 'advisory'),
    blockers: items.filter((item) => item.kind === 'mandatory' && !item.passed)
  }
}

export interface CompletePlanningInput {
  sprintId: string
  sessionId: string
  userId: string
  acknowledgedCheckIds?: string[]
  locale?: string
}

export interface CompletePlanningResult {
  checklist: ChecklistResult
  sprint: any
  session: any
  /** UI-7 shows the generated schedule on the confirmation screen. */
  generatedStandups: GenerateResult
}

/**
 * Completes a planning session and takes the sprint to `planned` (PLN-1, PLN-8,
 * SCH-1, SCH-5).
 *
 * Four things happen and the order matters:
 *   1. The checklist is re-evaluated **server side**. A client that saw green
 *      thirty seconds ago is not evidence.
 *   2. The schedule is generated. This is deliberately *before* anything is
 *      frozen or moved: SCH-5 makes a sprint with no working days a refusal,
 *      and a refusal has to leave the sprint exactly as it was. A Planned
 *      sprint with no stand-ups would never remind anyone of anything.
 *   3. Estimates are frozen (DAT-6) by stamping `estimateLockedAt`.
 *   4. The sprint moves to `planned`.
 *
 * Generation is idempotent (SCH-2), so the only cost of doing it first is that
 * a failure in step 3 or 4 leaves a schedule the next completion reuses.
 */
export async function completePlanning(
  input: CompletePlanningInput
): Promise<CompletePlanningResult> {
  const { sprintId, sessionId, userId } = input

  const session = await SprintPlanningSession.findById(sessionId)
  if (!session || session.sprint.toString() !== sprintId) {
    throw new StandupError('NOT_FOUND', 'That planning session no longer exists.', { sessionId })
  }
  if (session.status !== 'open') {
    throw new StandupError(
      'VALIDATION_FAILED',
      'This planning session has already been closed.',
      { status: session.status }
    )
  }

  const { checklist, sprint } = await evaluateSprintChecklist(sprintId, { locale: input.locale })

  if (!checklist.canComplete) {
    throw new StandupError('COMPLETION_CHECKS_FAILED', `${checklist.blockers.length} checks failed`, {
      failures: checklist.blockers.map((item) => ({
        checkId: item.checkId,
        overridable: false,
        message: item.message,
        entities: (item.offendingIds ?? []).map((id) => ({ id }))
      }))
    })
  }

  assertTransition((sprint as any).status as SprintState, 'planned')

  const acknowledged = new Set(input.acknowledgedCheckIds ?? [])
  const now = new Date()

  session.status = 'completed'
  session.completedAt = now
  session.completedBy = new mongoose.Types.ObjectId(userId)
  session.checklistResults = checklist.items.map((item) => ({
    checkId: item.checkId,
    kind: item.kind,
    passed: item.passed,
    message: item.message,
    offendingIds: (item.offendingIds ?? [])
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id)),
    ...(item.kind === 'advisory' && !item.passed && acknowledged.has(item.checkId)
      ? { acknowledgedBy: new mongoose.Types.ObjectId(userId), acknowledgedAt: now }
      : {})
  })) as any

  session.scopeSnapshot = {
    taskCount: checklist.totals.taskCount,
    estimatedTaskCount: checklist.totals.estimatedTaskCount,
    totalEstimatedMinutes: checklist.totals.totalEstimatedMinutes,
    countByType: {}
  } as any

  // SCH-1/SCH-5. Throws before anything is written when the sprint contains no
  // working days, which leaves the session open and the sprint in Planning.
  const generatedStandups = await generateStandupsForSprint(sprintId, { actorId: userId })

  await session.save()

  // DAT-6 — freeze every estimate in the sprint. This single write is what
  // makes the model-layer guard start refusing edits.
  await Task.updateMany(
    { sprint: sprintId, estimateLockedAt: { $exists: false } },
    { $set: { estimateLockedAt: now } }
  )

  const updatedSprint = await Sprint.findByIdAndUpdate(
    sprintId,
    {
      $set: {
        status: 'planned',
        plannedAt: now,
        activePlanningSession: session._id
      }
    },
    { new: true }
  ).lean()

  return { checklist, sprint: updatedSprint, session, generatedStandups }
}

/** Reads the sprint's waiver in the shape the gate expects. */
export function waiverFromSprint(sprint: any): PlanningWaiver | null {
  const waiver = sprint?.planningWaiver
  if (!waiver) return null

  return {
    waivedCheckIds: waiver.waivedCheckIds ?? [],
    justification: waiver.justification,
    issuedBy: waiver.issuedBy?.toString(),
    issuedAt: new Date(waiver.issuedAt),
    expiresAt: new Date(waiver.expiresAt),
    revokedAt: waiver.revokedAt ? new Date(waiver.revokedAt) : null
  }
}
