import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Task } from '@/models/Task'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

export async function POST(request: NextRequest) {
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

    const { projectId, status, orderedTaskIds } = await request.json()

    // Validate required fields
    if (!projectId || !status || !Array.isArray(orderedTaskIds)) {
      return NextResponse.json(
        { error: 'projectId, status, and orderedTaskIds are required' },
        { status: 400 }
      )
    }

    // Check if user can update tasks in this project
    const canUpdateTasks = await PermissionService.hasPermission(userId, Permission.TASK_UPDATE, projectId)
    if (!canUpdateTasks) {
      return NextResponse.json(
        { error: 'Insufficient permissions to reorder tasks' },
        { status: 403 }
      )
    }

    // Verify all tasks belong to the project and status
    const tasks = await Task.find({
      _id: { $in: orderedTaskIds },
      project: projectId,
      status: status,
      organization: organizationId
    })

    if (tasks.length !== orderedTaskIds.length) {
      return NextResponse.json(
        { error: 'Some tasks not found or do not belong to the specified project/status' },
        { status: 400 }
      )
    }

    // Update positions using bulkWrite
    const bulkOps = orderedTaskIds.map((taskId, index) => ({
      updateOne: {
        filter: { _id: taskId, project: projectId, status: status },
        update: { $set: { position: index } }
      }
    }))

    await Task.bulkWrite(bulkOps)

    return NextResponse.json({
      success: true,
      message: 'Tasks reordered successfully'
    })

  } catch (error) {
    console.error('Reorder tasks error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
