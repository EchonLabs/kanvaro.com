/**
 * PM allocation requests and their Admin/HR decisions.
 *
 * A request is a frozen proposal: the lines it changes, with the value each
 * project had at submit time. Approval re-reads the live sheet, refuses if the
 * member or a project is no longer eligible, asks the approver to acknowledge
 * anything that moved since submit, and refuses if the live result would breach
 * the threshold. Only then does it *claim* the request — a conditional status
 * flip from `pending` — so two approvers clicking at once cannot both apply it.
 */
import mongoose from 'mongoose'

import { logActivity } from '@/lib/activity-logger'
import { PermissionService } from '@/lib/permissions/permission-service'
import { ProjectRole } from '@/lib/permissions/permission-definitions'
import { AllocationRequest, type AllocationRequestStatus } from '@/models/AllocationRequest'
import { Project } from '@/models/Project'
import { ResourceAllocation } from '@/models/ResourceAllocation'
import { User } from '@/models/User'

import {
  type Actor,
  activeProjectFilter,
  applyChange,
  assertWithinThreshold,
  buildPrepared,
  getThreshold,
  loadResource,
  partitionProjects,
  prepareChange
} from './allocation-service'
import { ResourceAllocationError } from './errors'
import { notifyApprovers, notifyRequestDecided } from './notifications'
import { REASON_MAX_LENGTH, roleLabel } from './workload'

const OBJECT_ID = /^[0-9a-f]{24}$/i

export interface RequestLineView {
  projectId: string
  projectName: string
  previousPercent: number
  newPercent: number
}

export interface RequestListItem {
  _id: string
  status: AllocationRequestStatus
  reason: string
  member: { _id: string; name: string }
  requestedBy: { _id: string; name: string; roleLabel: string }
  lines: RequestLineView[]
  totalBefore: number
  totalAfter: number
  createdAt: Date
  decidedAt?: Date
  decidedBy?: { _id: string; name: string }
  decisionNote?: string
}

export interface RequestDetail extends Omit<RequestListItem, 'lines'> {
  lines: (RequestLineView & { currentPercent: number })[]
  stale: boolean
  liveTotalBefore: number
  liveTotalAfter: number
  exceedsThresholdNow: boolean
  threshold: number
}

const fullName = (user: any) => (user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : 'Unknown')

function assertRequestId(requestId: unknown): asserts requestId is string {
  if (typeof requestId !== 'string' || !OBJECT_ID.test(requestId)) {
    throw new ResourceAllocationError('NOT_FOUND', 'That request does not exist.')
  }
}

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: unknown })?.code === 11000
}

/** Turns populated request documents into the shape the UI reads. */
async function toListItems(requests: any[]): Promise<RequestListItem[]> {
  const projectIds = Array.from(new Set(requests.flatMap((r) => r.lines.map((l: any) => String(l.project)))))
  const projects: any[] = projectIds.length
    ? await Project.find({ _id: { $in: projectIds } }).select('name').lean()
    : []
  const projectName = new Map(projects.map((p) => [String(p._id), p.name as string]))

  return requests.map((request) => ({
    _id: String(request._id),
    status: request.status,
    reason: request.reason,
    member: { _id: String(request.member?._id ?? request.member), name: fullName(request.member) },
    requestedBy: {
      _id: String(request.requestedBy?._id ?? request.requestedBy),
      name: fullName(request.requestedBy),
      roleLabel: request.requestedBy?.role ? roleLabel(request.requestedBy) : ''
    },
    lines: request.lines.map((line: any) => ({
      projectId: String(line.project),
      projectName: projectName.get(String(line.project)) ?? 'Deleted project',
      previousPercent: line.previousPercent,
      newPercent: line.newPercent
    })),
    totalBefore: request.totalBefore,
    totalAfter: request.totalAfter,
    createdAt: request.createdAt,
    ...(request.decidedAt ? { decidedAt: request.decidedAt } : {}),
    ...(request.decidedBy
      ? { decidedBy: { _id: String(request.decidedBy._id ?? request.decidedBy), name: fullName(request.decidedBy) } }
      : {}),
    ...(request.decisionNote ? { decisionNote: request.decisionNote } : {})
  }))
}

function populateRequest<T>(query: T): T {
  return (query as any)
    .populate('member', 'firstName lastName')
    .populate({ path: 'requestedBy', select: 'firstName lastName role customRole', populate: { path: 'customRole', select: 'name' } })
    .populate('decidedBy', 'firstName lastName')
}

