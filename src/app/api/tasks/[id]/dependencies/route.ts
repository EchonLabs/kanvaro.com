import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { Task } from '@/models/Task'
import { logTaskActivity } from '@/lib/task-activity-logger'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

const TASK_POPULATE_FIELDS = '_id displayId taskNumber title status priority type project assignedTo dueDate'

// Authenticate user, validate task ID, and verify task belongs to user's organization
async function getTaskAndAuthorize(taskId: string) {
  const auth = await authenticateUser()
  if ('error' in auth) return { error: auth.error, status: auth.status }
  await connectDB()
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    return { error: 'Invalid task ID', status: 400 }
  }

  const task = await Task.findOne({ _id: taskId, organization: auth.user.organization })
    .select('_id displayId title status project assignedTo createdBy')
  if (!task) {
    return { error: 'Task not found or unauthorized', status: 404 }
  }

  return { user: auth.user, task }
}

// Verify user has permission to view the task
async function canViewTask(userId: string, task: any): Promise<boolean> {
  const isAssignee = Array.isArray(task.assignedTo) && task.assignedTo.some((a: any) => (a.user?._id || a.user || a)?.toString() === userId.toString())
  const isCreator = task.createdBy?.toString() === userId.toString()
  if (isAssignee || isCreator) return true

  const [hasTaskViewAll, hasProjectViewAll, canViewAssignedProjects] = await Promise.all([
    PermissionService.hasPermission(userId, Permission.TASK_VIEW_ALL),
    PermissionService.hasPermission(userId, Permission.PROJECT_VIEW_ALL),
    PermissionService.hasPermission(userId, Permission.TASK_VIEW_ASSIGNED_PROJECTS)
  ])
  if (hasTaskViewAll || hasProjectViewAll) return true

  if (canViewAssignedProjects && task.project) {
    const accessibleProjects = await PermissionService.getAccessibleProjects(userId)
    return accessibleProjects.includes(task.project.toString())
  }
  return false
}

// Verify user has permission to modify the task
async function canEditTask(userId: string, task: any): Promise<boolean> {
  const isAssignee = Array.isArray(task.assignedTo) && task.assignedTo.some((a: any) => (a.user?._id || a.user || a)?.toString() === userId.toString())
  const isCreator = task.createdBy?.toString() === userId.toString()
  const projectId = task.project?.toString()

  const [hasTaskEditAll, hasProjectViewAll, canEditAssignedProjects] = await Promise.all([
    PermissionService.hasPermission(userId, Permission.TASK_EDIT_ALL),
    PermissionService.hasPermission(userId, Permission.PROJECT_VIEW_ALL),
    PermissionService.hasPermission(userId, Permission.TASK_EDIT_ASSIGNED_PROJECTS)
  ])
  if (hasTaskEditAll || hasProjectViewAll || isAssignee || isCreator) return true

  if (canEditAssignedProjects && projectId) {
    const accessibleProjects = await PermissionService.getAccessibleProjects(userId)
    return accessibleProjects.includes(projectId)
  }
  return false
}

// Extract targetTaskId and relationship from body or query params
async function getDependencyPayload(req: NextRequest): Promise<{ targetTaskId: string; relationship: string }> {
  try {
    const body = await req.json()
    return {
      targetTaskId: String(body?.targetTaskId || ''),
      relationship: String(body?.relationship || ''),
    }
  } catch {
    const url = new URL(req.url)
    return {
      targetTaskId: url.searchParams.get('targetTaskId') || '',
      relationship: url.searchParams.get('relationship') || '',
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

// Helper to fetch string dependency IDs for a given task
async function getTaskDependencyIds(taskId: string, orgId: any): Promise<string[]> {
  const task: any = await Task.findOne({ _id: taskId, organization: orgId }).select('dependencies').lean()
  if (!task || !Array.isArray(task.dependencies)) return []
  return task.dependencies.map((dep: any) => (dep?._id || dep).toString())
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

    const depIds = await getTaskDependencyIds(current, orgId)
    for (const depId of depIds) {
      if (depId === toId) return true
      if (!visited.has(depId)) queue.push(depId)
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
    const auth = await getTaskAndAuthorize(params.id)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    if (!(await canViewTask(auth.user.id, auth.task))) {
      return NextResponse.json({ error: 'Unauthorized to view task dependencies' }, { status: 403 })
    }

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
    const auth = await getTaskAndAuthorize(params.id)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    if (!(await canEditTask(auth.user.id, auth.task))) {
      return NextResponse.json({ error: 'Unauthorized to manage task dependencies' }, { status: 403 })
    }

    const { targetTaskId, relationship } = await getDependencyPayload(req)
    const validationError = validatePayload(params.id, targetTaskId, relationship)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    const orgId = auth.user.organization
    const currentTask = auth.task
    const targetTask = await Task.findOne({ _id: targetTaskId, organization: orgId }).select('_id displayId title status')

    if (!targetTask) {
      return NextResponse.json({ error: 'Target task not found' }, { status: 404 })
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
    const auth = await getTaskAndAuthorize(params.id)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    if (!(await canEditTask(auth.user.id, auth.task))) {
      return NextResponse.json({ error: 'Unauthorized to manage task dependencies' }, { status: 403 })
    }

    const { targetTaskId, relationship } = await getDependencyPayload(req)
    const validationError = validatePayload(params.id, targetTaskId, relationship)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    const orgId = auth.user.organization
    const dependentId = relationship === 'blocked_by' ? params.id : targetTaskId
    const blockerId: string = relationship === 'blocked_by' ? targetTaskId : params.id

    await Task.findByIdAndUpdate(dependentId, {
      $pull: { dependencies: new mongoose.Types.ObjectId(blockerId as string) }
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
