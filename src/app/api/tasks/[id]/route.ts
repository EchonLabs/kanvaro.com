import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import { Task, TASK_STATUS_VALUES, TaskStatus } from '@/models/Task'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { Sprint } from '@/models/Sprint'
import { authenticateUser } from '@/lib/auth-utils'
import { CompletionService } from '@/lib/completion-service'
import { notificationService } from '@/lib/notification-service'
import { invalidateCache } from '@/lib/redis'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

const TASK_STATUS_SET = new Set<TaskStatus>(TASK_STATUS_VALUES)

// Type definitions for lean query results
interface LeanTask {
  _id: any
  title: string
  description?: string
  status: string
  priority?: string
  type?: string
  project?: {
    _id?: any
    name?: string
  } | any
  assignedTo?: {
    _id?: any
    firstName?: string
    lastName?: string
    email?: string
  } | any
  createdBy?: {
    _id?: any
    firstName?: string
    lastName?: string
    email?: string
  } | any
  story?: {
    _id?: any
    title?: string
    status?: string
  } | any
  sprint?: {
    _id?: any
    name?: string
    status?: string
    startDate?: Date | string
    endDate?: Date | string
    teamMembers?: any[]
  } | any
  parentTask?: {
    _id?: any
    title?: string
  } | any
  taskNumber?: number
  displayId?: string
  storyPoints?: number
  dueDate?: Date | string
  estimatedHours?: number
  actualHours?: number
  labels?: string[]
  subtasks?: any[]
  position?: number
  createdAt?: Date | string
  updatedAt?: Date | string
  [key: string]: any
}

interface LeanSprint {
  _id?: any
  project?: {
    _id?: any
    name?: string
  } | any
  name?: string
  status?: string
  [key: string]: any
}

