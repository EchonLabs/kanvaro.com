'use server'

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { Task } from '@/models/Task'
import { notificationService } from '@/lib/notification-service'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import mongoose from 'mongoose'

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
    const userId = user.id
    const organizationId = user.organization
    const taskId = params.id

    const payload = await request.json()
    const content = typeof payload.content === 'string' ? payload.content.trim() : ''
    if (!content) {
      return NextResponse.json(
        { error: 'Comment content is required' },
        { status: 400 }
      )
    }

    const mentions: string[] = Array.isArray(payload.mentions) ? payload.mentions.filter((id: any) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) : []
    const linkedIssues: string[] = Array.isArray(payload.linkedIssues) ? payload.linkedIssues.filter((id: any) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) : []

    // Fetch minimal task data for permissions/notifications
    const task = await Task.findById(taskId)
      .select('organization project assignedTo createdBy title displayId')

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    // If organization is present on both, ensure they match; otherwise allow
    if (task.organization && organizationId && task.organization.toString() !== organizationId.toString()) {
      return NextResponse.json(
        { error: 'Access denied to task' },
        { status: 403 }
      )
    }

    // Permission checks: allow if user has view-all/project-all, task view, or is assignee/creator
    const [canTaskViewAll, canProjectViewAll, canTaskView] = await Promise.all([
      PermissionService.hasPermission(userId, Permission.TASK_VIEW_ALL),
      PermissionService.hasPermission(userId, Permission.PROJECT_VIEW_ALL),
      PermissionService.hasPermission(userId, Permission.TASK_UPDATE, taskId) // using TASK_UPDATE as a fallback view check
    ])
    const isAssignee = task.assignedTo && task.assignedTo.toString() === userId
    const isCreator = task.createdBy && task.createdBy.toString() === userId

    if (!canTaskViewAll && !canProjectViewAll && !canTaskView && !isAssignee && !isCreator) {
      return NextResponse.json(
        { error: 'Insufficient permissions to comment on this task' },
        { status: 403 }
      )
    }

    const commentId = new mongoose.Types.ObjectId()
    const now = new Date()
    const comment = {
      _id: commentId,
      content,
      author: new mongoose.Types.ObjectId(userId),
      mentions: mentions.map(id => new mongoose.Types.ObjectId(id)),
      linkedIssues: linkedIssues.map(id => new mongoose.Types.ObjectId(id)),
      createdAt: now
    }

    // Push comment without loading entire comments array
    await Task.updateOne(
      { _id: taskId },
      { $push: { comments: comment } }
    )

    // Prepare notification recipients: mentioned users + assignee (if exists and not same)
    const notifyUserIds = new Set<string>()
    mentions.forEach(id => notifyUserIds.add(id))
    if (task.assignedTo && task.assignedTo.toString() !== userId) {
      notifyUserIds.add(task.assignedTo.toString())
    }
    notifyUserIds.delete(userId) // do not notify self

    if (notifyUserIds.size > 0) {
      const url = task.displayId ? `/tasks/${taskId}` : `/tasks/${taskId}`
      await notificationService.createBulkNotifications(
        Array.from(notifyUserIds),
        organizationId,
        {
          type: 'task',
          title: 'New task comment',
          message: `New comment on task ${task.displayId || task.title || 'task'}`,
          data: {
            entityType: 'task',
            entityId: taskId,
            action: 'updated',
            url
          },
          sendEmail: true,
          sendPush: false
        }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        _id: commentId.toString(),
        content: comment.content,
        author: userId,
        mentions,
        linkedIssues,
        createdAt: now
      }
    })
  } catch (error) {
    console.error('Create comment error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

