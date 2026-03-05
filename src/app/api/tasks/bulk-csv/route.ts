import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import mongoose from 'mongoose'
import { User } from '@/models/User'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
import { Counter } from '@/models/Counter'
import { invalidateCache } from '@/lib/redis'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

/**
 * POST /api/tasks/bulk-csv
 * 
 * Handles two actions:
 *   action: "resolve" — Resolves project names and assignee emails/names to IDs
 *   action: "create"  — Creates tasks in bulk from validated CSV data
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const userId = user.id
    const organizationId = user.organization

    const body = await request.json()
    const action = body.action || 'resolve'

    if (action === 'resolve') {
      return handleResolve(body, organizationId)
    } else if (action === 'create') {
      return handleCreate(body, userId, organizationId)
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Use "resolve" or "create".' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('[bulk-csv] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ─────────────────────────────────────────────
// Action: resolve — lookup project names & assignee emails → IDs
// ─────────────────────────────────────────────
async function handleResolve(
  body: any,
  organizationId: string
) {
  const { projectNames, assigneeIdentifiers } = body as {
    projectNames: string[]
    assigneeIdentifiers: string[]
  }

  if (!Array.isArray(projectNames) || !Array.isArray(assigneeIdentifiers)) {
    return NextResponse.json(
      { success: false, error: 'projectNames and assigneeIdentifiers must be arrays' },
      { status: 400 }
    )
  }

  // Resolve projects by name (case-insensitive) within the organization
  const uniqueProjectNames = Array.from(new Set(projectNames.map(n => n.trim()).filter(Boolean)))
  const projectMap: Record<string, { _id: string; name: string; projectNumber: number; isBillableByDefault: boolean }> = {}

  if (uniqueProjectNames.length > 0) {
    const projects = await Project.find({
      organization: organizationId,
      name: { $in: uniqueProjectNames.map(n => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) }
    }).select('_id name projectNumber isBillableByDefault teamMembers')

    for (const p of projects) {
      projectMap[p.name.toLowerCase()] = {
        _id: p._id.toString(),
        name: p.name,
        projectNumber: p.projectNumber,
        isBillableByDefault: p.isBillableByDefault
      }
    }
  }

  // Resolve assignees by email or full name within the organization
  const uniqueAssignees = Array.from(new Set(assigneeIdentifiers.map(a => a.trim().toLowerCase()).filter(Boolean)))
  const userMap: Record<string, { _id: string; firstName: string; lastName: string; email: string; hourlyRate?: number }> = {}

  if (uniqueAssignees.length > 0) {
    const orConditions: any[] = [
      { email: { $in: uniqueAssignees } }
    ]
    for (const name of uniqueAssignees) {
      const parts = name.split(/\s+/)
      if (parts.length >= 2) {
        orConditions.push({
          firstName: new RegExp(`^${parts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          lastName: new RegExp(`^${parts.slice(1).join(' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
        })
      } else {
        orConditions.push(
          { firstName: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          { lastName: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        )
      }
    }

    const users = await User.find({
      organization: organizationId,
      isActive: true,
      $or: orConditions
    }).select('_id firstName lastName email hourlyRate')

    for (const u of users) {
      const userData = {
        _id: u._id.toString(),
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        hourlyRate: u.hourlyRate
      }
      userMap[u.email.toLowerCase()] = userData
      userMap[`${u.firstName} ${u.lastName}`.toLowerCase()] = userData
      userMap[u.firstName.toLowerCase()] = userData
    }
  }

  return NextResponse.json({
    success: true,
    data: { projectMap, userMap }
  })
}

// ─────────────────────────────────────────────
// Action: create — bulk-create tasks from validated CSV payload
// ─────────────────────────────────────────────
async function handleCreate(
  body: any,
  userId: string,
  organizationId: string
) {
  const { tasks: taskList } = body

  if (!Array.isArray(taskList) || taskList.length === 0) {
    return NextResponse.json(
      { success: false, error: '"tasks" must be a non-empty array' },
      { status: 400 }
    )
  }

  if (taskList.length > 500) {
    return NextResponse.json(
      { success: false, error: 'Maximum 500 tasks per bulk upload' },
      { status: 400 }
    )
  }

  // Validate and normalize
  const tasksToCreate = []
  const projectIds = new Set<string>()

  for (let i = 0; i < taskList.length; i++) {
    const item = taskList[i]
    if (!item || typeof item !== 'object') {
      return NextResponse.json(
        { success: false, error: `Item at index ${i} must be an object` },
        { status: 400 }
      )
    }

    const { title, description, status, priority, type, project, assignedTo, dueDate, estimatedHours, labels, isBillable } = item

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: `Item at index ${i}: title is required` },
        { status: 400 }
      )
    }

    if (!project || typeof project !== 'string' || !project.match(/^[0-9a-fA-F]{24}$/)) {
      return NextResponse.json(
        { success: false, error: `Item at index ${i}: invalid or missing project ID` },
        { status: 400 }
      )
    }

    tasksToCreate.push({
      title: title.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      status: typeof status === 'string' && status.trim().length > 0 ? status.trim() : 'backlog',
      priority: typeof priority === 'string' && ['low', 'medium', 'high', 'critical'].includes(priority) ? priority : 'medium',
      type: typeof type === 'string' && ['bug', 'feature', 'improvement', 'task', 'subtask'].includes(type) ? type : 'task',
      project: project.trim(),
      assignedTo: Array.isArray(assignedTo) ? assignedTo : [],
      dueDate: dueDate ? new Date(dueDate) : undefined,
      estimatedHours: typeof estimatedHours === 'number' ? estimatedHours : undefined,
      labels: Array.isArray(labels) ? labels.filter((l: unknown) => typeof l === 'string') : [],
      isBillable: typeof isBillable === 'boolean' ? isBillable : undefined
    })
    projectIds.add(project.trim())
  }

  // Validate projects exist & user has permission
  const projectIdsArray = Array.from(projectIds)
  const projects = await Project.find(
    organizationId
      ? { _id: { $in: projectIdsArray }, organization: organizationId }
      : { _id: { $in: projectIdsArray } }
  ).select('_id projectNumber name isBillableByDefault organization createdBy')

  if (projects.length !== projectIdsArray.length) {
    return NextResponse.json(
      { success: false, error: 'One or more projects not found in your organization' },
      { status: 404 }
    )
  }

  for (const project of projects) {
    const canCreate = await PermissionService.hasPermission(userId, Permission.TASK_CREATE, project._id.toString())
    if (!canCreate) {
      return NextResponse.json(
        { success: false, error: `Access denied for project: ${project.name}` },
        { status: 403 }
      )
    }
  }

  // Build project info map
  const projectInfoMap = new Map<string, { projectNumber: number; isBillableByDefault: boolean; organization: string }>()
  for (const p of projects) {
    projectInfoMap.set(p._id.toString(), {
      projectNumber: p.projectNumber,
      isBillableByDefault: p.isBillableByDefault,
      organization: p.organization?.toString() || ''
    })
  }

  // Create all tasks
  const createdTasks = []
  const projectCounters = new Map<string, any>()

  for (const taskData of tasksToCreate) {
    const projectInfo = projectInfoMap.get(taskData.project)
    if (!projectInfo) continue

    // Get or increment counter
    let counter = projectCounters.get(taskData.project)
    if (!counter) {
      counter = await Counter.findOneAndUpdate(
        { scope: 'task', project: taskData.project },
        { $inc: { seq: 1 }, $setOnInsert: { updatedAt: new Date() } },
        { new: true, upsert: true }
      )
      projectCounters.set(taskData.project, counter)
    } else {
      counter.seq += 1
      await counter.save()
    }

    // Get next kanban position
    const maxPosDoc = await Task.findOne(
      { project: taskData.project, status: taskData.status },
      { position: 1 }
    ).sort({ position: -1 }).lean() as { position?: number } | null

    const nextPosition = typeof maxPosDoc?.position === 'number' ? maxPosDoc.position + 1 : 0

    const task = new Task({
      _id: new mongoose.Types.ObjectId(),
      title: taskData.title,
      description: taskData.description,
      status: taskData.status,
      priority: taskData.priority,
      type: taskData.type,
      organization: organizationId || projectInfo.organization,
      project: taskData.project,
      taskNumber: counter.seq,
      displayId: `${projectInfo.projectNumber}.${counter.seq}`,
      assignedTo: taskData.assignedTo,
      createdBy: userId,
      dueDate: taskData.dueDate,
      estimatedHours: taskData.estimatedHours,
      labels: taskData.labels,
      position: nextPosition,
      isBillable: taskData.isBillable ?? projectInfo.isBillableByDefault ?? true
    })

    await task.save()
    createdTasks.push(task)
  }

  // Invalidate caches (non-blocking)
  for (const pid of projectIdsArray) {
    invalidateCache(`tasks:*project:${pid}*`).catch(() => {})
  }
  if (organizationId) {
    invalidateCache(`tasks:*org:${organizationId}*`).catch(() => {})
  }

  return NextResponse.json({
    success: true,
    data: createdTasks,
    message: `Successfully created ${createdTasks.length} tasks.`
  })
}
