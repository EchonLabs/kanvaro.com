import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { TaskActivity } from '@/models/TaskActivity'
import { Task } from '@/models/Task'
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
    const taskId = params.id

    // Verify user has access to this task
    const [hasTaskViewAll, hasProjectViewAll] = await Promise.all([
      PermissionService.hasPermission(userId, Permission.TASK_VIEW_ALL),
      PermissionService.hasPermission(userId, Permission.PROJECT_VIEW_ALL)
    ])

    if (!hasTaskViewAll && !hasProjectViewAll) {
      const task = await Task.findOne({
        _id: taskId,
        organization: organizationId,
        $or: [
          { 'assignedTo.user': userId },
          { createdBy: userId }
        ]
      }).select('_id').lean()

      if (!task) {
        return NextResponse.json(
          { error: 'Task not found or unauthorized' },
          { status: 404 }
        )
      }
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
    const cursor = searchParams.get('cursor')

    const query: Record<string, any> = {
      task: taskId,
      organization: organizationId
    }

    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) }
    }

    const activities = await TaskActivity.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('user', 'firstName lastName email avatar profileImage')
      .lean()

    const hasMore = activities.length > limit
    const results = hasMore ? activities.slice(0, limit) : activities

    return NextResponse.json({
      success: true,
      data: results,
      hasMore,
      nextCursor: hasMore && results.length > 0
        ? (results[results.length - 1] as any).createdAt?.toISOString()
        : null
    })
  } catch (error) {
    console.error('Get task activities error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