export async function createRequest(
  actor: Actor,
  input: { memberId: unknown; lines: unknown; reason: unknown }
): Promise<any> {
  const prepared = await prepareChange(actor.organizationId, input)

  const { projectRoles } = await PermissionService.getUserPermissions(actor.userId)
  const notManaged = prepared.changed
    .filter((line) => line.newPercent > line.previousPercent)
    .filter((line) => projectRoles.get(line.projectId) !== ProjectRole.PROJECT_MANAGER)
    .map((line) => line.projectId)
  if (notManaged.length > 0) {
    throw new ResourceAllocationError(
      'FORBIDDEN',
      'You can only add allocation to projects you manage.',
      { projectIds: notManaged }
    )
  }

  assertWithinThreshold(prepared)

  let request: any
  try {
    request = await AllocationRequest.create({
      organization: actor.organizationId,
      member: prepared.member._id,
      requestedBy: actor.userId,
      reason: prepared.reason,
      status: 'pending',
      lines: prepared.changed.map((line) => ({
        project: line.projectId,
        previousPercent: line.previousPercent,
        newPercent: line.newPercent
      })),
      totalBefore: prepared.totalBefore,
      totalAfter: prepared.totalAfter
    })
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new ResourceAllocationError(
        'REQUEST_ALREADY_PENDING',
        'This team member already has a pending allocation request.'
      )
    }
    throw error
  }

  const requester: any = await User.findById(actor.userId).select('firstName lastName').lean()
  const memberName = `${prepared.member.firstName} ${prepared.member.lastName}`.trim()
  notifyApprovers(actor.organizationId, String(request._id), actor.userId, fullName(requester), memberName).catch(
    () => undefined
  )
  logActivity({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: 'resource_request_submitted',
    entityType: 'allocation_request',
    entityId: String(request._id),
    entityName: memberName,
    details: { totalBefore: prepared.totalBefore, totalAfter: prepared.totalAfter }
  }).catch(() => undefined)

  return request
}

async function loadRequest(organizationId: string, requestId: unknown): Promise<any> {
  assertRequestId(requestId)
  const request = await populateRequest(AllocationRequest.findOne({ _id: requestId, organization: organizationId })).lean()
  if (!request) throw new ResourceAllocationError('NOT_FOUND', 'That request does not exist.')
  return request
}

/** The request plus what the live sheet says now: current values, staleness, and the live result. */
export async function getRequestDetail(organizationId: string, requestId: string): Promise<RequestDetail> {
  const request = await loadRequest(organizationId, requestId)
  const [item] = await toListItems([request])

  const memberId = String(request.member?._id ?? request.member)
  const activeIds = (await Project.find(activeProjectFilter(organizationId)).select('_id').lean()).map((p: any) =>
    String(p._id)
  )
  const rows: any[] = await ResourceAllocation.find({
    organization: organizationId,
    member: memberId,
    project: { $in: activeIds }
  })
    .select('project percent')
    .lean()
  const current = new Map(rows.map((row) => [String(row.project), row.percent as number]))
  const threshold = await getThreshold(organizationId)

  const lines = item.lines.map((line) => ({ ...line, currentPercent: current.get(line.projectId) ?? 0 }))
  const live = buildPrepared(
    { _id: new mongoose.Types.ObjectId(memberId) } as any,
    current,
    lines.map((line) => ({ projectId: line.projectId, newPercent: line.newPercent })),
    threshold
  )

  return {
    ...item,
    lines,
    stale: lines.some((line) => line.currentPercent !== line.previousPercent),
    liveTotalBefore: live.totalBefore,
    liveTotalAfter: live.totalAfter,
    exceedsThresholdNow: live.exceedsThreshold,
    threshold
  }
}

/** Flips a pending request to a decision. Returns null when someone else got there first. */
async function claim(
  organizationId: string,
  requestId: string,
  update: Record<string, unknown>
): Promise<any | null> {
  return AllocationRequest.findOneAndUpdate(
    { _id: requestId, organization: organizationId, status: 'pending' },
    { $set: update },
    { new: true }
  ).lean()
}

const notPending = () => new ResourceAllocationError('REQUEST_NOT_PENDING', 'This request has already been decided.')

