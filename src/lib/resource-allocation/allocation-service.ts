/**
 * Writes and per-member reads for the resource allocation sheet.
 *
 * This is the only writer of `ResourceAllocation` and `AllocationHistory`.
 * Admin/HR edits come in through {@link directChange}; approved PM requests
 * reuse {@link applyChange} from the request service, so both paths validate,
 * diff, write history and sync project teams identically.
 *
 * Kanvaro deployments do not guarantee transactions, so writes are per-row
 * upserts keyed by organisation × member × project: re-running an apply after
 * a partial failure converges on the same state instead of duplicating rows.
 */
import mongoose from 'mongoose'

import { logActivity } from '@/lib/activity-logger'
import { notificationService } from '@/lib/notification-service'
import { isProjectTeamMember } from '@/lib/permissions/project-team-membership'
import { AllocationHistory } from '@/models/AllocationHistory'
import { Organization } from '@/models/Organization'
import { Project } from '@/models/Project'
import { ResourceAllocation } from '@/models/ResourceAllocation'
import { User } from '@/models/User'

import { ResourceAllocationError } from './errors'
import { notifyAllocationChanged } from './notifications'
import {
  ACTIVE_PROJECT_STATUSES,
  DEFAULT_THRESHOLD,
  RESOURCE_ROLES,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  type ChangeLine,
  type WorkloadStatus,
  classify,
  computeRemaining,
  computeTotal,
  exceedsThreshold,
  parseChangeLines,
  parseReason,
  roleLabel
} from './workload'

export interface Actor {
  userId: string
  organizationId: string
}

export interface ActiveProject {
  _id: string
  name: string
  billable: boolean
  managers: { _id: string; name: string }[]
}

export interface ResourceUser {
  _id: mongoose.Types.ObjectId
  firstName: string
  lastName: string
  email: string
  role: string
  customRole?: { name?: string } | null
  hourlyRate?: number
  avatar?: string
}

export interface MemberAllocations {
  member: { _id: string; name: string; email: string; roleLabel: string; avatar?: string }
  /** `managerIds` lets an editor apply the rule that a PM may only increase projects they manage. */
  lines: { projectId: string; projectName: string; percent: number; onTeam: boolean; managerIds: string[] }[]
  total: number
  remaining: number
  status: WorkloadStatus
  threshold: number
}

export interface ChangedLine {
  projectId: string
  previousPercent: number
  newPercent: number
}

export interface PreparedChange {
  member: ResourceUser
  currentByProject: Map<string, number>
  lines: ChangeLine[]
  changed: ChangedLine[]
  totalBefore: number
  totalAfter: number
  threshold: number
  exceedsThreshold: boolean
}

const OBJECT_ID = /^[0-9a-f]{24}$/i

