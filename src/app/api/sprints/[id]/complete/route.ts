import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'
import { Story } from '@/models/Story'
import { CompletionService } from '@/lib/completion-service'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

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
    const userId = user.id
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

    const sprintProjectId = sprint.project?.toString?.()
    const canCompleteSprint = await PermissionService.hasPermission(
      userId,
      Permission.SPRINT_COMPLETE,
      sprintProjectId
    )

    if (!canCompleteSprint) {
      return NextResponse.json(
        { error: 'You do not have permission to complete this sprint' },
        { status: 403 }
      )
    }

    const activeTaskCount = await Task.countDocuments({
      sprint: sprintId,
      archived: { $ne: true }
    })

    if (activeTaskCount === 0) {
      return NextResponse.json(
        { error: 'Add tasks to this sprint before completing it' },
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

    // Subtask validation logic removed as per requirements to allow free movement to backlog

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
          { 
            sprint: null, 
            status: 'backlog',
            movedFromSprint: sprintId
          }
        )
        
        // Note: We DO NOT remove tasks from the sprint's tasks array when moving to backlog.
        // This is to preserve the history of what was in the sprint, even if it wasn't completed.

      }
    }

    const completedTaskFilter = {
      sprint: sprintId,
      archived: { $ne: true },
      status: { $in: ['done', 'completed'] }
    }

    const completedTasks = await Task.find(completedTaskFilter).select('_id epic story')
    const completedTaskIds = completedTasks.map(task => task._id)

    // Also get completed stories from this sprint
    const completedStories = await Story.find({
      sprint: sprintId,
      archived: { $ne: true },
      status: { $in: ['done', 'completed'] }
    }).select('_id epic')

    if (completedTaskIds.length > 0) {
      await Task.updateMany(
        { _id: { $in: completedTaskIds } },
        { archived: true }
      )
      // DO NOT remove completed tasks from sprint's tasks array - keep history for display
    }

    // Check epic and story completion for all completed tasks and stories
    try {
      // Check completion for completed tasks
      for (const task of completedTasks) {
        // Check story completion if task belongs to a story
        if (task.story) {
          await CompletionService.checkStoryCompletion(task.story.toString())
        }
        
        // Check epic completion if task belongs to an epic
        if (task.epic) {
          await CompletionService.checkEpicCompletion(task.epic.toString())
        }
      }

      // Check completion for completed stories
      for (const story of completedStories) {
        // Check epic completion if story belongs to an epic
        if (story.epic) {
          await CompletionService.checkEpicCompletion(story.epic.toString())
        }
      }
    } catch (completionError) {
      console.error('Error checking completion during sprint completion:', completionError)
      // Don't fail the sprint completion if completion checks fail
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

