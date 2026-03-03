'use server'

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { Task } from '@/models/Task'
import { notificationService } from '@/lib/notification-service'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import mongoose from 'mongoose'

const isValidObjectId = (val: unknown) =>
  typeof val === 'string' && mongoose.Types.ObjectId.isValid(val)

const buildMentionIds = (raw: unknown) =>
  Array.isArray(raw)
    ? raw.filter((id: any) => isValidObjectId(id)) as string[]
    : []

type CommentAttachmentInput = {
  name?: unknown
  url?: unknown
  size?: unknown
  type?: unknown
}

const sanitizeAttachments = (raw: unknown, userId: string) => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item: CommentAttachmentInput) => {
      if (typeof item?.name !== 'string' || typeof item?.url !== 'string') return null
      const sizeValue =
        typeof item.size === 'number'
          ? item.size
          : typeof item.size === 'string'
            ? Number(item.size)
            : undefined
      return {
        name: item.name,
        url: item.url,
        size: Number.isFinite(sizeValue) ? sizeValue : undefined,
        type: typeof item.type === 'string' ? item.type : undefined,
        uploadedBy: new mongoose.Types.ObjectId(userId),
        uploadedAt: new Date()
      }
    })
    .filter(Boolean) as Array<{
      name: string
      url: string
      size?: number
      type?: string
      uploadedBy: mongoose.Types.ObjectId
      uploadedAt: Date
    }>
}

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
    const parentCommentId = isValidObjectId(payload.parentCommentId) ? payload.parentCommentId : null
    if (!content) {
      return NextResponse.json(
        { error: 'Comment content is required' },
        { status: 400 }
      )
    }

    const mentions = buildMentionIds(payload.mentions)
    const linkedIssues = buildMentionIds(payload.linkedIssues)
    const attachments = sanitizeAttachments(payload.attachments, userId)

    // Fetch minimal task data for permissions/notifications (lean for speed)
    type LeanTask = {
      _id: any
      organization?: any
      project?: any
      assignedTo?: any
      createdBy?: any
      title?: string
      displayId?: string
      comments?: Array<{
        _id?: any
        author?: any
        parentCommentId?: any
      }>
    }

    const task = await Task.findById(taskId)
      .select('organization project assignedTo createdBy title displayId comments._id comments.author')
      .lean<LeanTask>()
      .exec()

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

    const [canTaskViewAll, canProjectViewAll, canTaskUpdate] = await Promise.all([
      PermissionService.hasPermission(userId, Permission.TASK_VIEW_ALL),
      PermissionService.hasPermission(userId, Permission.PROJECT_VIEW_ALL),
      PermissionService.hasPermission(userId, Permission.TASK_UPDATE, taskId)
    ])
    const isAssignee = Array.isArray(task.assignedTo) && task.assignedTo.some(assignee => assignee.user?.toString() === userId.toString())
    const isCreator = task.createdBy && task.createdBy.toString() === userId

    if (!canTaskViewAll && !canProjectViewAll && !canTaskUpdate && !isAssignee && !isCreator) {
      return NextResponse.json(
        { error: 'Insufficient permissions to comment on this task' },
        { status: 403 }
      )
    }

    // Validate parent comment if provided
    let parentAuthorId: string | null = null
    if (parentCommentId) {
      const parent = task.comments?.find((c: any) => c._id?.toString() === parentCommentId)
      if (!parent) {
        return NextResponse.json(
          { error: 'Parent comment not found' },
          { status: 404 }
        )
      }
      parentAuthorId = parent.author?.toString() || null
    }

    const commentId = new mongoose.Types.ObjectId()
    const now = new Date()
    const comment = {
      _id: commentId,
      content,
      author: new mongoose.Types.ObjectId(userId),
      parentCommentId: parentCommentId ? new mongoose.Types.ObjectId(parentCommentId) : null,
      mentions: mentions.map(id => new mongoose.Types.ObjectId(id)),
      linkedIssues: linkedIssues.map(id => new mongoose.Types.ObjectId(id)),
      attachments,
      createdAt: now,
      updatedAt: now
    }

    // Push comment without loading entire comments array
    await Task.updateOne(
      { _id: taskId },
      { $push: { comments: comment } }
    )

    // Prepare notification recipients: mentioned users + assignees + parent author (if replying)
    const notifyUserIds = new Set<string>()
    mentions.forEach(id => notifyUserIds.add(id))
    // Add all assignees to notifications
    if (Array.isArray(task.assignedTo)) {
      task.assignedTo.forEach(assignee => {
        if (assignee.user && assignee.user.toString() !== userId) {
          notifyUserIds.add(assignee.user.toString())
        }
      })
    }
    if (parentAuthorId && parentAuthorId !== userId) {
      notifyUserIds.add(parentAuthorId)
    }
    notifyUserIds.delete(userId) // do not notify self

    if (notifyUserIds.size > 0) {
      const url = `/tasks/${taskId}`
      // Fire-and-forget notification to reduce request latency
      void (async () => {
        try {
          await notificationService.createBulkNotifications(
            Array.from(notifyUserIds),
            organizationId,
            {
              type: 'task',
              title: parentCommentId ? 'New reply on task comment' : 'New task comment',
              message: `${parentCommentId ? 'New reply' : 'New comment'} on task ${task.displayId || task.title || 'task'}`,
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
        } catch (err) {
          console.error('Notification error (comment post):', err)
        }
      })()
    }

    return NextResponse.json({
      success: true,
      data: {
        _id: commentId.toString(),
        content: comment.content,
        author: userId,
        parentCommentId,
        mentions,
        linkedIssues,
        attachments: attachments.map(a => ({
          name: a.name,
          url: a.url,
          size: a.size,
          type: a.type,
          uploadedAt: a.uploadedAt
        })),
        createdAt: now,
        updatedAt: now
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

export async function PATCH(
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
    const commentId = isValidObjectId(payload.commentId) ? payload.commentId : ''
    if (!commentId) {
      return NextResponse.json({ error: 'Valid commentId is required' }, { status: 400 })
    }
    if (!content) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 })
    }

    const task = await Task.findById(taskId)
      .select('organization comments._id comments.author comments.parentCommentId')
      .lean<{
        organization?: any
        comments?: Array<{ _id?: any; author?: any; parentCommentId?: any }>
      }>()
      .exec()
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const comment = task.comments?.find((c: any) => c._id?.toString() === commentId)
    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    const isAuthor = comment.author?.toString() === userId.toString()
    const canTaskUpdate = await PermissionService.hasPermission(userId.toString(), Permission.TASK_UPDATE, taskId)

    // Allow author or TASK_UPDATE even if org mismatch; otherwise enforce org
    if (!isAuthor && !canTaskUpdate && task.organization && organizationId && task.organization.toString() !== organizationId.toString()) {
      return NextResponse.json({ error: 'Access denied to task' }, { status: 403 })
    }

    const now = new Date()
    const result = await Task.updateOne(
      { _id: taskId, 'comments._id': commentId },
      {
        $set: {
          'comments.$.content': content,
          'comments.$.updatedAt': now
        }
      }
    )

    if (result.modifiedCount === 0) {
      return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: {
        _id: commentId,
        content,
        updatedAt: now
      }
    })
  } catch (error) {
    console.error('Update comment error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

    const payload = await request.json()
    const commentId = isValidObjectId(payload.commentId) ? payload.commentId : ''
    if (!commentId) {
      return NextResponse.json({ error: 'Valid commentId is required' }, { status: 400 })
    }

    const task = await Task.findById(taskId)
      .select('organization comments._id comments.author')
      .lean<{
        organization?: any
        comments?: Array<{ _id?: any; author?: any }>
      }>()
      .exec()
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const comment = task.comments?.find((c: any) => c._id?.toString() === commentId)
    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    const isAuthor = comment.author?.toString() === userId.toString()
    const canTaskUpdate = await PermissionService.hasPermission(userId.toString(), Permission.TASK_UPDATE, taskId)

    // Allow author or TASK_UPDATE even if org mismatch; otherwise enforce org
    if (!isAuthor && !canTaskUpdate && task.organization && organizationId && task.organization.toString() !== organizationId.toString()) {
      return NextResponse.json({ error: 'Access denied to task' }, { status: 403 })
    }

    const result = await Task.updateOne(
      { _id: taskId },
      { $pull: { comments: { _id: new mongoose.Types.ObjectId(commentId) } } }
    )

    if (result.modifiedCount === 0) {
      return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete comment error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
