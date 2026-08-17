/**
 * Setting a task's estimate (spec §17.4, PLN-15, E14, E18).
 *
 *   POST /api/tasks/:id/estimate
 *
 * Two situations reach this endpoint and they behave differently:
 *
 *   during planning   the estimate may be set and reset freely as the team
 *                     re-votes.
 *   after planning    E14 — a task added to a running sprint may be estimated
 *                     inline, with a mandatory reason, recorded as `manual`.
 *                     Once set it is frozen immediately, because that sprint
 *                     has already left Planning (DAT-6).
 *
 * Re-estimating an already-frozen task is refused with `ESTIMATE_IMMUTABLE`
 * (E18), which points the caller at the revision path instead.
 */
import mongoose from 'mongoose'

import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { StandupError, toErrorResponse } from '@/lib/standup/errors'
import { deriveEstimateMinutes, type EstimateUnit } from '@/lib/standup/estimates'
import { hasStandups, type SprintState } from '@/lib/standup/sprint-states'
import { NextRequest, NextResponse } from 'next/server'

interface EstimateBody {
  value: number
  unit?: EstimateUnit
  /** Mandatory when the sprint has already left planning (PLN-15). */
  reason?: string
  method?: 'poker' | 'manual'
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const task = await Task.findById(params.id)
    if (!task || task.organization?.toString() !== authResult.user.organization) {
      throw new StandupError('NOT_FOUND', 'That task no longer exists.', { taskId: params.id })
    }

    const projectId = task.project?.toString()
    const allowed = await PermissionService.hasPermission(
      authResult.user.id,
      Permission.TASK_UPDATE,
      projectId
    )
    if (!allowed) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You do not have permission to do that.' } },
        { status: 403 }
      )
    }

    const body = (await request.json().catch(() => ({}))) as EstimateBody

    // E18 — a frozen estimate is never re-set through this endpoint.
    if (task.estimateLockedAt) {
      throw new StandupError(
        'ESTIMATE_IMMUTABLE',
        'The original estimate cannot be changed after planning. Revise the remaining estimate instead.',
        { taskId: params.id }
      )
    }

    const sprint = task.sprint ? await Sprint.findById(task.sprint).lean() : null
    const sprintState = (sprint as any)?.status as SprintState | undefined
    // A sprint that already has stand-ups has left planning, so anything
    // estimated now is an E14 late addition.
    const isLateAddition = !!sprintState && hasStandups(sprintState)

    if (isLateAddition && (body.reason ?? '').trim().length < 10) {
      throw new StandupError(
        'VALIDATION_FAILED',
        'This sprint has already been planned. Say why this task is being added and estimated now (at least 10 characters).',
        { taskId: params.id }
      )
    }

    const settings = projectId
      ? await ProjectStandupSettings.findOne({ project: projectId }).select('pointsToHours').lean()
      : null

    const unit: EstimateUnit = body.unit ?? 'hours'
    const minutes = deriveEstimateMinutes({
      value: body.value,
      unit,
      pointsToHours: (settings as any)?.pointsToHours ?? 4
    })

    const before = {
      originalEstimateMinutes: task.originalEstimateMinutes,
      remainingEstimateMinutes: task.remainingEstimateMinutes
    }

    task.originalEstimateMinutes = minutes
    task.remainingEstimateMinutes = minutes
    task.estimateUnit = unit
    task.estimateValue = body.value
    // PLN-15: an inline estimate is always `manual`, and PA-4 surfaces that at
    // planning completion. Only the poker route may claim `poker`.
    task.estimateMethod = body.method === 'poker' ? 'poker' : 'manual'
    task.estimatedAt = new Date()
    task.estimatedBy = new mongoose.Types.ObjectId(authResult.user.id)

    // A late addition is frozen straight away — its sprint is already past the
    // point where DAT-6 applies.
    if (isLateAddition) task.estimateLockedAt = new Date()

    await task.save()

    await recordAudit({
      actor: { type: 'user', userId: authResult.user.id },
      organizationId: authResult.user.organization,
      projectId,
      action: 'task_estimated',
      entityType: 'task',
      entityId: params.id,
      entityName: task.displayId,
      before,
      after: {
        originalEstimateMinutes: minutes,
        estimateUnit: unit,
        estimateMethod: task.estimateMethod
      },
      context: isLateAddition ? { lateAddition: true, reason: body.reason } : undefined
    })

    return NextResponse.json({
      success: true,
      data: {
        taskId: params.id,
        originalEstimateMinutes: minutes,
        remainingEstimateMinutes: minutes,
        estimateMethod: task.estimateMethod,
        locked: !!task.estimateLockedAt
      }
    })
  } catch (error) {
    const { status, body } = toErrorResponse(error)
    if (status === 500) console.error('Task estimate route error:', error)
    return NextResponse.json(body, { status })
  }
}
