import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'
import { authenticateUser } from '@/lib/auth-utils'

export async function POST(
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
    const organizationId = user.organization
    const sprintId = params.id

    if (!sprintId) {
      return NextResponse.json(
        { error: 'Sprint ID is required' },
        { status: 400 }
      )
    }

    const sprint = await Sprint.findById(sprintId)
    if (!sprint) {
      return NextResponse.json(
        { error: 'Sprint not found' },
        { status: 404 }
      )
    }

    if (!sprint.organization) {
      console.warn('[Sprint Complete] Sprint missing organization, assigning current org', { sprintId })
      sprint.organization = organizationId
      await sprint.save()
    } else if (sprint.organization.toString() !== organizationId.toString()) {
      return NextResponse.json(
        { error: 'Unauthorized to complete this sprint' },
        { status: 403 }
      )
    }

    if (sprint.status !== 'active') {
      return NextResponse.json(
        { error: 'Only active sprints can be completed' },
        { status: 400 }
      )
    }

    let payload: { targetSprintId?: string } | null = null
    try {
      payload = await request.json()
    } catch {
      payload = null
    }

    let targetSprintId = payload?.targetSprintId
    let targetSprint = null

    if (targetSprintId) {
      targetSprint = await Sprint.findById(targetSprintId)

      if (!targetSprint) {
        return NextResponse.json(
          { error: 'Target sprint not found' },
          { status: 404 }
        )
      }

      if (!targetSprint.organization) {
        targetSprint.organization = organizationId
        await targetSprint.save()
      } else if (targetSprint.organization.toString() !== organizationId.toString()) {
        return NextResponse.json(
          { error: 'Unauthorized to move tasks to this sprint' },
          { status: 403 }
        )
      }

      if (['completed', 'cancelled'].includes(targetSprint.status)) {
        return NextResponse.json(
          { error: 'Cannot move tasks into a completed or cancelled sprint' },
          { status: 400 }
        )
      }

      if (targetSprint._id.toString() === sprintId) {
        targetSprintId = undefined
        targetSprint = null
      }
    }

    sprint.status = 'completed'
    sprint.actualEndDate = new Date()
    await sprint.save()

    const incompleteTaskFilter = {
      sprint: sprintId,
      archived: { $ne: true },
      status: { $nin: ['done', 'cancelled', 'completed'] }
    }

    const incompleteTasks = await Task.find(incompleteTaskFilter).select('_id')
    const incompleteTaskIds = incompleteTasks.map(task => task._id)

    if (incompleteTaskIds.length > 0) {
      if (targetSprintId) {
        await Task.updateMany(
          { _id: { $in: incompleteTaskIds } },
          { sprint: targetSprintId, status: 'todo' }
        )

        await Sprint.findByIdAndUpdate(
          targetSprintId,
          { $addToSet: { tasks: { $each: incompleteTaskIds } } }
        )
      } else {
        await Task.updateMany(
          { _id: { $in: incompleteTaskIds } },
          { sprint: undefined, status: 'backlog' }
        )
      }

      await Sprint.findByIdAndUpdate(
        sprintId,
        { $pull: { tasks: { $in: incompleteTaskIds } } }
      )
    }

    const completedTaskFilter = {
      sprint: sprintId,
      archived: { $ne: true },
      status: { $in: ['done', 'completed'] }
    }

    const completedTasks = await Task.find(completedTaskFilter).select('_id')
    const completedTaskIds = completedTasks.map(task => task._id)

    if (completedTaskIds.length > 0) {
      await Task.updateMany(
        { _id: { $in: completedTaskIds } },
        { archived: true }
      )

      await Sprint.findByIdAndUpdate(
        sprintId,
        { $pull: { tasks: { $in: completedTaskIds } } }
      )
    }

    const updatedSprint = await Sprint.findById(sprintId)
      .populate('project', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('teamMembers', 'firstName lastName email')

    return NextResponse.json({
      success: true,
      message: 'Sprint completed successfully',
      data: updatedSprint
    })
  } catch (error) {
    console.error('Complete sprint error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

