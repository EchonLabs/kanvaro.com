import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { Task } from '@/models/Task'
import { logTaskActivity } from '@/lib/task-activity-logger'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

const TASK_POPULATE_FIELDS = '_id displayId taskNumber title status priority type project assignedTo dueDate'

// Authenticate, validate task ID parameter, and verify user permissions
async function authAndConnect(taskId: string, action: 'read' | 'write' = 'read') {
  const auth = await authenticateUser()
  if ('error' in auth) return { error: auth.error, status: auth.status }
  await connectDB()
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    return { error: 'Invalid task ID', status: 400 }
  }

  const userId = auth.user.id
  const organizationId = auth.user.organization

  // Verify task exists and belongs to the user's organization
  const task = await Task.findOne({ _id: taskId, organization: organizationId }).select('_id project assignedTo createdBy')
  if (!task) {
    return { error: 'Task not found or unauthorized', status: 404 }
  }

  const isAssignee = Array.isArray(task.assignedTo) && task.assignedTo.some((a: any) => (a.user?._id || a.user || a)?.toString() === userId.toString())
  const isCreator = task.createdBy && task.createdBy.toString() === userId.toString()
  const projectId = task.project?.toString()

  if (action === 'read') {
    const [hasTaskViewAll, hasProjectViewAll, canViewAssignedProjects] = await Promise.all([
      PermissionService.hasPermission(userId, Permission.TASK_VIEW_ALL),
      PermissionService.hasPermission(userId, Permission.PROJECT_VIEW_ALL),
      PermissionService.hasPermission(userId, Permission.TASK_VIEW_ASSIGNED_PROJECTS)
    ])

    let hasAccess = hasTaskViewAll || hasProjectViewAll || isAssignee || isCreator
    if (!hasAccess && canViewAssignedProjects && projectId) {
      const accessibleProjects = await PermissionService.getAccessibleProjects(userId)
      hasAccess = accessibleProjects.includes(projectId)
    }

    if (!hasAccess) {
      return { error: 'Unauthorized to view task dependencies', status: 403 }
    }
  } else {
    const [hasTaskEditAll, hasProjectViewAll, canEditAssignedProjects, canTaskUpdate] = await Promise.all([
      PermissionService.hasPermission(userId, Permission.TASK_EDIT_ALL),
      PermissionService.hasPermission(userId, Permission.PROJECT_VIEW_ALL),
      PermissionService.hasPermission(userId, Permission.TASK_EDIT_ASSIGNED_PROJECTS),
      PermissionService.hasPermission(userId, Permission.TASK_UPDATE, projectId)
    ])

    let hasAccess = hasTaskEditAll || hasProjectViewAll || canTaskUpdate || isAssignee || isCreator
    if (!hasAccess && canEditAssignedProjects && projectId) {
      const accessibleProjects = await PermissionService.getAccessibleProjects(userId)
      hasAccess = accessibleProjects.includes(projectId)
    }

    if (!hasAccess) {
      return { error: 'Unauthorized to manage task dependencies', status: 403 }
    }
  }

  return { user: auth.user, task }
}

// Extract targetTaskId and relationship from body or query params
async function getDependencyPayload(req: NextRequest) {
  try {
    return await req.json()
  } catch {
    const url = new URL(req.url)
    return {
      targetTaskId: url.searchParams.get('targetTaskId'),
      relationship: url.searchParams.get('relationship'),
    }
  }
}

// Validate relationship parameters
function validatePayload(taskId: string, targetTaskId: any, relationship: any) {
  if (!targetTaskId || !mongoose.Types.ObjectId.isValid(targetTaskId)) {
    return 'Valid target task ID is required'
  }
  if (relationship !== 'blocked_by' && relationship !== 'blocking') {
    return 'Relationship must be "blocked_by" or "blocking"'
  }
  if (targetTaskId === taskId) {
    return 'A task cannot depend on itself'
  }
  return null
}

// Check if a dependency chain would create an infinite cycle
async function wouldCreateCycle(fromId: string, toId: string, orgId: any): Promise<boolean> {
  const visited = new Set<string>()
  const queue = [fromId]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === toId) return true
    if (visited.has(current)) continue
    visited.add(current)

    const t = await Task.findOne({ _id: current, organization: orgId }).select('dependencies').lean()
    if (t && Array.isArray((t as any).dependencies)) {
      for (const depId of (t as any).dependencies) {
        const depStr = (depId?._id || depId).toString()
        if (depStr === toId) return true
        if (!visited.has(depStr)) queue.push(depStr)
      }
    }
  }
  return false
}

