import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Task, TASK_STATUS_VALUES, TaskStatus } from '@/models/Task'
import { Project } from '@/models/Project'
import { invalidateCache } from '@/lib/redis'
import { Counter } from '@/models/Counter'

const TASK_STATUS_SET = new Set<TaskStatus>(TASK_STATUS_VALUES)

type IncomingSubtask = {
  _id?: string
  title?: unknown
  description?: unknown
  status?: unknown
  isCompleted?: unknown
}

type IncomingAttachment = {
  name?: unknown
  url?: unknown
  size?: unknown
  type?: unknown
  uploadedBy?: unknown
  uploadedAt?: unknown
}

function sanitizeLabels(input: any): string[] {
  if (Array.isArray(input)) {
    return input
      .filter((value): value is string => typeof value === 'string')
      .map(label => label.trim())
      .filter(label => label.length > 0)
  }

  if (typeof input === 'string') {
    return input
      .split(',')
      .map(part => part.trim())
      .filter(part => part.length > 0)
  }

  return []
}

function sanitizeSubtasks(input: any): Array<{
  _id?: string
  title: string
  description?: string
  status: TaskStatus
  isCompleted: boolean
}> {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .filter((item: IncomingSubtask) => typeof item?.title === 'string' && item.title.trim().length > 0)
    .map((item: IncomingSubtask) => {
      const rawStatus = typeof item.status === 'string' ? item.status : undefined
      const status = rawStatus && TASK_STATUS_SET.has(rawStatus as TaskStatus)
        ? rawStatus as TaskStatus
        : 'backlog'

      const sanitized: {
        _id?: string
        title: string
        description?: string
        status: TaskStatus
        isCompleted: boolean
      } = {
        title: (item.title as string).trim(),
        status,
        isCompleted: typeof item.isCompleted === 'boolean'
          ? item.isCompleted
          : status === 'done'
      }

      if (item._id && typeof item._id === 'string') {
        sanitized._id = item._id
      }

      if (typeof item.description === 'string') {
        const trimmed = item.description.trim()
        if (trimmed.length > 0) {
          sanitized.description = trimmed
        }
      }

      return sanitized
    })
}

function sanitizeAttachments(input: any, defaultUserId: string) {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item: IncomingAttachment) => {
      if (typeof item?.name !== 'string' || typeof item?.url !== 'string') {
        return null
      }

      const sizeValue = typeof item.size === 'number'
        ? item.size
        : typeof item.size === 'string'
          ? Number(item.size)
          : undefined

      if (typeof sizeValue !== 'number' || Number.isNaN(sizeValue)) {
        return null
      }

      const typeValue = typeof item.type === 'string' ? item.type : 'application/octet-stream'
      const uploadedByValue =
        typeof item.uploadedBy === 'string' && item.uploadedBy.trim().length > 0
          ? item.uploadedBy.trim()
          : defaultUserId

      const uploadedAtValue =
        typeof item.uploadedAt === 'string'
          ? new Date(item.uploadedAt)
          : new Date()

      return {
        name: item.name,
        url: item.url,
        size: sizeValue,
        type: typeValue,
        uploadedBy: uploadedByValue,
        uploadedAt: uploadedAtValue
      }
    })
    .filter((attachment): attachment is NonNullable<typeof attachment> => attachment !== null)
}

