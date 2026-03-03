import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Task } from '@/models/Task'
import { Project } from '@/models/Project'
import { authenticateUser } from '@/lib/auth-utils'
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
    const { id: projectId } = params

    // Verify project exists and user has access
    const project = await Project.findOne({
      _id: projectId,
      organization: organizationId
    }).select('_id name')

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Check if user can view tasks in this project
    const canViewAllTasks = await PermissionService.hasPermission(
      userId,
      Permission.TASK_VIEW_ALL
    ) || await PermissionService.hasPermission(
      userId,
      Permission.PROJECT_VIEW_ALL
    )

    // Get tasks for the project
    const query: any = {
      project: projectId,
      organization: organizationId,
      archived: false
    }

    // If user doesn't have view all permissions, only show tasks they can access
    if (!canViewAllTasks) {
      query.$or = [
        { 'assignedTo.user': { $in: [userId] } },
        { createdBy: userId }
      ]
    }

    const tasks = await Task.find(query)
      .select('_id title status priority isBillable taskNumber displayId')
      .sort({ taskNumber: 1 })
      .lean()

    return NextResponse.json({
      success: true,
      data: tasks
    })

  } catch (error) {
    console.error('Error fetching project tasks:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}