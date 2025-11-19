import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Task, TASK_STATUS_VALUES, TaskStatus } from '@/models/Task'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { Sprint } from '@/models/Sprint'
import { authenticateUser } from '@/lib/auth-utils'
import { CompletionService } from '@/lib/completion-service'
import { notificationService } from '@/lib/notification-service'
import { invalidateCache } from '@/lib/redis'

const TASK_STATUS_SET = new Set<TaskStatus>(TASK_STATUS_VALUES)

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

type IncomingSubtask = {
  _id?: string
  title?: unknown
  description?: unknown
  status?: unknown
  isCompleted?: unknown
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
    const taskId = params.id

    // Find task where user is assigned or creator
    const task = await Task.findOne({
      _id: taskId,
      organization: organizationId,
      $or: [
        { assignedTo: userId },
        { createdBy: userId }
      ]
    })
      .populate('project', '_id name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate('story', 'title status')
      .populate('sprint', 'name status')
      .populate('parentTask', 'title')

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: task
    })

  } catch (error) {
    console.error('Get task error:', error)
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
    const taskId = params.id

    const rawUpdate = await request.json()
    const updateData: Record<string, any> = { ...rawUpdate }

    if (Object.prototype.hasOwnProperty.call(updateData, 'status')) {
      // Allow any string status to support custom kanban statuses per project
      // Validation should be done at the application level based on project settings
      if (typeof updateData.status !== 'string' || updateData.status.trim().length === 0) {
        delete updateData.status
      } else {
        updateData.status = updateData.status.trim()
      }
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'labels')) {
      updateData.labels = sanitizeLabels(updateData.labels)
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'subtasks')) {
      updateData.subtasks = sanitizeSubtasks(updateData.subtasks)
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'storyPoints')) {
      const value = updateData.storyPoints
      if (value === '' || value === null || typeof value === 'undefined') {
        updateData.storyPoints = undefined
      } else {
        const numeric = typeof value === 'number' ? value : Number(value)
        updateData.storyPoints = Number.isFinite(numeric) ? numeric : undefined
      }
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'estimatedHours')) {
      const value = updateData.estimatedHours
      if (value === '' || value === null || typeof value === 'undefined') {
        updateData.estimatedHours = undefined
      } else {
        const numeric = typeof value === 'number' ? value : Number(value)
        updateData.estimatedHours = Number.isFinite(numeric) ? numeric : undefined
      }
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'dueDate')) {
      const value = updateData.dueDate
      if (!value) {
        updateData.dueDate = undefined
      } else {
        updateData.dueDate = new Date(value)
      }
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'assignedTo')) {
      if (typeof updateData.assignedTo === 'string') {
        const trimmed = updateData.assignedTo.trim()
        updateData.assignedTo = trimmed.length > 0 ? trimmed : undefined
      }
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'parentTask')) {
      if (typeof updateData.parentTask === 'string') {
        const trimmed = updateData.parentTask.trim()
        updateData.parentTask = trimmed.length > 0 ? trimmed : undefined
      }
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'story')) {
      if (typeof updateData.story === 'string') {
        const trimmed = updateData.story.trim()
        updateData.story = trimmed.length > 0 ? trimmed : undefined
      }
    }

    // Add optimistic locking with version field
    const currentTask = await Task.findOne({
      _id: taskId,
      organization: organizationId,
      $or: [
        { assignedTo: userId },
        { createdBy: userId }
      ]
    })

    // If status is changing, set position to end of target column
    if (updateData.status && updateData.status !== currentTask.status) {
      const maxPosition = await Task.findOne(
        { project: currentTask.project, status: updateData.status },
        { position: 1 }
      ).sort({ position: -1 })
      updateData.position = maxPosition ? maxPosition.position + 1 : 0
    }

    if (!currentTask) {
      return NextResponse.json(
        { error: 'Task not found or unauthorized' },
        { status: 404 }
      )
    }

    // Check for concurrent modifications
    if (updateData.expectedVersion && currentTask.updatedAt.getTime() !== new Date(updateData.expectedVersion).getTime()) {
      return NextResponse.json(
        { 
          error: 'Task was modified by another user. Please refresh and try again.',
          conflict: true,
          currentVersion: currentTask.updatedAt.toISOString()
        },
        { status: 409 }
      )
    }

    // Find and update task with concurrency protection
    const task = await Task.findOneAndUpdate(
      {
        _id: taskId,
        organization: organizationId,
        $or: [
          { assignedTo: userId },
          { createdBy: userId }
        ]
      },
      { ...updateData, updatedAt: new Date() },
      { new: true }
    )
      .populate('project', '_id name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate('story', 'title status')
      .populate('sprint', 'name status startDate endDate teamMembers')
      .populate('parentTask', 'title')

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found or unauthorized' },
        { status: 404 }
      )
    }

    // Synchronize sprint tasks array if sprint changed
    if (Object.prototype.hasOwnProperty.call(updateData, 'sprint')) {
      const newSprintId = updateData.sprint
      const oldSprintId = currentTask.sprint

      const updates: Promise<unknown>[] = []

      if (oldSprintId && (!newSprintId || oldSprintId.toString() !== newSprintId)) {
        updates.push(
          Sprint.findByIdAndUpdate(
            oldSprintId,
            { $pull: { tasks: task._id } },
            { new: false }
          ).exec().catch(error => {
            console.error('Failed to remove task from previous sprint:', error)
          })
        )
      }

      if (newSprintId) {
        const sprintDoc = await Sprint.findById(newSprintId).select('_id project')
        if (sprintDoc) {
          if (sprintDoc.project.toString() !== task.project.toString()) {
            console.warn(
              `Task ${taskId} assigned to different project sprint. Task project: ${task.project}, Sprint project: ${sprintDoc.project}`
            )
          }
          updates.push(
            Sprint.findByIdAndUpdate(
              newSprintId,
              { $addToSet: { tasks: task._id } },
              { new: false }
            ).exec().catch(error => {
              console.error('Failed to add task to sprint:', error)
            })
          )
        } else {
          console.warn(`Sprint ${newSprintId} not found when updating task ${taskId}`)
        }
      }

      if (updates.length > 0) {
        await Promise.allSettled(updates)
      }
    }

    // Invalidate tasks cache for this organization
    await invalidateCache(`tasks:*:org:${organizationId}:*`)

    // Check if task status changed to 'done' and trigger completion logic
    if (updateData.status === 'done' && currentTask.status !== 'done') {
      // Run completion check asynchronously to avoid blocking the response
      setImmediate(() => {
        CompletionService.handleTaskStatusChange(taskId).catch(error => {
          console.error('Error in completion service:', error)
        })
      })
    }

    // Send notifications for important changes
    try {
      // Notify if task was assigned to someone new
      if (updateData.assignedTo && updateData.assignedTo !== currentTask.assignedTo?.toString()) {
        const project = await Project.findById(task.project).select('name')
        const updatedByUser = await User.findById(userId).select('firstName lastName')
        
        await notificationService.notifyTaskUpdate(
          taskId,
          'assigned',
          updateData.assignedTo,
          organizationId,
          task.title,
          project?.name
        )
      }

      // Notify if task was completed
      if (updateData.status === 'done' && currentTask.status !== 'done') {
        const project = await Project.findById(task.project).select('name')
        const completedByUser = await User.findById(userId).select('firstName lastName')
        
        // Notify the task creator if different from the one who completed it
        if (task.createdBy.toString() !== userId) {
          await notificationService.notifyTaskUpdate(
            taskId,
            'completed',
            task.createdBy.toString(),
            organizationId,
            task.title,
            project?.name
          )
        }
      }

      // Notify if task was updated (but not by the assignee)
      if (updateData.assignedTo && updateData.assignedTo !== userId) {
        const project = await Project.findById(task.project).select('name')
        const updatedByUser = await User.findById(userId).select('firstName lastName')
        
        await notificationService.notifyTaskUpdate(
          taskId,
          'updated',
          updateData.assignedTo,
          organizationId,
          task.title,
          project?.name
        )
      }
    } catch (notificationError) {
      console.error('Failed to send task update notifications:', notificationError)
      // Don't fail the task update if notification fails
    }

    return NextResponse.json({
      success: true,
      message: 'Task updated successfully',
      data: task
    })

  } catch (error) {
    console.error('Update task error:', error)
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
    const taskId = params.id

    // Find and delete task (only creator can delete)
    const task = await Task.findOneAndDelete({
      _id: taskId,
      organization: organizationId,
      createdBy: userId
    })

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found or unauthorized' },
        { status: 404 }
      )
    }

    // Invalidate tasks cache for this organization
    await invalidateCache(`tasks:*:org:${organizationId}:*`)

    return NextResponse.json({
      success: true,
      message: 'Task deleted successfully'
    })

  } catch (error) {
    console.error('Delete task error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
