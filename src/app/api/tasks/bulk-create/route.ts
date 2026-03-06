import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import mongoose from 'mongoose'
import { Task } from '@/models/Task'
import { Project } from '@/models/Project'
import { invalidateCache } from '@/lib/redis'
import { Counter } from '@/models/Counter'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

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

    const userId = authResult.user.id
    const organizationId = authResult.user.organization

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    if (!Array.isArray(body) || body.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Request body must be a non-empty array of task objects' },
        { status: 400 }
      )
    }

    if (body.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Maximum 500 tasks per bulk upload' },
        { status: 400 }
      )
    }

    // Validate and normalize each item
    const tasksToCreate = []
    const projectIds = new Set<string>()

    for (let i = 0; i < body.length; i++) {
      const item = body[i]
      if (!item || typeof item !== 'object') {
        return NextResponse.json(
          { success: false, error: `Item at index ${i} must be an object` },
          { status: 400 }
        )
      }

      const { title, description, status, priority, type, project, assignedTo, dueDate, estimatedHours, labels, isBillable } = item

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: `Item at index ${i} must have a non-empty 'title' string` },
          { status: 400 }
        )
      }

      if (!project || typeof project !== 'string' || !project.match(/^[0-9a-fA-F]{24}$/)) {
        return NextResponse.json(
          { success: false, error: `Item at index ${i} has invalid or missing project ID` },
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

    // Fetch and validate all referenced projects
    const projectIdsArray = Array.from(projectIds)
    const projects = await Project.find(
      organizationId
        ? { _id: { $in: projectIdsArray }, organization: organizationId }
        : { _id: { $in: projectIdsArray } }
    ).select('_id projectNumber name teamMembers createdBy isBillableByDefault organization')

    if (projects.length !== projectIdsArray.length) {
      return NextResponse.json(
        { success: false, error: 'One or more projects not found or do not belong to your organization' },
        { status: 404 }
      )
    }

    // Check permissions for each project
    for (const project of projects) {
      const canCreateTask = await PermissionService.hasPermission(userId, Permission.TASK_CREATE, project._id.toString())
      if (!canCreateTask) {
        return NextResponse.json(
          { success: false, error: `Access denied to create tasks in project: ${project.name}` },
          { status: 403 }
        )
      }
    }

    // Build project info map
    const projectInfoMap = new Map<string, { projectNumber: number; isBillableByDefault: boolean; organization: string; createdBy: string }>()
    for (const project of projects) {
      projectInfoMap.set(project._id.toString(), {
        projectNumber: project.projectNumber,
        isBillableByDefault: project.isBillableByDefault,
        organization: project.organization?.toString() || '',
        createdBy: project.createdBy?.toString() || ''
      })
    }

    // Create tasks
    const createdTasks = []
    const projectCounters = new Map<string, any>()

    for (const taskData of tasksToCreate) {
      const projectInfo = projectInfoMap.get(taskData.project)
      if (!projectInfo) continue

      // Get or increment counter for this project
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
      const maxPositionDoc = await Task.findOne(
        { project: taskData.project, status: taskData.status },
        { position: 1 }
      ).sort({ position: -1 }).lean() as { position?: number } | null

      const nextPosition = typeof maxPositionDoc?.position === 'number'
        ? maxPositionDoc.position + 1
        : 0

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
    for (const projectId of projectIdsArray) {
      invalidateCache(`tasks:*project:${projectId}*`).catch(() => {})
    }
    if (organizationId) {
      invalidateCache(`tasks:*org:${organizationId}*`).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      data: createdTasks,
      message: `Successfully created ${createdTasks.length} tasks.`
    })
  } catch (error) {
    console.error('[bulk-create] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create tasks' },
      { status: 500 }
    )
  }
}
