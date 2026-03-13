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
import { fixImagePathsInDescription } from '@/lib/image-path-utils'

/** Detect MIME type from file extension */
function getFileTypeFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif',
    'webp': 'image/webp', 'svg': 'image/svg+xml',
    'pdf': 'application/pdf', 'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'txt': 'text/plain', 'csv': 'text/csv',
    'zip': 'application/zip',
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

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
    } else if (action === 'check-duplicates') {
      return handleCheckDuplicates(body, organizationId)
    } else if (action === 'create') {
      return handleCreate(body, userId, organizationId)
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Use "resolve", "check-duplicates", or "create".' },
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
// Action: check-duplicates — find existing tasks matching CSV rows
// ─────────────────────────────────────────────
async function handleCheckDuplicates(
  body: any,
  organizationId: string
) {
  const { tasks } = body as {
    tasks: Array<{ title: string; projectId: string; rowIndex: number }>
  }

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return NextResponse.json(
      { success: false, error: '"tasks" must be a non-empty array' },
      { status: 400 }
    )
  }

  // Group by project for efficient querying
  const byProject = new Map<string, Array<{ title: string; rowIndex: number }>>()
  for (const t of tasks) {
    if (!t.title || !t.projectId) continue
    const list = byProject.get(t.projectId) || []
    list.push({ title: t.title.trim(), rowIndex: t.rowIndex })
    byProject.set(t.projectId, list)
  }

  // For each project, find existing tasks with matching titles
  const duplicates: Record<number, string> = {} // rowIndex → existing task displayId

  for (const [projectId, rows] of Array.from(byProject.entries())) {
    const titles = rows.map(r => r.title)
    const existingTasks = await Task.find({
      project: projectId,
      organization: organizationId,
      title: { $in: titles.map(t => new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) }
    }).select('title displayId').lean() as unknown as Array<{ title: string; displayId?: string }>

    if (existingTasks.length > 0) {
      const existingMap = new Map<string, string>()
      for (const et of existingTasks) {
        existingMap.set(et.title.toLowerCase(), et.displayId || et.title)
      }
      for (const row of rows) {
        const match = existingMap.get(row.title.toLowerCase())
        if (match) {
          duplicates[row.rowIndex] = match
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: { duplicates }
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

    const { title, description, status, priority, type, project, assignedTo, dueDate, estimatedHours, labels, isBillable, createdAt: taskCreatedAt, assignedBy, attachments: taskAttachments, subtasks: taskSubtasks, comments: taskComments } = item

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
      description: typeof description === 'string' ? fixImagePathsInDescription(description.trim()) : '',
      status: typeof status === 'string' && status.trim().length > 0 ? status.trim() : 'backlog',
      priority: typeof priority === 'string' && ['low', 'medium', 'high', 'critical'].includes(priority) ? priority : 'medium',
      type: typeof type === 'string' && ['bug', 'feature', 'improvement', 'task', 'subtask'].includes(type) ? type : 'task',
      project: project.trim(),
      assignedTo: Array.isArray(assignedTo) ? assignedTo : [],
      dueDate: dueDate ? new Date(dueDate) : undefined,
      estimatedHours: typeof estimatedHours === 'number' ? estimatedHours : undefined,
      labels: Array.isArray(labels) ? labels.filter((l: unknown) => typeof l === 'string') : [],
      isBillable: typeof isBillable === 'boolean' ? isBillable : undefined,
      createdAt: taskCreatedAt ? new Date(taskCreatedAt) : undefined,
      assignedBy: typeof assignedBy === 'string' && assignedBy.match(/^[0-9a-fA-F]{24}$/) ? assignedBy : undefined,
      attachments: Array.isArray(taskAttachments) ? taskAttachments : [],
      subtasks: Array.isArray(taskSubtasks) ? taskSubtasks : [],
      comments: Array.isArray(taskComments) ? taskComments : [],
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
      createdBy: taskData.assignedBy || userId,
      dueDate: taskData.dueDate,
      estimatedHours: taskData.estimatedHours,
      labels: taskData.labels,
      position: nextPosition,
      isBillable: taskData.isBillable ?? projectInfo.isBillableByDefault ?? true,
      ...(taskData.assignedBy && { assignedBy: taskData.assignedBy }),
      ...(taskData.attachments.length > 0 && {
        attachments: taskData.attachments.map((a: any) => ({
          name: a.name || 'attachment',
          url: a.url,
          size: 0,
          type: getFileTypeFromPath(a.url || a.name || ''),
          uploadedBy: userId,
          uploadedAt: new Date()
        }))
      }),
      ...(taskData.subtasks.length > 0 && {
        subtasks: taskData.subtasks
          .filter((s: any) => typeof s.title === 'string' && s.title.trim().length > 0)
          .map((s: any) => ({
            title: s.title.trim().slice(0, 200),
            status: 'backlog',
            isCompleted: false
          }))
      }),
      ...(taskData.comments.length > 0 && {
        comments: taskData.comments
          .filter((c: any) => typeof c.content === 'string' && c.content.trim().length > 0)
          .map((c: any) => ({
            content: c.content.trim(),
            author: userId,
            createdAt: new Date()
          }))
      }),
    })

    // Override createdAt if provided from CSV
    if (taskData.createdAt) {
      task.createdAt = taskData.createdAt
    }

    await task.save({ timestamps: !taskData.createdAt })
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