interface LeanProject {
  _id?: any
  name?: string
  [key: string]: any
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

function sanitizeAttachments(
  input: any,
  defaultUserId: string
): Array<{
  name: string
  url: string
  size: number
  type: string
  uploadedBy: mongoose.Types.ObjectId
  uploadedAt: Date
}> {
  if (!Array.isArray(input)) {
    return []
  }

  const fallbackUserObjectId = defaultUserId ? new mongoose.Types.ObjectId(defaultUserId) : undefined

  return input
    .filter((item: any) => typeof item?.name === 'string' && item.name.trim().length > 0 && typeof item?.url === 'string' && item.url.trim().length > 0)
    .map((item: any) => {
      const uploadedByIdRaw =
        typeof item.uploadedBy === 'string'
          ? item.uploadedBy
          : typeof item.uploadedBy?._id === 'string'
            ? item.uploadedBy._id
            : undefined

      const uploadedBy = uploadedByIdRaw
        ? new mongoose.Types.ObjectId(uploadedByIdRaw)
        : fallbackUserObjectId

      return {
        name: item.name.trim(),
        url: item.url.trim(),
        size: typeof item.size === 'number' ? item.size : 0,
        type: typeof item.type === 'string' ? item.type.trim() : 'application/octet-stream',
        uploadedBy: uploadedBy || fallbackUserObjectId || new mongoose.Types.ObjectId(defaultUserId),
        uploadedAt: item.uploadedAt ? new Date(item.uploadedAt) : new Date()
      }
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

    // Check if user has permission to view all tasks
    const [hasTaskViewAll, hasProjectViewAll] = await Promise.all([
      PermissionService.hasPermission(userId, Permission.TASK_VIEW_ALL),
      PermissionService.hasPermission(userId, Permission.PROJECT_VIEW_ALL)
    ]);

    // Build query - if user has TASK_VIEW_ALL or PROJECT_VIEW_ALL, they can view any task
    const taskQuery: any = {
      _id: taskId,
      organization: organizationId
    };
    
    if (!hasTaskViewAll && !hasProjectViewAll) {
      taskQuery.$or = [
        { 'assignedTo.user': userId },
        { createdBy: userId }
      ];
    }

    const task = await Task.findOne(taskQuery)
      .populate([
        { path: 'project', select: '_id name' },
        { path: 'assignedTo.user', select: '_id firstName lastName email' },
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'comments.author', select: 'firstName lastName email' },
        { path: 'comments.linkedIssues', select: 'displayId title', options: { strictPopulate: false } },
        {
          path: 'story',
          select: 'title status epic',
          populate: {
            path: 'epic',
            select: 'title status'
          }
        },
        { path: 'sprint', select: 'name status startDate endDate' },
        { path: 'parentTask', select: 'title' },
        { path: 'attachments.uploadedBy', select: 'firstName lastName email' }
      ])

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
    console.log('[Task PUT] Connected to DB', { taskId: params?.id })

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
    console.log('[Task PUT] Incoming payload', {
      taskId,
      receivedKeys: Object.keys(updateData)
    })

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

    if (Object.prototype.hasOwnProperty.call(updateData, 'attachments')) {
      updateData.attachments = sanitizeAttachments(updateData.attachments, userId)
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'isBillable')) {
      updateData.isBillable = !!updateData.isBillable
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
      if (Array.isArray(updateData.assignedTo)) {
        // Handle new format: array of objects with user and hourlyRate
        updateData.assignedTo = updateData.assignedTo
          .filter((item: any) => {
            if (typeof item === 'object' && item !== null && item.user) {
              return true
            }
            // Handle legacy format: array of strings
            return typeof item === 'string' && item.trim().length > 0
          })
          .map((item: any) => {
            if (typeof item === 'object' && item.user) {
              // New format with user object and additional details
              return {
                user: typeof item.user === 'string' ? item.user.trim() : String(item.user),
                firstName: typeof item.firstName === 'string' ? item.firstName.trim() : undefined,
                lastName: typeof item.lastName === 'string' ? item.lastName.trim() : undefined,
                email: typeof item.email === 'string' ? item.email.trim() : undefined,
                hourlyRate: typeof item.hourlyRate === 'number' && item.hourlyRate >= 0 ? item.hourlyRate : undefined
              }
            } else {
              // Legacy format: direct string ID
              return {
                user: typeof item === 'string' ? item.trim() : String(item),
                hourlyRate: undefined
              }
            }
          })
      } else if (typeof updateData.assignedTo === 'string') {
        // Handle legacy single string input
        const trimmed = updateData.assignedTo.trim()
        updateData.assignedTo = trimmed.length > 0 ? [{ user: trimmed, hourlyRate: undefined }] : []
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

    if (Object.prototype.hasOwnProperty.call(updateData, 'epic')) {
      if (typeof updateData.epic === 'string') {
        const trimmed = updateData.epic.trim()
        updateData.epic = trimmed.length > 0 ? trimmed : undefined
      }
    }

    // Normalize sprint field - handle null, undefined, empty string
    if (Object.prototype.hasOwnProperty.call(updateData, 'sprint')) {
      if (updateData.sprint === null || updateData.sprint === undefined || updateData.sprint === '') {
        updateData.sprint = null
      } else if (typeof updateData.sprint === 'string') {
        const trimmed = updateData.sprint.trim()
        updateData.sprint = trimmed.length > 0 ? trimmed : null
      }
    }

    // Check if user has permission to edit all tasks
    const [hasTaskEditAll, hasProjectViewAll] = await Promise.all([
      PermissionService.hasPermission(userId, Permission.TASK_EDIT_ALL),
      PermissionService.hasPermission(userId, Permission.PROJECT_VIEW_ALL)
    ]);

    // Build query - if user has TASK_EDIT_ALL or PROJECT_VIEW_ALL, they can edit any task
    const taskQuery: any = {
      _id: taskId,
      organization: organizationId
    };
    
    if (!hasTaskEditAll && !hasProjectViewAll) {
      taskQuery.$or = [
        { 'assignedTo.user': userId },
        { createdBy: userId }
      ];
    }

    const currentTask = await Task.findOne(taskQuery)
    if (!currentTask) {
      console.warn('[Task PUT] Task not found or unauthorized', { taskId, userId })
    } else {
      console.log('[Task PUT] Current task loaded', {
        taskId,
        currentStatus: currentTask.status,
        currentSprint: currentTask.sprint
      })
    }

    // If status is changing, set position to end of target column
    if (updateData.status && updateData.status !== currentTask.status) {
      const maxPosition = await Task.findOne(
        { project: currentTask.project, status: updateData.status },
        { position: 1 }
      ).sort({ position: -1 })
      updateData.position = maxPosition ? maxPosition.position + 1 : 0
    }

    if (!currentTask) {
      console.warn('[Task PUT] Task not found or unauthorized on update', { taskId, userId })
      return NextResponse.json(
        { error: 'Task not found or unauthorized' },
        { status: 404 }
      )
    }

    // When adding task to sprint, only change status to 'todo' if currently 'backlog'
    if (Object.prototype.hasOwnProperty.call(updateData, 'sprint') && updateData.sprint) {
      if (Object.prototype.hasOwnProperty.call(updateData, 'status')) {
        // Only apply status change if current status is 'backlog'
        if (currentTask.status !== 'backlog' && updateData.status === 'todo') {
          delete updateData.status // Don't change status if not backlog
        }
      }
    }

    // If task status is changing to 'todo', update all sub-tasks to 'todo'
    if (updateData.status === 'todo' && currentTask.status !== 'todo') {
      // Use existing subtasks from currentTask if subtasks are not being updated in this request
      const subtasksToUpdate = Object.prototype.hasOwnProperty.call(updateData, 'subtasks')
        ? sanitizeSubtasks(updateData.subtasks)
        : (currentTask.subtasks && Array.isArray(currentTask.subtasks) ? currentTask.subtasks : [])
      
      if (subtasksToUpdate.length > 0) {
        const updatedSubtasks = subtasksToUpdate.map((subtask: any) => ({
          _id: subtask._id,
          title: subtask.title || '',
          description: subtask.description,
          status: 'todo' as TaskStatus,
          isCompleted: false
        }))
        updateData.subtasks = updatedSubtasks
      }
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
    // Use lean() for faster query - returns plain object instead of Mongoose document
    const updateQuery: any = {
      _id: taskId,
      organization: organizationId
    };
    
    if (!hasTaskEditAll && !hasProjectViewAll) {
      updateQuery.$or = [
        { 'assignedTo.user': userId },
        { createdBy: userId }
      ];
    }

    const taskResult = await Task.findOneAndUpdate(
      updateQuery,
      { ...updateData, updatedAt: new Date() },
      { new: true }
    )
      .populate([
        { path: 'project', select: '_id name' },
        { path: 'assignedTo.user', select: '_id firstName lastName email' },
        { path: 'createdBy', select: 'firstName lastName email' },
        {
          path: 'story',
          select: 'title status epic',
          populate: {
            path: 'epic',
            select: 'title status'
          }
        },
        { path: 'sprint', select: 'name status startDate endDate teamMembers' },
        { path: 'parentTask', select: 'title' },
        { path: 'attachments.uploadedBy', select: 'firstName lastName email' }
      ])
      .lean()

    if (!taskResult) {
      return NextResponse.json(
        { error: 'Task not found or unauthorized' },
        { status: 404 }
      )
    }

    // Type assertion: findOneAndUpdate always returns a single document or null, never an array
    const taskResultTyped = Array.isArray(taskResult) ? taskResult[0] : taskResult
    if (!taskResultTyped) {
      return NextResponse.json(
        { error: 'Task not found or unauthorized' },
        { status: 404 }
      )
    }

    // Cast to LeanTask type for type safety (using unknown first to avoid type errors)
    const task: LeanTask = taskResultTyped as unknown as LeanTask

    // Prepare response immediately
    const responseData = {
      success: true,
      message: 'Task updated successfully',
      data: task
    }

    // Run async operations in background without blocking response
    const taskIdStr = String(task._id || taskId)
    const taskProjectId = (typeof task.project === 'object' && task.project !== null && '_id' in task.project)
      ? task.project._id
      : task.project
    
    setImmediate(async () => {
      try {
        // Synchronize sprint tasks array if sprint changed
        if (Object.prototype.hasOwnProperty.call(updateData, 'sprint')) {
          // Normalize newSprintId - null/undefined/empty means moving to backlog
          const newSprintId = (updateData.sprint === null || updateData.sprint === undefined || updateData.sprint === '') 
            ? null 
            : updateData.sprint
          const oldSprintId = currentTask.sprint

          const updates: Promise<unknown>[] = []

          // Get old sprint ID as string for comparison
          const oldSprintIdStr = oldSprintId 
            ? (typeof oldSprintId === 'object' && oldSprintId !== null && '_id' in oldSprintId
                ? String(oldSprintId._id)
                : String(oldSprintId))
            : null
          
          // Get new sprint ID as string for comparison
          const newSprintIdStr = newSprintId ? String(newSprintId) : null

          // Remove task from old sprint if it exists and is different from new sprint
          if (oldSprintIdStr && oldSprintIdStr !== newSprintIdStr) {
            updates.push(
              Sprint.findByIdAndUpdate(
                oldSprintIdStr,
                { $pull: { tasks: taskIdStr } },
                { new: false }
              ).exec().catch(error => {
                console.error('Failed to remove task from previous sprint:', error)
              })
            )
          }

          // Add task to new sprint if provided (not null/undefined/empty)
          if (newSprintIdStr) {
            const sprintDocResult = await Sprint.findById(newSprintIdStr).select('_id project').lean()
            const sprintDocResultTyped = Array.isArray(sprintDocResult) ? sprintDocResult[0] : sprintDocResult
            if (sprintDocResultTyped) {
              const sprintDoc: LeanSprint = sprintDocResultTyped as LeanSprint
              const sprintProjectId = (typeof sprintDoc.project === 'object' && sprintDoc.project !== null && '_id' in sprintDoc.project)
                ? sprintDoc.project._id
                : sprintDoc.project
              if (sprintProjectId && sprintProjectId.toString() !== taskProjectId?.toString()) {
                console.warn(
                  `Task ${taskId} assigned to different project sprint. Task project: ${taskProjectId}, Sprint project: ${sprintProjectId}`
                )
              }
              updates.push(
                Sprint.findByIdAndUpdate(
                  newSprintIdStr,
                  { $addToSet: { tasks: taskIdStr } },
                  { new: false }
                ).exec().catch(error => {
                  console.error('Failed to add task to sprint:', error)
                })
              )
            } else {
              console.warn(`Sprint ${newSprintIdStr} not found when updating task ${taskId}`)
            }
          }

          if (updates.length > 0) {
            await Promise.allSettled(updates)
          }
        }

        // Invalidate tasks cache for this organization (non-blocking)
        invalidateCache(`tasks:*:org:${organizationId}:*`).catch(error => {
          console.error('Failed to invalidate cache:', error)
        })

        // Check if task status changed to 'done' and trigger completion logic
        if (updateData.status === 'done' && currentTask.status !== 'done') {
          CompletionService.handleTaskStatusChange(taskId).catch(error => {
            console.error('Error in completion service:', error)
          })
        }

        // Check if task with epic is being added to sprint - update epic to in_progress
        if (Object.prototype.hasOwnProperty.call(updateData, 'sprint') && updateData.sprint && task.epic) {
          CompletionService.updateEpicStatusOnTaskAddedToSprint(taskId).catch(error => {
            console.error('Error updating epic status on sprint assignment:', error)
          })
        }

        // Send notifications for important changes (non-blocking)
        const notificationPromises: Promise<unknown>[] = []
        
        // Notify if task was assigned to someone new
        const currentAssignedToIds = Array.isArray(currentTask.assignedTo)
          ? currentTask.assignedTo.map((item: any) => {
              if (typeof item === 'object' && item.user) {
                return typeof item.user === 'object' ? item.user._id?.toString() : item.user.toString()
              }
              return item.toString()
            })
          : currentTask.assignedTo ? [currentTask.assignedTo.toString()] : []
        const newAssignedToIds = Array.isArray(updateData.assignedTo)
          ? updateData.assignedTo.map((item: any) => {
              if (typeof item === 'object' && item.user) {
                return typeof item.user === 'object' ? item.user._id?.toString() : item.user.toString()
              }
              return item.toString()
            })
          : []

        const assignedUsersChanged = JSON.stringify(currentAssignedToIds.sort()) !== JSON.stringify(newAssignedToIds.sort())

        if (assignedUsersChanged && newAssignedToIds.length > 0) {
          // Find newly assigned users (users in newAssignedToIds but not in currentAssignedToIds)
          const newlyAssignedUsers = newAssignedToIds.filter(id => !currentAssignedToIds.includes(id))

          newlyAssignedUsers.forEach(userId => {
            notificationPromises.push(
              Project.findById(taskProjectId).select('name').lean().then(projectResult => {
                const projectResultTyped = Array.isArray(projectResult) ? projectResult[0] : projectResult
                const project: LeanProject = projectResultTyped as LeanProject
                return notificationService.notifyTaskUpdate(
                  taskIdStr,
                  'assigned',
                  userId,
                  organizationId,
                  task.title,
                  project?.name
                )
              }).catch(error => {
                console.error('Failed to send assignment notification:', error)
              })
            )
          })
        }

        // Notify if task was completed
        if (updateData.status === 'done' && currentTask.status !== 'done') {
          notificationPromises.push(
            Project.findById(taskProjectId).select('name').lean().then(projectResult => {
              const projectResultTyped = Array.isArray(projectResult) ? projectResult[0] : projectResult
              const project: LeanProject = projectResultTyped as LeanProject
              // Notify the task creator if different from the one who completed it
              const createdBy = task.createdBy
              const createdById = (typeof createdBy === 'object' && createdBy !== null && '_id' in createdBy)
                ? createdBy._id
                : createdBy
              if (createdById && String(createdById) !== userId) {
                return notificationService.notifyTaskUpdate(
                  taskIdStr,
                  'completed',
                  String(createdById),
                  organizationId,
                  task.title,
                  project?.name
                )
              }
            }).catch(error => {
              console.error('Failed to send completion notification:', error)
            })
          )
        }

        // Notify assignees if task was updated (but not by them)
        const currentAssignees = Array.isArray(currentTask.assignedTo)
          ? currentTask.assignedTo.map((id: any) => id.toString())
          : currentTask.assignedTo ? [currentTask.assignedTo.toString()] : []

        currentAssignees.forEach((assigneeId: string) => {
          if (assigneeId !== userId) {
            notificationPromises.push(
              Project.findById(taskProjectId).select('name').lean().then(projectResult => {
                const projectResultTyped = Array.isArray(projectResult) ? projectResult[0] : projectResult
                const project: LeanProject = projectResultTyped as LeanProject
                return notificationService.notifyTaskUpdate(
                  taskIdStr,
                  'updated',
                  assigneeId,
                  organizationId,
                  task.title,
                  project?.name
                )
              }).catch(error => {
                console.error('Failed to send update notification:', error)
              })
            )
          }
        })

        // Wait for all notifications to complete (but don't block response)
        await Promise.allSettled(notificationPromises)
      } catch (error) {
        console.error('Error in background task update operations:', error)
      }
    })

    console.log('[Task PUT] Task updated successfully', {
      taskId,
      newStatus: task.status,
      sprint: (typeof task.sprint === 'object' && task.sprint !== null && '_id' in task.sprint)
        ? task.sprint._id
        : task.sprint
    })

    return NextResponse.json(responseData)

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

    // Check if user has permission to delete all tasks
    const [hasTaskDeleteAll, hasProjectViewAll] = await Promise.all([
      PermissionService.hasPermission(userId, Permission.TASK_DELETE_ALL),
      PermissionService.hasPermission(userId, Permission.PROJECT_VIEW_ALL)
    ]);

    // Build query - if user has TASK_DELETE_ALL or PROJECT_VIEW_ALL, they can delete any task
    const deleteQuery: any = {
      _id: taskId,
      organization: organizationId
    };
    
    if (!hasTaskDeleteAll && !hasProjectViewAll) {
      deleteQuery.createdBy = userId;
    }

    const task = await Task.findOneAndDelete(deleteQuery)

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found or unauthorized' },
        { status: 404 }
      )
    }

    // Invalidate tasks cache for this organization (non-blocking)
    // Don't await to avoid blocking the response
    invalidateCache(`tasks:*:org:${organizationId}:*`).catch(error => {
      console.error('Cache invalidation error:', error)
      // Silently fail - cache will expire naturally
    })

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
