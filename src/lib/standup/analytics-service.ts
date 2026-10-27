/**
 * Reads everything the Stand-up Analytics screen (§15.15) needs for one
 * sprint and hands it to `buildAnalyticsPayload`.
 *
 * Read-only: nothing here writes. Every query is scoped to the sprint and
 * `lean`, and they run in parallel — the screen is a report, so a few wide
 * reads beat the per-stand-up services the run screen uses.
 *
 * Member names are loaded whichever view is asked for; the payload builder
 * decides what leaves the server, so the split lives in exactly one place.
 */
import mongoose from 'mongoose'

import { Allocation } from '@/models/Allocation'
import { AllocationVariance } from '@/models/AllocationVariance'
import { CarryForwardItem, OPEN_CARRY_FORWARD_STATUSES } from '@/models/CarryForwardItem'
import { EstimateDebtLedger } from '@/models/EstimateDebtLedger'
import { Project } from '@/models/Project'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Standup } from '@/models/Standup'
import { StandupOverride } from '@/models/StandupOverride'
import { Task } from '@/models/Task'
import { User } from '@/models/User'

import {
  buildAnalyticsPayload,
  type AnalyticsInputs,
  type AnalyticsPayload,
  type AnalyticsView
} from './analytics-payload'
import { resolveStatusSets } from './debt-position'
import { resolveStandupOwner } from './task-ownership'

const id = (value: unknown): string => String(value)

const isoDate = (value: unknown): string | null =>
  value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().slice(0, 10) : null

/** The most recent variance row per key — `totalLoggedMinutesOnTask` is cumulative, so the latest wins. */
function latestBy<T extends { computedAt?: Date }>(rows: readonly T[], key: (row: T) => string): T[] {
  const latest = new Map<string, T>()
  for (const row of rows) {
    const current = latest.get(key(row))
    if (!current || (row.computedAt?.getTime() ?? 0) > (current.computedAt?.getTime() ?? 0)) {
      latest.set(key(row), row)
    }
  }
  return Array.from(latest.values())
}

