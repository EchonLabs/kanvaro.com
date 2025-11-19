import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Task } from '@/models/Task'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { invalidateCache } from '@/lib/redis'

export async function POST(request: NextRequest) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const userId = user.id
    const organizationId = user.organization

    const { action, taskIds, updates } = await request.json()

    if (!action || !taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Action and taskIds are required' },
        { status: 400 }
      )
    }

    // Check if user has access to all tasks
    const tasks = await Task.find({ _id: { $in: taskIds }, organization: organizationId })

    if (tasks.length !== taskIds.length) {
      return NextResponse.json(
        { success: false, error: 'One or more tasks not found or access denied' },
        { status: 404 }
      )
    }

    // Check if user has permission to update tasks
    const projectIds = [...new Set(tasks.map(t => t.project?.toString()).filter(Boolean))]
    
    for (const projectId of projectIds) {
      if (projectId) {
        const canUpdateTasks = await PermissionService.hasPermission(userId, Permission.TASK_UPDATE, projectId)
        if (!canUpdateTasks) {
          return NextResponse.json(
            { success: false, error: 'Access denied to update tasks in this project' },
            { status: 403 }
          )
        }
      }
    }

    let result

    switch (action) {
      case 'update':
        if (!updates) {
          return NextResponse.json(
            { success: false, error: 'Updates are required for update action' },
            { status: 400 }
          )
        }

        // Validate status if being updated
        if (updates.status && typeof updates.status !== 'string') {
          return NextResponse.json(
            { success: false, error: 'Invalid status' },
            { status: 400 }
          )
        }

        result = await Task.updateMany(
          { _id: { $in: taskIds }, organization: organizationId },
          { $set: updates }
        )

        // Invalidate cache for affected projects
        for (const projectId of projectIds) {
          if (projectId) {
            await invalidateCache(`tasks:*project:${projectId}*`)
          }
        }
        await invalidateCache(`tasks:*org:${organizationId}*`)

        break

      case 'delete':
        result = await Task.deleteMany({ _id: { $in: taskIds }, organization: organizationId })
        
        // Invalidate cache for affected projects
        for (const projectId of projectIds) {
          if (projectId) {
            await invalidateCache(`tasks:*project:${projectId}*`)
          }
        }
        await invalidateCache(`tasks:*org:${organizationId}*`)

        break

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: `Bulk ${action} completed successfully`
    })
  } catch (error) {
    console.error('Error performing bulk operation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to perform bulk operation' },
      { status: 500 }
    )
  }
}


