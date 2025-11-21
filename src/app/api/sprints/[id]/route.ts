import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'
import { authenticateUser } from '@/lib/auth-utils'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
        console.log('GET sprints');

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

    // Fetch sprint by id only (visibility/auth policy relaxed for GET by id)
    const sprint = await Sprint.findById(sprintId)
      .populate('project', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('teamMembers', 'firstName lastName email')

    if (!sprint) {
      return NextResponse.json(
        { error: 'Sprint not found' },
        { status: 404 }
      )
    }

    const taskDocs = await Task.find({
      sprint: sprintId,
      organization: organizationId
    })
      .select('title status storyPoints estimatedHours actualHours priority type assignedTo archived')
      .populate('assignedTo', 'firstName lastName email')

    const tasks = taskDocs.map(task => {
      const taskObj = task.toObject()
      return {
        _id: taskObj._id,
        title: taskObj.title,
        status: taskObj.status,
        storyPoints: taskObj.storyPoints ?? 0,
        estimatedHours: taskObj.estimatedHours ?? 0,
        actualHours: taskObj.actualHours ?? 0,
        priority: taskObj.priority,
        type: taskObj.type,
        archived: taskObj.archived ?? false,
        assignedTo: taskObj.assignedTo
          ? {
              _id: taskObj.assignedTo._id,
              firstName: taskObj.assignedTo.firstName,
              lastName: taskObj.assignedTo.lastName,
              email: taskObj.assignedTo.email
            }
          : null
      }
    })

    const totalTasks = tasks.length
    const completedTasks = tasks.filter(task => task.status === 'done').length
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
      .filter(task => task.status === 'done')
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

    // Delete sprint by id only (visibility/auth policy relaxed for DELETE by id)
    const sprint = await Sprint.findByIdAndDelete(sprintId)

    if (!sprint) {
      return NextResponse.json(
        { error: 'Sprint not found or unauthorized' },
        { status: 404 }
      )
    }

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