// Fetch both blockedBy and blocking tasks for response
async function fetchDependencies(taskId: string, orgId: any) {
  const [currentTask, blockingTasks] = await Promise.all([
    Task.findOne({ _id: taskId, organization: orgId })
      .populate({
        path: 'dependencies',
        select: TASK_POPULATE_FIELDS,
        populate: { path: 'assignedTo.user', select: '_id firstName lastName email avatar' }
      })
      .lean(),
    Task.find({ dependencies: taskId, organization: orgId })
      .select(TASK_POPULATE_FIELDS)
      .populate({ path: 'assignedTo.user', select: '_id firstName lastName email avatar' })
      .lean()
  ])

  return {
    blockedBy: (currentTask as any)?.dependencies || [],
    blocking: blockingTasks || []
  }
}

/**
 * GET /api/tasks/[id]/dependencies
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authAndConnect(params.id, 'read')
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const data = await fetchDependencies(params.id, auth.user.organization)
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error fetching task dependencies:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch dependencies' }, { status: 500 })
  }
}

/**
 * POST /api/tasks/[id]/dependencies
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authAndConnect(params.id, 'write')
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { targetTaskId, relationship } = await getDependencyPayload(req)
    const validationError = validatePayload(params.id, targetTaskId, relationship)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    const orgId = auth.user.organization
    const [currentTask, targetTask] = await Promise.all([
      Task.findOne({ _id: params.id, organization: orgId }).select('_id displayId title status'),
      Task.findOne({ _id: targetTaskId, organization: orgId }).select('_id displayId title status')
    ])

    if (!currentTask || !targetTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (['done', 'cancelled'].includes(targetTask.status) || ['done', 'cancelled'].includes(currentTask.status)) {
      return NextResponse.json({ error: 'Cannot link dependencies with completed or cancelled tasks.' }, { status: 400 })
    }

    const dependentId = relationship === 'blocked_by' ? params.id : targetTaskId
    const blockerId = relationship === 'blocked_by' ? targetTaskId : params.id

    if (await wouldCreateCycle(blockerId, dependentId, orgId)) {
      return NextResponse.json({
        error: `Circular dependency detected: Cannot create loop between "${currentTask.displayId || currentTask.title}" and "${targetTask.displayId || targetTask.title}".`
      }, { status: 400 })
    }

    await Task.findByIdAndUpdate(dependentId, { $addToSet: { dependencies: blockerId } })

    await logTaskActivity({
      taskId: dependentId,
      organizationId: orgId.toString(),
      userId: auth.user.id.toString(),
      action: 'updated',
      field: 'dependencies',
      newValue: relationship === 'blocked_by'
        ? `Added blocker: ${targetTask.displayId || targetTask.title}`
        : `Marked as blocked by: ${currentTask.displayId || currentTask.title}`
    })

    const data = await fetchDependencies(params.id, orgId)
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error creating task dependency:', error)
    return NextResponse.json({ error: error.message || 'Failed to create dependency' }, { status: 500 })
  }
}

/**
 * DELETE /api/tasks/[id]/dependencies
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authAndConnect(params.id, 'write')
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { targetTaskId, relationship } = await getDependencyPayload(req)
    const validationError = validatePayload(params.id, targetTaskId, relationship)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    const orgId = auth.user.organization
    const dependentId = relationship === 'blocked_by' ? params.id : targetTaskId
    const blockerId = relationship === 'blocked_by' ? targetTaskId : params.id

    await Task.findByIdAndUpdate(dependentId, {
      $pull: { dependencies: new mongoose.Types.ObjectId(blockerId) }
    })

    await logTaskActivity({
      taskId: dependentId,
      organizationId: orgId.toString(),
      userId: auth.user.id.toString(),
      action: 'updated',
      field: 'dependencies',
      newValue: 'Removed dependency link'
    })

    const data = await fetchDependencies(params.id, orgId)
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error removing task dependency:', error)
    return NextResponse.json({ error: error.message || 'Failed to remove dependency' }, { status: 500 })
  }
}
