import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Task } from '@/models/Task'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { invalidateCache } from '@/lib/redis'
import { CompletionService } from '@/lib/completion-service'

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

    let body
    try {
      body = await request.json()
    } catch (parseError) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { action, taskIds, updates } = body

    if (!action || !taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Action and taskIds are required' },
        { status: 400 }
      )
    }

    // Validate taskIds are valid ObjectIds
    const validTaskIds = taskIds.filter(id => {
      try {
        return id && typeof id === 'string' && id.length === 24
      } catch {
        return false
      }
    })

    if (validTaskIds.length !== taskIds.length) {
      return NextResponse.json(
        { success: false, error: 'All taskIds must be valid ObjectIds' },
        { status: 400 }
      )
    }

    // Check if user has access to all tasks
    const tasks = await Task.find({ _id: { $in: validTaskIds }, organization: organizationId })

    if (tasks.length !== validTaskIds.length) {
      return NextResponse.json(
        { success: false, error: 'One or more tasks not found or access denied' },
        { status: 404 }
      )
    }

    // Check if user has permission to update tasks
    const projectIds = Array.from(
      new Set(tasks.map((t) => t.project?.toString()).filter(Boolean))
    )
    
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
        if (!updates || typeof updates !== 'object') {
          return NextResponse.json(
            { success: false, error: 'Updates are required for update action and must be an object' },
            { status: 400 }
          )
        }

        // Validate status if being updated
        if (updates.status && typeof updates.status !== 'string') {
          return NextResponse.json(
            { success: false, error: 'Invalid status - must be a string' },
            { status: 400 }
          )
        }

        result = await Task.updateMany(
          { _id: { $in: validTaskIds }, organization: organizationId },
          { $set: updates }
        )

        // Check for story completion if status was updated to 'done' or 'completed'
        if (updates.status === 'done' || updates.status === 'completed') {
          // Run completion checks for each updated task in background
          setImmediate(async () => {
            try {
              for (const taskId of validTaskIds) {
                await CompletionService.handleTaskStatusChange(taskId)
              }
            } catch (error) {
              console.error('Error in bulk task completion service:', error)
            }
          })
        }

        // Invalidate cache for affected projects
        for (const projectId of projectIds) {
          if (projectId) {
            await invalidateCache(`tasks:*project:${projectId}*`)
          }
        }
        await invalidateCache(`tasks:*org:${organizationId}*`)

        break

      case 'delete':
        result = await Task.deleteMany({ _id: { $in: validTaskIds }, organization: organizationId })
        
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
          { success: false, error: 'Invalid action. Supported actions: update, delete' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: `Bulk ${action} completed successfully for ${validTaskIds.length} tasks`
    })
  } catch (error) {
    console.error('Error performing bulk operation:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to perform bulk operation' },
      { status: 500 }
    )
  }
}


