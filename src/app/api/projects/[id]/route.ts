import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
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
    const projectId = params.id

    // Check if user can access this project
    const canAccessProject = await PermissionService.canAccessProject(userId, projectId)
    if (!canAccessProject) {
      return NextResponse.json(
        { error: 'Access denied to project' },
        { status: 403 }
      )
    }

    // Find project (only non-deleted projects)
    const project = await Project.findOne({
      _id: projectId,
      organization: organizationId,
      is_deleted: { $ne: true } // Only return non-deleted projects
    })
      .populate('createdBy', 'firstName lastName email')
      .populate('teamMembers', 'firstName lastName email')
      .populate('client', 'firstName lastName email')

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Calculate progress from tasks
    const tasks = await Task.find({ project: projectId })
    const totalTasks = tasks.length
    const tasksCompleted = tasks.filter(task => task.status === 'done').length
    const completionPercentage = totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0

    const progress = {
      completionPercentage,
      tasksCompleted,
      totalTasks
    }

    return NextResponse.json({
      success: true,
      data: {
        ...project.toObject(),
        progress
      }
    })

  } catch (error) {
    console.error('Get project error:', error)
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
    const projectId = params.id

    // Check if user can update this project
    const canUpdateProject = await PermissionService.hasPermission(userId, Permission.PROJECT_UPDATE, projectId)
    if (!canUpdateProject) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update project' },
        { status: 403 }
      )
    }

    const updateData = await request.json()

    // Check for duplicate project name if name is being updated (excluding deleted projects and current project)
    if (updateData.name && updateData.name.trim()) {
      const existingProject = await Project.findOne({
        name: updateData.name.trim(),
        createdBy: userId,
        organization: organizationId,
        is_deleted: { $ne: true }, // Exclude deleted projects
        _id: { $ne: projectId } // Exclude current project
      })

      if (existingProject) {
        return NextResponse.json(
          { error: 'A project with this name already exists' },
          { status: 409 }
        )
      }
    }

    // Build update object with proper handling for nested fields
    const updateObject: any = { $set: {} }
    
    // Extract settings if present and handle nested updates
    if (updateData.settings) {
      if (updateData.settings.kanbanStatuses !== undefined) {
        updateObject.$set['settings.kanbanStatuses'] = updateData.settings.kanbanStatuses
      }
      // Handle other settings fields
      if (updateData.settings.allowTimeTracking !== undefined) {
        updateObject.$set['settings.allowTimeTracking'] = updateData.settings.allowTimeTracking
      }
      if (updateData.settings.allowManualTimeSubmission !== undefined) {
        updateObject.$set['settings.allowManualTimeSubmission'] = updateData.settings.allowManualTimeSubmission
      }
      if (updateData.settings.allowExpenseTracking !== undefined) {
        updateObject.$set['settings.allowExpenseTracking'] = updateData.settings.allowExpenseTracking
      }
      if (updateData.settings.requireApproval !== undefined) {
        updateObject.$set['settings.requireApproval'] = updateData.settings.requireApproval
      }
      if (updateData.settings.notifications) {
        Object.keys(updateData.settings.notifications).forEach(key => {
          updateObject.$set[`settings.notifications.${key}`] = updateData.settings.notifications[key]
        })
      }
    }
    
    // Add other top-level fields to $set
    Object.keys(updateData).forEach(key => {
      if (key !== 'settings') {
        updateObject.$set[key] = updateData[key]
      }
    })

    // If no $set fields, fall back to direct update
    const finalUpdateData = Object.keys(updateObject.$set).length > 0 
      ? updateObject 
      : updateData

    // Find and update project (only update non-deleted projects)
    const project = await Project.findOneAndUpdate(
      {
        _id: projectId,
        organization: organizationId,
        is_deleted: { $ne: true } // Only update non-deleted projects
      },
      finalUpdateData,
      { new: true }
    )
      .populate('createdBy', 'firstName lastName email')
      .populate('teamMembers', 'firstName lastName email')
      .populate('client', 'firstName lastName email')

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Project updated successfully',
      data: project
    })

  } catch (error) {
    console.error('Update project error:', error)
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
    const projectId = params.id

    // Check if user can delete this project
 
    const canDeleteProject = await PermissionService.hasPermission(userId, Permission.PROJECT_DELETE, projectId)
    if (!canDeleteProject) {
      return NextResponse.json(
        { error: 'Insufficient permissions to delete project' },
        { status: 403 }
      )
    }

    // Find and delete project (only non-deleted projects)
    const project = await Project.findOneAndDelete({
      _id: projectId,
      organization: organizationId,
      is_deleted: { $ne: true } // Only delete non-deleted projects
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Project deleted successfully'
    })

  } catch (error) {
    console.error('Delete project error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