export async function POST(request: NextRequest) {
  try {
    await connectDB()

    // Skip authentication for bulk create
    // Get userId and organizationId from query params or use defaults
    const { searchParams } = new URL(request.url)
    let userId = searchParams.get('userId') || '000000000000000000000000' // Use valid ObjectId for system user
    
    // Validate userId is a valid ObjectId if provided
    if (searchParams.get('userId') && !/^[0-9a-fA-F]{24}$/.test(searchParams.get('userId')!)) {
      return NextResponse.json(
        { success: false, error: 'Invalid userId format - must be a valid ObjectId' },
        { status: 400 }
      )
    }
    
    let organizationId = searchParams.get('organizationId')

    let body
    try {
      body = await request.json()
    } catch (parseError) {
      console.error('JSON parse error:', parseError)
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body', details: parseError instanceof Error ? parseError.message : 'Unknown parsing error' },
        { status: 400 }
      )
    }

    if (!Array.isArray(body) || body.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Request body must be a non-empty array of task objects' },
        { status: 400 }
      )
    }

    // Validate each item in the array
    const tasksToCreate = []
    const projectIds = new Set()

    for (let i = 0; i < body.length; i++) {
      const item = body[i]
      if (!item || typeof item !== 'object') {
        return NextResponse.json(
          { success: false, error: `Item at index ${i} must be an object` },
          { status: 400 }
        )
      }

      const {
        title,
        description,
        status,
        priority,
        type,
        project,
        story,
        epic,
        parentTask,
        assignedTo,
        storyPoints,
        dueDate,
        estimatedHours,
        labels,
        subtasks,
        attachments,
        isBillable
      } = item

      // Validate required fields
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: `Item at index ${i} must have a non-empty 'title' string` },
          { status: 400 }
        )
      }

      if (!project || typeof project !== 'string' || project.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: `Item at index ${i} must have a non-empty 'project' string` },
          { status: 400 }
        )
      }

      // Validate project ID format
      try {
        if (!project.match(/^[0-9a-fA-F]{24}$/)) {
          return NextResponse.json(
            { success: false, error: `Item at index ${i} has invalid project ID format` },
            { status: 400 }
          )
        }
      } catch {
        return NextResponse.json(
          { success: false, error: `Item at index ${i} has invalid project ID` },
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
        story: typeof story === 'string' && story.trim() !== '' ? story.trim() : undefined,
        epic: typeof epic === 'string' && epic.trim() !== '' ? epic.trim() : undefined,
        parentTask: typeof parentTask === 'string' && parentTask.trim() !== '' ? parentTask.trim() : undefined,
        assignedTo: Array.isArray(assignedTo) ? assignedTo : (typeof assignedTo === 'string' && assignedTo.trim() !== '' ? [{ user: assignedTo.trim() }] : undefined),
        storyPoints: typeof storyPoints === 'number' ? storyPoints : (typeof storyPoints === 'string' && storyPoints.trim() !== '' ? Number(storyPoints) : undefined),
        dueDate: dueDate ? new Date(dueDate) : undefined,
        estimatedHours: typeof estimatedHours === 'number' ? estimatedHours : (typeof estimatedHours === 'string' && estimatedHours.trim() !== '' ? Number(estimatedHours) : undefined),
        labels: sanitizeLabels(labels),
        subtasks: sanitizeSubtasks(subtasks),
        attachments: sanitizeAttachments(attachments, userId),
        isBillable: typeof isBillable === 'boolean' ? isBillable : undefined
      })
      projectIds.add(project.trim())
    }

    // Check projects exist (skip organization check if no organizationId provided)
    const projectIdsArray = Array.from(projectIds)
    const projectQuery = organizationId 
      ? { _id: { $in: projectIdsArray }, organization: organizationId }
      : { _id: { $in: projectIdsArray } }
    
    const projects = await Project.find(projectQuery).select('projectNumber name teamMembers createdBy isBillableByDefault organization')

    if (projects.length !== projectIdsArray.length) {
      return NextResponse.json(
        { success: false, error: 'One or more projects not found' },
        { status: 404 }
      )
    }

    // If organizationId was provided, verify all projects belong to it
    if (organizationId) {
      const invalidProjects = projects.filter(p => p.organization?.toString() !== organizationId)
      if (invalidProjects.length > 0) {
        return NextResponse.json(
          { success: false, error: 'One or more projects do not belong to the specified organization' },
          { status: 403 }
        )
      }
    }

    // Skip permission checks for no-auth mode
    // for (const project of projects) {
    //   const canCreateTask = await PermissionService.hasPermission(userId, Permission.TASK_CREATE, project._id.toString())
    //   if (!canCreateTask) {
    //     return NextResponse.json(
    //       { success: false, error: `Access denied to create tasks in project: ${project.name}` },
    //       { status: 403 }
    //     )
    //   }
    // }

    // Create a map of project ID to team members and organization
    const projectTeamMap = new Map()
    for (const project of projects) {
      const teamMembers = project.teamMembers?.map((tm: { memberId: any; hourlyRate?: number }) => ({
        user: tm.memberId.toString(),
        hourlyRate: tm.hourlyRate
      })) || []
      projectTeamMap.set(project._id.toString(), {
        teamMembers,
        projectNumber: project.projectNumber,
        isBillableByDefault: project.isBillableByDefault,
        organization: project.organization?.toString(),
        createdBy: project.createdBy?.toString()
      })
    }

    // Create tasks
    const createdTasks = []
    const projectCounters = new Map()

    for (const taskData of tasksToCreate) {
      const projectInfo = projectTeamMap.get(taskData.project)
      if (!projectInfo) {
        continue // Should not happen
      }

      // Get or create counter for this project
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

      // Get next position
      const maxPositionDoc = await Task.findOne(
        { project: taskData.project, status: taskData.status },
        { position: 1 }
      ).sort({ position: -1 }).lean()

      const nextPosition = maxPositionDoc && 
        typeof maxPositionDoc === 'object' && 
        !Array.isArray(maxPositionDoc) && 
        'position' in maxPositionDoc && 
        typeof maxPositionDoc.position === 'number'
        ? maxPositionDoc.position + 1
        : 0

      // Handle assignedTo - if not provided, assign to team members
      let normalizedAssignedTo: Array<{ user: string; firstName?: string; lastName?: string; email?: string; hourlyRate?: number }> = []
      if (taskData.assignedTo && taskData.assignedTo.length > 0) {
        // Use provided assignedTo
        normalizedAssignedTo = taskData.assignedTo
          .filter(item => typeof item === 'object' && item !== null && item.user)
          .map(item => ({
            user: typeof item.user === 'string' ? item.user.trim() : String(item.user),
            firstName: typeof item.firstName === 'string' ? item.firstName.trim() : undefined,
            lastName: typeof item.lastName === 'string' ? item.lastName.trim() : undefined,
            email: typeof item.email === 'string' ? item.email.trim() : undefined,
            hourlyRate: typeof item.hourlyRate === 'number' && item.hourlyRate >= 0 ? item.hourlyRate : undefined
          }))
      } else {
        // Auto-assign to team members (round-robin)
        const teamMembers = projectInfo.teamMembers
        if (teamMembers.length > 0) {
          const assigneeIndex = createdTasks.length % teamMembers.length
          normalizedAssignedTo = [teamMembers[assigneeIndex]]
        }
      }

      const task = new Task({
        title: taskData.title,
        description: taskData.description,
        status: taskData.status,
        priority: taskData.priority,
        type: taskData.type,
        organization: organizationId || projectInfo.organization,
        project: taskData.project,
        taskNumber: counter.seq,
        displayId: `${projectInfo.projectNumber}.${counter.seq}`,
        story: taskData.story,
        epic: taskData.epic,
        parentTask: taskData.parentTask,
        assignedTo: normalizedAssignedTo,
        createdBy: projectInfo.createdBy || userId,
        storyPoints: taskData.storyPoints,
        dueDate: taskData.dueDate,
        estimatedHours: taskData.estimatedHours,
        labels: taskData.labels,
        subtasks: taskData.subtasks,
        attachments: taskData.attachments,
        position: nextPosition,
        isBillable: taskData.isBillable ?? projectInfo.isBillableByDefault ?? true
      })

      await task.save()
      createdTasks.push(task)
    }

    // Invalidate cache for affected projects and organizations
    const affectedOrganizations = new Set<string>()
    for (const projectId of projectIdsArray) {
      await invalidateCache(`tasks:*project:${projectId}*`)
      const projectInfo = projectTeamMap.get(projectId)
      if (projectInfo?.organization) {
        affectedOrganizations.add(projectInfo.organization)
      }
    }
    for (const orgId of Array.from(affectedOrganizations)) {
      await invalidateCache(`tasks:*org:${orgId}*`)
    }

    return NextResponse.json({
      success: true,
      data: createdTasks,
      message: `Bulk task creation completed successfully. Created ${createdTasks.length} tasks.`
    })
  } catch (error) {
    console.error('Error performing bulk task creation:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create tasks' },
      { status: 500 }
    )
  }
}