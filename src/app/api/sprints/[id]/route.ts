import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'
import { Project } from '@/models/Project'
import '@/models/Story'
import '@/models/Epic'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { logActivity } from '@/lib/activity-logger'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {

    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const userId = user.id
    const organizationId = user.organization
    const sprintId = params.id

    const canViewSprint = await PermissionService.hasAnyPermission(
      userId.toString(),
      [Permission.SPRINT_VIEW, Permission.SPRINT_READ]
    )

    if (!canViewSprint) {
      return NextResponse.json(
        { error: 'You do not have permission to view this sprint' },
        { status: 403 }
      )
    }

    // Check if user has permission to view all sprints
    const hasSprintViewAll = await PermissionService.hasPermission(
      userId,
      Permission.SPRINT_VIEW_ALL
    );

    const sprint = await Sprint.findOne({ _id: sprintId })
      .populate('project', 'name settings')
      .populate('createdBy', 'firstName lastName email')
      .populate('teamMembers', 'firstName lastName email')

    if (!sprint) {
      return NextResponse.json(
        { error: 'Sprint not found' },
        { status: 404 }
      )
    }

    if (!hasSprintViewAll) {
      const projectId = typeof sprint.project === 'object' && sprint.project !== null
        ? (sprint.project as any)._id?.toString()
        : sprint.project?.toString?.()

      if (!projectId) {
        return NextResponse.json(
          { error: 'You do not have permission to view this sprint' },
          { status: 403 }
        )
      }

      const hasProjectAccess = await Project.exists({
        _id: projectId,
        organization: organizationId,
        'teamMembers.memberId': userId
      })

      if (!hasProjectAccess) {
        return NextResponse.json(
          { error: 'You do not have permission to view this sprint' },
          { status: 403 }
        )
      }
    }

    // Fetch all tasks that were ever in this sprint (from sprint's tasks array)
    // This includes tasks that may have been moved to another sprint
    const sprintTaskIds = sprint.tasks || []
    

    // Clean up any tasks in sprint.tasks that are now in backlog or have no sprint
    const backlogTasksInSprint = await Task.find({
      _id: { $in: sprintTaskIds },
      organization: organizationId,
      $or: [
        { status: 'backlog' },
        { sprint: null },
        { sprint: { $exists: false } }
      ]
    }).select('_id')

    if (backlogTasksInSprint.length > 0) {
      const backlogIds = backlogTasksInSprint.map(t => t._id)
      await Sprint.updateOne(
        { _id: sprint._id },
        { $pull: { tasks: { $in: backlogIds } } }
      )
      await Task.updateMany(
        { _id: { $in: backlogIds }, status: 'backlog' },
        { $set: { sprint: null } }
      )
    }

    const validSprintTaskIds = sprintTaskIds.filter((id: any) =>
      !backlogTasksInSprint.some((t: any) => t._id.toString() === id.toString())
    )

    const taskDocs = await Task.find({
      _id: { $in: validSprintTaskIds },
      organization: organizationId,
      status: { $ne: 'backlog' }
    })
      .sort({ createdAt: -1, _id: -1 })
      .select('title displayId status storyPoints estimatedHours actualHours priority type assignedTo archived subtasks sprint movedFromSprint story epic module startDate dueDate createdAt')
      .populate([
        { path: 'assignedTo.user', select: '_id firstName lastName email avatar' },
        { path: 'sprint', select: 'name _id' },
        { path: 'story', select: 'title' },
        { path: 'epic', select: 'title' }
      ])


    // Get current sprint tasks (tasks still assigned to this sprint)
    const currentSprintTaskIds = taskDocs
      .filter(task => task.sprint && task.sprint._id.toString() === sprintId)
      .map(task => task._id.toString())

    const tasks = taskDocs.map(task => {
      const taskObj = task.toObject()
      
      const isInCurrentSprint = taskObj.sprint && taskObj.sprint._id.toString() === sprintId
      const movedToSprint = !isInCurrentSprint && taskObj.sprint ? {
        _id: taskObj.sprint._id.toString(),
        name: taskObj.sprint.name
      } : null

      const processedTask = {
        _id: taskObj._id,
        title: taskObj.title,
        displayId: taskObj.displayId,
        status: taskObj.status,
        storyPoints: taskObj.storyPoints ?? 0,
        estimatedHours: taskObj.estimatedHours ?? 0,
        actualHours: taskObj.actualHours ?? 0,
        priority: taskObj.priority,
        type: taskObj.type,
        archived: taskObj.archived ?? false,
        subtasks: Array.isArray(taskObj.subtasks) ? taskObj.subtasks : [],
        assignedTo: taskObj.assignedTo,
        movedToSprint, // Indicates if task was moved to another sprint
        movedToBacklog: !taskObj.sprint && taskObj.movedFromSprint && taskObj.movedFromSprint.toString() === sprintId,
        story: taskObj.story ? { _id: taskObj.story._id, title: taskObj.story.title } : undefined,
        epic: taskObj.epic ? { _id: taskObj.epic._id, title: taskObj.epic.title } : undefined,
        module: taskObj.module || taskObj.story?.title || taskObj.epic?.title || '',
        startDate: taskObj.startDate,
        dueDate: taskObj.dueDate,
        createdAt: taskObj.createdAt
      }

      return processedTask
    })

   

    // Calculate progress from ALL tasks that were in this sprint (including moved ones)
    const totalTasks = tasks.length
    const completedTasks = tasks.filter(task => task.status === 'done' || task.status === 'completed').length
    const inProgressTasks = tasks.filter(task =>
      ['in_progress', 'review', 'testing'].includes(task.status)
    ).length
    const todoTasks = tasks.filter(task =>
      ['todo', 'backlog'].includes(task.status)
    ).length
    const blockedTasks = tasks.filter(task => task.status === 'blocked').length
    const cancelledTasks = tasks.filter(task => task.status === 'cancelled').length

    const totalStoryPoints = tasks.reduce((sum, task) => sum + (task.storyPoints || 0), 0)
    const storyPointsCompleted = tasks
      .filter(task => task.status === 'done' || task.status === 'completed')
      .reduce((sum, task) => sum + (task.storyPoints || 0), 0)

    const estimatedHours = tasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0)
    const actualHours = tasks.reduce((sum, task) => sum + (task.actualHours || 0), 0)

    const completionPercentage =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    const sprintData = sprint.toObject()

    return NextResponse.json({
      success: true,
      data: {
        ...sprintData,
        progress: {
          completionPercentage,
          tasksCompleted: completedTasks,
          totalTasks,
          storyPointsCompleted,
          totalStoryPoints,
          estimatedHours,
          actualHours
        },
        taskSummary: {
          total: totalTasks,
          completed: completedTasks,
          inProgress: inProgressTasks,
          todo: todoTasks,
          blocked: blockedTasks,
          cancelled: cancelledTasks
        },
        tasks
      }
    })

   
  } catch (error) {
    console.error('Get sprint error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const userId = user.id
    const organizationId = user.organization
    const sprintId = params.id

    const updateData = await request.json()

    // Update sprint by id only (visibility/auth policy relaxed for PUT by id)
    const existingSprint = await Sprint.findById(sprintId)

    if (!existingSprint) {
      return NextResponse.json(
        { error: 'Sprint not found or unauthorized' },
        { status: 404 }
      )
    }

    if (existingSprint.organization?.toString() !== organizationId.toString()) {
      return NextResponse.json(
        { error: 'Unauthorized to update this sprint' },
        { status: 403 }
      )
    }

    const sprintProjectId = existingSprint.project?.toString?.()
    const hasEditPermission = await PermissionService.hasAnyPermission(
      userId,
      [Permission.SPRINT_EDIT, Permission.SPRINT_UPDATE, Permission.SPRINT_MANAGE],
      sprintProjectId
    )
    const hasCreatePermission = await PermissionService.hasPermission(
      userId.toString(),
      Permission.SPRINT_CREATE,
      sprintProjectId
    )

    if (!hasEditPermission || !hasCreatePermission) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this sprint' },
        { status: 403 }
      )
    }

    const updatePayload: any = { ...updateData }
    if (Object.prototype.hasOwnProperty.call(updateData, 'teamMembers')) {
      updatePayload.teamMembers = Array.isArray(updateData.teamMembers)
        ? updateData.teamMembers
        : []
    }

    const sprint = await Sprint.findByIdAndUpdate(
      sprintId,
      updatePayload,
      { new: true }
    )
      .populate('project', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('teamMembers', 'firstName lastName email')

    if (!sprint) {
      return NextResponse.json(
        { error: 'Sprint not found or unauthorized' },
        { status: 404 }
      )
    }

    // Log activity: sprint updated (non-blocking)
    const sprintProjectName = (typeof sprint.project === 'object' && sprint.project !== null && 'name' in sprint.project)
      ? (sprint.project as any).name
      : 'Unknown Project'
    const logProjectId = (typeof sprint.project === 'object' && sprint.project !== null && '_id' in sprint.project)
      ? String((sprint.project as any)._id)
      : sprint.project ? String(sprint.project) : undefined

    // Determine specific action based on status changes
    let sprintAction: 'sprint_updated' | 'sprint_started' | 'sprint_completed' = 'sprint_updated'
    if (updateData.status) {
      if (updateData.status === 'active' && existingSprint.status !== 'active') {
        sprintAction = 'sprint_started'
      } else if (updateData.status === 'completed' && existingSprint.status !== 'completed') {
        sprintAction = 'sprint_completed'
      }
    }

    logActivity({
      organizationId: String(organizationId),
      userId: String(userId),
      action: sprintAction,
      entityType: 'sprint',
      entityId: String(sprintId),
      entityName: sprint.name,
      projectId: logProjectId,
      projectName: sprintProjectName,
      details: {
        changedFields: Object.keys(updateData),
        oldStatus: existingSprint.status,
        newStatus: updateData.status || existingSprint.status
      }
    }).catch(err => console.error('Failed to log sprint update activity:', err))

    // Log task additions/removals if tasks array changed
    if (updateData.tasks && Array.isArray(updateData.tasks)) {
      const oldTaskIds = (existingSprint.tasks || []).map((t: any) => String(t))
      const newTaskIds = updateData.tasks.map((t: any) => String(t))
      const addedTasks = newTaskIds.filter((id: string) => !oldTaskIds.includes(id))
      const removedTasks = oldTaskIds.filter((id: string) => !newTaskIds.includes(id))

      addedTasks.forEach((taskId: string) => {
        logActivity({
          organizationId: String(organizationId),
          userId: String(userId),
          action: 'sprint_task_added',
          entityType: 'sprint',
          entityId: String(sprintId),
          entityName: sprint.name,
          projectId: logProjectId,
          projectName: sprintProjectName,
          details: { taskId }
        }).catch(err => console.error('Failed to log sprint task add activity:', err))
      })

      removedTasks.forEach((taskId: string) => {
        logActivity({
          organizationId: String(organizationId),
          userId: String(userId),
          action: 'sprint_task_removed',
          entityType: 'sprint',
          entityId: String(sprintId),
          entityName: sprint.name,
          projectId: logProjectId,
          projectName: sprintProjectName,
          details: { taskId }
        }).catch(err => console.error('Failed to log sprint task remove activity:', err))
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Sprint updated successfully',
      data: sprint
    })

  } catch (error) {
    console.error('Update sprint error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const userId = user.id
    const organizationId = user.organization
    const sprintId = params.id

    const sprint = await Sprint.findById(sprintId)

    if (!sprint) {
      return NextResponse.json(
        { error: 'Sprint not found or unauthorized' },
        { status: 404 }
      )
    }

    if (sprint.organization?.toString() !== organizationId.toString()) {
      return NextResponse.json(
        { error: 'Unauthorized to delete this sprint' },
        { status: 403 }
      )
    }

    const sprintProjectId = sprint.project?.toString?.()
    const canDeleteSprint = await PermissionService.hasPermission(
      userId.toString(),
      Permission.SPRINT_DELETE,
      sprintProjectId
    )

    if (!canDeleteSprint) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this sprint' },
        { status: 403 }
      )
    }

    await Sprint.findByIdAndDelete(sprintId)

    return NextResponse.json({
      success: true,
      message: 'Sprint deleted successfully'
    })

  } catch (error) {
    console.error('Delete sprint error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