export async function loadAnalyticsInputs(sprint: any): Promise<AnalyticsInputs> {
  const sprintObjectId = new mongoose.Types.ObjectId(id(sprint._id))
  const projectId = id(sprint.project)

  const [project, settings, standups, allocations, variances, ledger, overrides, carryForward] =
    await Promise.all([
      Project.findById(projectId).select('name').lean() as Promise<any>,
      ProjectStandupSettings.findOne({ project: projectId }).lean() as Promise<any>,
      Standup.find({ sprint: sprintObjectId })
        .select('standupDate sprintDayNumber status wasBackfilled actualDurationMinutes snapshot.members')
        .lean() as Promise<any[]>,
      Allocation.find({ sprint: sprintObjectId })
        .select('standup member task plannedMinutes carryChainRoot excludedFromCapacity addedAfterCompletion')
        .lean() as Promise<any[]>,
      AllocationVariance.find({ sprint: sprintObjectId })
        .select('task member originalEstimateMinutes totalLoggedMinutesOnTask taskStatusAtClose computedAt')
        .lean() as Promise<any[]>,
      EstimateDebtLedger.find({ sprint: sprintObjectId })
        .select('member entryType minutes sourceStandup')
        .lean() as Promise<any[]>,
      StandupOverride.find({ sprint: sprintObjectId })
        .select('standup type reasonCode justification affectedMemberIds issuedAt')
        .lean() as Promise<any[]>,
      CarryForwardItem.find({ sprint: sprintObjectId, status: { $in: OPEN_CARRY_FORWARD_STATUSES } })
        .select('task member ageInStandups status')
        .lean() as Promise<any[]>
    ])

  const dateByStandup = new Map(standups.map((standup) => [id(standup._id), String(standup.standupDate)]))
  const done = new Set(resolveStatusSets(settings).done.map((status) => status.toLowerCase()))

  const completed = latestBy(
    variances.filter((row) => done.has(String(row.taskStatusAtClose ?? '').toLowerCase())),
    (row) => `${id(row.task)}:${id(row.member)}`
  )
  const taskTotals = latestBy(variances, (row) => id(row.task))

  const taskIds = new Set<string>()
  for (const allocation of allocations) taskIds.add(id(allocation.task))
  for (const item of carryForward) if (item.task) taskIds.add(id(item.task))

  const tasks = (await Task.find({ _id: { $in: Array.from(taskIds) } })
    .select('displayId title standupOwner assignedTo.user')
    .lean()) as any[]

  const memberIds = new Set<string>()
  for (const allocation of allocations) memberIds.add(id(allocation.member))
  for (const row of variances) memberIds.add(id(row.member))
  for (const override of overrides) for (const memberId of override.affectedMemberIds ?? []) memberIds.add(id(memberId))
  for (const item of carryForward) if (item.member) memberIds.add(id(item.member))
  for (const standup of standups) for (const member of standup.snapshot?.members ?? []) memberIds.add(id(member.memberId))

  const taskRecords: AnalyticsInputs['tasks'] = {}
  for (const task of tasks) {
    const assigneeId = resolveStandupOwner({
      standupOwner: task.standupOwner ? id(task.standupOwner) : undefined,
      assignedTo: (task.assignedTo ?? []).map((entry: any) => id(entry.user))
    })
    if (assigneeId) memberIds.add(assigneeId)
    taskRecords[id(task._id)] = { key: task.displayId, title: task.title ?? '', assigneeId }
  }

  const users = (await User.find({ _id: { $in: Array.from(memberIds) } })
    .select('firstName lastName')
    .lean()) as any[]
  const memberNames: Record<string, string> = {}
  for (const user of users) {
    memberNames[id(user._id)] = [user.firstName, user.lastName].filter(Boolean).join(' ')
  }

  return {
    sprint: {
      id: id(sprint._id),
      name: sprint.name ?? '',
      projectId,
      projectName: project?.name ?? '',
      startDate: isoDate(sprint.startDate),
      endDate: isoDate(sprint.endDate)
    },
    standups: standups.map((standup) => ({
      standupId: id(standup._id),
      standupDate: String(standup.standupDate),
      dayNumber: standup.sprintDayNumber ?? 0,
      status: standup.status,
      wasBackfilled: Boolean(standup.wasBackfilled),
      actualDurationMinutes:
        typeof standup.actualDurationMinutes === 'number' ? standup.actualDurationMinutes : undefined,
      capacity: Array.isArray(standup.snapshot?.members)
        ? standup.snapshot.members.map((member: any) => ({
            memberId: id(member.memberId),
            effectiveMinutes: Number(member.effectiveMinutes) || 0
          }))
        : null
    })),
    allocations: allocations.map((allocation) => ({
      allocationId: id(allocation._id),
      standupId: id(allocation.standup),
      memberId: id(allocation.member),
      taskId: id(allocation.task),
      plannedMinutes: allocation.plannedMinutes ?? 0,
      carryChainRoot: allocation.carryChainRoot ? id(allocation.carryChainRoot) : undefined,
      countsTowardCapacity: !allocation.excludedFromCapacity && !allocation.addedAfterCompletion
    })),
    completedTasks: completed.map((row) => ({
      taskId: id(row.task),
      memberId: id(row.member),
      originalEstimateMinutes: row.originalEstimateMinutes ?? 0,
      totalLoggedMinutesOnTask: row.totalLoggedMinutesOnTask ?? 0
    })),
    taskTotals: taskTotals.map((row) => ({
      taskId: id(row.task),
      originalEstimateMinutes: row.originalEstimateMinutes ?? 0,
      totalLoggedMinutesOnTask: row.totalLoggedMinutesOnTask ?? 0
    })),
    // An entry whose stand-up is not in this sprint (a carry-in posted against
    // the previous sprint's stand-up) is dated by nothing on this axis, so it
    // counts from the sprint's first day.
    ledger: ledger.map((entry) => ({
      memberId: id(entry.member),
      entryType: entry.entryType,
      minutes: entry.minutes ?? 0,
      standupDate: dateByStandup.get(id(entry.sourceStandup)) ?? ''
    })),
    overrides: overrides.map((override) => ({
      overrideId: id(override._id),
      standupId: id(override.standup),
      standupDate: dateByStandup.get(id(override.standup)) ?? '',
      type: override.type,
      reasonCode: override.reasonCode ?? '',
      justification: override.justification ?? '',
      affectedMemberIds: (override.affectedMemberIds ?? []).map(id),
      issuedAt: override.issuedAt instanceof Date ? override.issuedAt.toISOString() : String(override.issuedAt ?? '')
    })),
    carryForward: carryForward.map((item) => ({
      itemId: id(item._id),
      taskId: item.task ? id(item.task) : undefined,
      memberId: item.member ? id(item.member) : undefined,
      ageInStandups: item.ageInStandups ?? 1,
      status: item.status
    })),
    tasks: taskRecords,
    memberNames
  }
}

export async function getSprintAnalytics(sprint: any, view: AnalyticsView): Promise<AnalyticsPayload> {
  return buildAnalyticsPayload(await loadAnalyticsInputs(sprint), view)
}
