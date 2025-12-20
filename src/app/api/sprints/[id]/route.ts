import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

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

    // Build query - if user has SPRINT_VIEW_ALL, they can view any sprint
    const sprintQuery: any = { _id: sprintId };
    
    if (!hasSprintViewAll) {
      sprintQuery.createdBy = userId;
    }

    const sprint = await Sprint.findOne(sprintQuery)
      .populate('project', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('teamMembers', 'firstName lastName email')

    if (!sprint) {
      return NextResponse.json(
        { error: 'Sprint not found' },
        { status: 404 }
      )
    }

    // Fetch all tasks that were ever in this sprint (from sprint's tasks array)
    // This includes tasks that may have been moved to another sprint
    const sprintTaskIds = sprint.tasks || []
    

    const taskDocs = await Task.find({
      _id: { $in: sprintTaskIds },
      organization: organizationId
    })
      .select('title displayId status storyPoints estimatedHours actualHours priority type assignedTo archived subtasks sprint movedFromSprint')
      .populate([
        { path: 'assignedTo.user', select: '_id firstName lastName email' },
        { path: 'sprint', select: 'name _id' }
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
        movedToBacklog: !taskObj.sprint && taskObj.movedFromSprint && taskObj.movedFromSprint.toString() === sprintId
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
