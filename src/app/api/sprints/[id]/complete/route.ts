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

    let payload: { targetSprintId?: string; selectedTaskIds?: string[] } | null = null
    try {
      payload = await request.json()
    } catch {
      payload = null
    }

    let targetSprintId = payload?.targetSprintId
    const selectedTaskIds = payload?.selectedTaskIds || []
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

    // Only check for incomplete sub-tasks if there's NO target sprint to move tasks to
    // If there's a target sprint, allow completion and move tasks (with their incomplete sub-tasks) to the next sprint
    if (!targetSprintId) {
      const sprintTasks = await Task.find({
        sprint: sprintId,
        organization: organizationId,
        archived: { $ne: true }
      }).select('_id title subtasks')

      const tasksWithIncompleteSubtasks: Array<{ taskId: string; taskTitle: string; incompleteSubtasks: Array<{ title: string; status: string }> }> = []

      for (const task of sprintTasks) {
        if (task.subtasks && Array.isArray(task.subtasks) && task.subtasks.length > 0) {
          const incompleteSubtasks = task.subtasks.filter((subtask: any) => {
            const status = subtask.status || 'backlog'
            return status !== 'done' && status !== 'completed' && !subtask.isCompleted
          })

          if (incompleteSubtasks.length > 0) {
            tasksWithIncompleteSubtasks.push({
              taskId: task._id.toString(),
              taskTitle: task.title,
              incompleteSubtasks: incompleteSubtasks.map((subtask: any) => ({
                title: subtask.title || 'Untitled',
                status: subtask.status || 'backlog'
              }))
            })
          }
        }
      }

      if (tasksWithIncompleteSubtasks.length > 0) {
        return NextResponse.json(
          {
            error: 'Cannot complete sprint with incomplete sub-tasks. Please move tasks to another sprint or complete all sub-tasks.',
            incompleteSubtasks: tasksWithIncompleteSubtasks
          },
          { status: 400 }
        )
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
    const incompleteTaskIds = incompleteTasks.map(task => task._id.toString())

    if (incompleteTaskIds.length > 0) {
      // Determine which tasks to move to target sprint vs backlog
      let tasksToMoveToSprint: string[] = []
      let tasksToMoveToBacklog: string[] = []

      if (selectedTaskIds.length > 0) {
        // User selected specific tasks
        tasksToMoveToSprint = incompleteTaskIds.filter(id => selectedTaskIds.includes(id))
        tasksToMoveToBacklog = incompleteTaskIds.filter(id => !selectedTaskIds.includes(id))
      } else {
        // No selection provided - use old behavior (all tasks to target or all to backlog)
        if (targetSprintId) {
          tasksToMoveToSprint = incompleteTaskIds
        } else {
          tasksToMoveToBacklog = incompleteTaskIds
        }
      }

      // Move selected tasks to target sprint
      if (targetSprintId && tasksToMoveToSprint.length > 0) {
        await Task.updateMany(
          { _id: { $in: tasksToMoveToSprint } },
          { sprint: targetSprintId, status: 'todo' }
        )

        await Sprint.findByIdAndUpdate(
          targetSprintId,
          { $addToSet: { tasks: { $each: tasksToMoveToSprint } } }
        )
      }

      // Move unselected tasks to backlog
      if (tasksToMoveToBacklog.length > 0) {
        await Task.updateMany(
          { _id: { $in: tasksToMoveToBacklog } },
          { sprint: null, status: 'backlog' }
        )
        
        // Remove tasks from sprint's tasks array when moving to backlog
        await Sprint.findByIdAndUpdate(
          sprintId,
          { $pull: { tasks: { $in: tasksToMoveToBacklog } } }
        )
      }
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
      // DO NOT remove completed tasks from sprint's tasks array - keep history for display
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