const fullName = (user: { firstName?: string; lastName?: string }) =>
  `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()

export function activeProjectFilter(organizationId: string) {
  return {
    organization: organizationId,
    status: { $in: [...ACTIVE_PROJECT_STATUSES] },
    archived: { $ne: true },
    isDraft: { $ne: true }
  }
}

export async function getThreshold(organizationId: string): Promise<number> {
  const org: any = await Organization.findById(organizationId)
    .select('settings.resourceAllocation')
    .lean()
  const value = org?.settings?.resourceAllocation?.overAllocationThresholdPercent
  return typeof value === 'number' ? value : DEFAULT_THRESHOLD
}

export async function setThreshold(organizationId: string, percent: number): Promise<number> {
  if (typeof percent !== 'number' || !Number.isInteger(percent) || percent < THRESHOLD_MIN || percent > THRESHOLD_MAX) {
    throw new ResourceAllocationError(
      'VALIDATION_FAILED',
      `The threshold must be a whole number between ${THRESHOLD_MIN} and ${THRESHOLD_MAX}.`
    )
  }
  await Organization.updateOne(
    { _id: organizationId },
    { $set: { 'settings.resourceAllocation.overAllocationThresholdPercent': percent } },
    { runValidators: true }
  )
  return percent
}

/**
 * Who manages each project: explicit `project_manager` project roles, plus the
 * creator when they hold no explicit project role — the same precedence as
 * `PermissionService.getUserProjectRole`.
 */
function managerIdsOf(project: any): string[] {
  const roles: any[] = project.projectRoles ?? []
  const ids = roles.filter((entry) => entry.role === 'project_manager').map((entry) => String(entry.user))
  const creator = project.createdBy ? String(project.createdBy) : undefined
  if (creator && !roles.some((entry) => String(entry.user) === creator)) ids.push(creator)
  return Array.from(new Set(ids))
}

export async function getActiveProjects(organizationId: string): Promise<ActiveProject[]> {
  const projects: any[] = await Project.find(activeProjectFilter(organizationId))
    .select('name isBillableByDefault projectRoles createdBy')
    .sort({ name: 1 })
    .lean()

  const managerIds = Array.from(new Set(projects.flatMap(managerIdsOf)))
  const managers: any[] = managerIds.length
    ? await User.find({ _id: { $in: managerIds } }).select('firstName lastName').lean()
    : []
  const nameById = new Map(managers.map((user) => [String(user._id), fullName(user)]))

  return projects.map((project) => ({
    _id: String(project._id),
    name: project.name,
    billable: project.isBillableByDefault !== false,
    managers: managerIdsOf(project)
      .filter((id) => nameById.has(id))
      .map((id) => ({ _id: id, name: nameById.get(id) as string }))
  }))
}

/** Loads a member and checks they are an active resource of this organisation. */
export async function loadResource(organizationId: string, memberId: unknown): Promise<ResourceUser> {
  if (memberId === undefined || memberId === null || memberId === '') {
    throw new ResourceAllocationError('VALIDATION_FAILED', 'Choose a team member.')
  }
  if (typeof memberId !== 'string' || !OBJECT_ID.test(memberId)) {
    throw new ResourceAllocationError('NOT_FOUND', 'That team member does not exist.')
  }
  const user: any = await User.findOne({ _id: memberId, organization: organizationId })
    .select('firstName lastName email role customRole hourlyRate isActive avatar')
    .populate('customRole', 'name')
    .lean()
  if (!user) throw new ResourceAllocationError('NOT_FOUND', 'That team member does not exist.')
  if (!user.isActive || !(RESOURCE_ROLES as readonly string[]).includes(user.role)) {
    throw new ResourceAllocationError(
      'VALIDATION_FAILED',
      `${fullName(user)} is no longer an active resource and cannot be allocated.`
    )
  }
  return user as ResourceUser
}

async function currentAllocations(
  organizationId: string,
  memberId: string,
  activeIds: string[]
): Promise<Map<string, number>> {
  const rows: any[] = await ResourceAllocation.find({
    organization: organizationId,
    member: memberId,
    project: { $in: activeIds }
  })
    .select('project percent')
    .lean()
  return new Map(rows.map((row) => [String(row.project), row.percent]))
}

export async function getMemberAllocations(organizationId: string, memberId: string): Promise<MemberAllocations> {
  const member = await loadResource(organizationId, memberId)
  const projects: any[] = await Project.find(activeProjectFilter(organizationId))
    .select('name teamMembers projectRoles createdBy')
    .sort({ name: 1 })
    .lean()
  const current = await currentAllocations(
    organizationId,
    memberId,
    projects.map((project) => String(project._id))
  )
  const threshold = await getThreshold(organizationId)
  const total = computeTotal(Array.from(current.values()))

  return {
    member: {
      _id: String(member._id),
      name: fullName(member),
      email: member.email,
      roleLabel: roleLabel(member),
      ...(member.avatar ? { avatar: member.avatar } : {})
    },
    lines: projects.map((project) => ({
      projectId: String(project._id),
      projectName: project.name,
      percent: current.get(String(project._id)) ?? 0,
      onTeam: isProjectTeamMember(project, memberId),
      managerIds: managerIdsOf(project)
    })),
    total,
    remaining: computeRemaining(total),
    status: classify(total, threshold),
    threshold
  }
}

/** Diffs requested lines against the member's live allocations. Pure apart from its inputs. */
export function buildPrepared(
  member: ResourceUser,
  currentByProject: Map<string, number>,
  lines: ChangeLine[],
  threshold: number
): PreparedChange {
  const changed: ChangedLine[] = lines
    .map((line) => ({
      projectId: line.projectId,
      previousPercent: currentByProject.get(line.projectId) ?? 0,
      newPercent: line.newPercent
    }))
    .filter((line) => line.previousPercent !== line.newPercent)

  const after = new Map(currentByProject)
  for (const line of changed) after.set(line.projectId, line.newPercent)

  const totalBefore = computeTotal(Array.from(currentByProject.values()))
  const totalAfter = computeTotal(Array.from(after.values()))

  return {
    member,
    currentByProject,
    lines,
    changed,
    totalBefore,
    totalAfter,
    threshold,
    exceedsThreshold: exceedsThreshold(totalBefore, totalAfter, threshold)
  }
}

/** Refuses a change that raises the member above the organisation threshold. */
export function assertWithinThreshold(prepared: PreparedChange): void {
  if (prepared.exceedsThreshold) {
    const exceedsBy = prepared.totalAfter - prepared.threshold
    throw new ResourceAllocationError(
      'OVER_THRESHOLD',
      `Allocation exceeds available capacity by ${exceedsBy}%.`,
      { totalAfter: prepared.totalAfter, threshold: prepared.threshold, exceedsBy }
    )
  }
}

/** Ids of the given projects that are active in this org; NOT_FOUND for any outside the org. */
export async function partitionProjects(
  organizationId: string,
  projectIds: string[]
): Promise<{ active: Set<string>; inactive: string[] }> {
  const found: any[] = await Project.find({ _id: { $in: projectIds }, organization: organizationId })
    .select('_id')
    .lean()
  if (found.length !== projectIds.length) {
    throw new ResourceAllocationError('NOT_FOUND', 'One or more projects do not exist.')
  }
  const active: any[] = await Project.find({ _id: { $in: projectIds }, ...activeProjectFilter(organizationId) })
    .select('_id')
    .lean()
  const activeIds = new Set(active.map((project) => String(project._id)))
  return { active: activeIds, inactive: projectIds.filter((id) => !activeIds.has(id)) }
}

/**
 * Validates a change set and diffs it against live state. Throws when the
 * member or a project is out of bounds, or when nothing would change.
 */
export async function prepareChange(
  organizationId: string,
  input: { memberId: unknown; lines: unknown; reason: unknown }
): Promise<PreparedChange & { reason: string }> {
  const member = await loadResource(organizationId, input.memberId)
  const lines = parseChangeLines(input.lines)
  const reason = parseReason(input.reason)

  const { inactive } = await partitionProjects(organizationId, lines.map((line) => line.projectId))
  if (inactive.length > 0) {
    throw new ResourceAllocationError(
      'VALIDATION_FAILED',
      'Only active projects can be allocated.',
      { projectIds: inactive }
    )
  }

  const activeIds = (await Project.find(activeProjectFilter(organizationId)).select('_id').lean()).map(
    (project: any) => String(project._id)
  )
  const current = await currentAllocations(organizationId, String(member._id), activeIds)
  const prepared = buildPrepared(member, current, lines, await getThreshold(organizationId))

  if (prepared.changed.length === 0) {
    throw new ResourceAllocationError('VALIDATION_FAILED', 'No changes to apply.')
  }
  return { ...prepared, reason }
}

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
}

/**
 * Adds the member to a project's team if they are not on it. The `$ne` guard
 * makes this atomic: two concurrent applies cannot add the same member twice.
 */
export async function ensureTeamMember(
  organizationId: string,
  projectId: string,
  projectName: string,
  memberId: string,
  hourlyRate?: number
): Promise<boolean> {
  const memberObjectId = new mongoose.Types.ObjectId(memberId)
  const result = await Project.updateOne(
    { _id: projectId, 'teamMembers.memberId': { $ne: memberObjectId } },
    { $push: { teamMembers: { memberId: memberObjectId, ...(hourlyRate !== undefined ? { hourlyRate } : {}) } } }
  )
  const added = result.modifiedCount === 1
  if (added) {
    notificationService
      .notifyProjectTeamMemberAdded(projectId, [memberId], organizationId, projectName, appBaseUrl())
      .catch((error) => console.error('Failed to notify team addition:', error))
  }
  return added
}

/** Writes the changed lines, their history, and team membership; then notifies. */
export async function applyChange(params: {
  organizationId: string
  actorId: string
  prepared: PreparedChange
  reason: string
  kind: 'direct' | 'approved'
  approvedBy?: string
  requestId?: string
}): Promise<{ totalAfter: number; addedToProjects: string[] }> {
  const { organizationId, actorId, prepared, reason, kind, approvedBy, requestId } = params
  const memberId = String(prepared.member._id)
  const projects: any[] = await Project.find({ _id: { $in: prepared.changed.map((line) => line.projectId) } })
    .select('name')
    .lean()
  const projectName = new Map(projects.map((project) => [String(project._id), project.name as string]))
  const addedToProjects: string[] = []

  for (const line of prepared.changed) {
    const key = { organization: organizationId, member: memberId, project: line.projectId }
    if (line.newPercent === 0) {
      await ResourceAllocation.deleteOne(key)
    } else {
      await ResourceAllocation.updateOne(
        key,
        { $set: { percent: line.newPercent, updatedBy: actorId } },
        { upsert: true, runValidators: true }
      )
    }

    await AllocationHistory.create({
      ...key,
      changedBy: actorId,
      ...(approvedBy ? { approvedBy } : {}),
      ...(requestId ? { request: requestId } : {}),
      previousPercent: line.previousPercent,
      newPercent: line.newPercent,
      reason,
      kind
    })

    if (line.newPercent > 0) {
      const added = await ensureTeamMember(
        organizationId,
        line.projectId,
        projectName.get(line.projectId) ?? 'a project',
        memberId,
        prepared.member.hourlyRate
      )
      if (added) addedToProjects.push(line.projectId)
    }
  }

  const named = prepared.changed.map((line) => ({
    projectName: projectName.get(line.projectId) ?? 'a project',
    previousPercent: line.previousPercent,
    newPercent: line.newPercent
  }))
  notifyAllocationChanged(organizationId, memberId, named).catch(() => undefined)
  logActivity({
    organizationId,
    userId: approvedBy ?? actorId,
    action: 'resource_allocation_changed',
    entityType: 'resource_allocation',
    entityId: memberId,
    entityName: fullName(prepared.member),
    details: { kind, requestId, changes: named, totalAfter: prepared.totalAfter }
  }).catch(() => undefined)

  return { totalAfter: prepared.totalAfter, addedToProjects }
}

/** Admin/HR edit: validate, refuse if it breaches the threshold, then apply immediately. */
export async function directChange(
  actor: Actor,
  input: { memberId: unknown; lines: unknown; reason: unknown }
): Promise<{ mode: 'applied'; totalAfter: number; addedToProjects: string[] }> {
  const prepared = await prepareChange(actor.organizationId, input)
  assertWithinThreshold(prepared)
  const result = await applyChange({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    prepared,
    reason: prepared.reason,
    kind: 'direct'
  })
  return { mode: 'applied', ...result }
}