export async function approveRequest(
  actor: Actor,
  requestId: string,
  opts: { acknowledgeStale?: unknown }
): Promise<{ status: 'approved'; totalAfter: number }> {
  const detail = await getRequestDetail(actor.organizationId, requestId)
  if (detail.status !== 'pending') throw notPending()

  const member = await loadResource(actor.organizationId, detail.member._id)
  const { inactive } = await partitionProjects(
    actor.organizationId,
    detail.lines.map((line) => line.projectId)
  ).catch(() => ({ inactive: detail.lines.map((line) => line.projectId) }))
  if (inactive.length > 0) {
    throw new ResourceAllocationError(
      'VALIDATION_FAILED',
      'A project in this request is no longer active, so it cannot be approved. Reject it instead.',
      { projectIds: inactive }
    )
  }

  if (detail.stale && opts.acknowledgeStale !== true) {
    throw new ResourceAllocationError(
      'STALE_REQUEST_UNACKNOWLEDGED',
      'The allocation changed after this request was made. Review the current values before approving.',
      { lines: detail.lines }
    )
  }

  const current = new Map<string, number>()
  const rows: any[] = await ResourceAllocation.find({
    organization: actor.organizationId,
    member: member._id,
    project: { $in: (await Project.find(activeProjectFilter(actor.organizationId)).select('_id').lean()).map((p: any) => p._id) }
  })
    .select('project percent')
    .lean()
  for (const row of rows) current.set(String(row.project), row.percent)

  const prepared = buildPrepared(
    member,
    current,
    detail.lines.map((line) => ({ projectId: line.projectId, newPercent: line.newPercent })),
    detail.threshold
  )
  assertWithinThreshold(prepared)

  const claimed = await claim(actor.organizationId, requestId, {
    status: 'approved',
    decidedBy: actor.userId,
    decidedAt: new Date()
  })
  if (!claimed) throw notPending()

  if (prepared.changed.length > 0) {
    try {
      await applyChange({
        organizationId: actor.organizationId,
        actorId: detail.requestedBy._id,
        prepared,
        reason: detail.reason,
        kind: 'approved',
        approvedBy: actor.userId,
        requestId
      })
    } catch (error) {
      // Put the request back so it can be retried; the per-row upserts make a retry converge.
      await AllocationRequest.updateOne(
        { _id: requestId, status: 'approved', decidedBy: actor.userId },
        { $set: { status: 'pending' }, $unset: { decidedBy: 1, decidedAt: 1 } }
      )
      throw error
    }
  }

  notifyRequestDecided(actor.organizationId, detail.requestedBy._id, requestId, 'approved', detail.member.name).catch(
    () => undefined
  )
  logActivity({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: 'resource_request_approved',
    entityType: 'allocation_request',
    entityId: requestId,
    entityName: detail.member.name
  }).catch(() => undefined)

  return { status: 'approved', totalAfter: prepared.totalAfter }
}

function parseNote(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'string') {
    throw new ResourceAllocationError('VALIDATION_FAILED', 'The note must be text.')
  }
  const note = raw.trim()
  if (note.length > REASON_MAX_LENGTH) {
    throw new ResourceAllocationError('VALIDATION_FAILED', `The note must be ${REASON_MAX_LENGTH} characters or fewer.`)
  }
  return note || undefined
}

export async function rejectRequest(actor: Actor, requestId: string, note?: unknown): Promise<{ status: 'rejected' }> {
  const decisionNote = parseNote(note)
  const request = await loadRequest(actor.organizationId, requestId)

  const claimed = await claim(actor.organizationId, requestId, {
    status: 'rejected',
    decidedBy: actor.userId,
    decidedAt: new Date(),
    ...(decisionNote ? { decisionNote } : {})
  })
  if (!claimed) throw notPending()

  const memberName = fullName(request.member)
  notifyRequestDecided(
    actor.organizationId,
    String(request.requestedBy?._id ?? request.requestedBy),
    requestId,
    'rejected',
    memberName,
    decisionNote
  ).catch(() => undefined)
  logActivity({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: 'resource_request_rejected',
    entityType: 'allocation_request',
    entityId: requestId,
    entityName: memberName,
    details: decisionNote ? { note: decisionNote } : undefined
  }).catch(() => undefined)

  return { status: 'rejected' }
}

export async function cancelRequest(actor: Actor, requestId: string): Promise<{ status: 'cancelled' }> {
  const request = await loadRequest(actor.organizationId, requestId)
  if (String(request.requestedBy?._id ?? request.requestedBy) !== actor.userId) {
    throw new ResourceAllocationError('FORBIDDEN', 'Only the person who made a request can cancel it.')
  }

  const claimed = await claim(actor.organizationId, requestId, {
    status: 'cancelled',
    decidedBy: actor.userId,
    decidedAt: new Date()
  })
  if (!claimed) throw notPending()

  logActivity({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: 'resource_request_cancelled',
    entityType: 'allocation_request',
    entityId: requestId,
    entityName: fullName(request.member)
  }).catch(() => undefined)

  return { status: 'cancelled' }
}

export async function listRequests(
  organizationId: string,
  opts: { status?: string; requestedBy?: string; page: number; limit: number }
): Promise<{ items: RequestListItem[]; total: number }> {
  const filter: Record<string, unknown> = { organization: organizationId }
  if (opts.status) filter.status = opts.status
  if (opts.requestedBy) filter.requestedBy = opts.requestedBy

  const [requests, total] = await Promise.all([
    populateRequest(
      AllocationRequest.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((opts.page - 1) * opts.limit)
        .limit(opts.limit)
    ).lean(),
    AllocationRequest.countDocuments(filter)
  ])

  return { items: await toListItems(requests as any[]), total }
}
