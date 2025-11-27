import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { Types } from 'mongoose'

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
    // Consider tasks with status 'done' or 'completed' as completed
    const tasksCompleted = tasks.filter(
      task => task.status === 'done' || task.status === 'completed'
    ).length
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

    // Validate client data before building update object
    if (updateData.clients !== undefined) {
      if (!Array.isArray(updateData.clients)) {
        return NextResponse.json(
          { error: 'clients must be an array of client IDs' },
          { status: 400 }
        )
      }
      if (updateData.clients.length > 0) {
        const clientId = updateData.clients[0]
        if (typeof clientId !== 'string' || !Types.ObjectId.isValid(clientId)) {
          return NextResponse.json(
            { error: 'Invalid client ID provided' },
            { status: 400 }
          )
        }
      }
    } else if (updateData.client !== undefined) {
      if (updateData.client && !Types.ObjectId.isValid(updateData.client)) {
        return NextResponse.json(
          { error: 'Invalid client ID provided' },
          { status: 400 }
        )
      }
    }

    // Build update object with proper handling for nested fields
    const updateObject: any = { $set: {} }
    
    // Explicitly handle status field if provided
    if (updateData.status !== undefined) {
      updateObject.$set['status'] = updateData.status
    }
    
    // Explicitly handle priority field if provided
    if (updateData.priority !== undefined) {
      updateObject.$set['priority'] = updateData.priority
    }
    
    // Handle budget updates (nested object)
    if (updateData.budget !== undefined) {
      updateObject.$set['budget'] = updateData.budget
    }
    
    // Handle teamMembers array
    if (updateData.teamMembers !== undefined) {
      updateObject.$set['teamMembers'] = updateData.teamMembers
    }
    
    // Handle client (single value, but may come as array from frontend)
    if (updateData.clients !== undefined) {
      if (Array.isArray(updateData.clients) && updateData.clients.length > 0) {
        updateObject.$set['client'] = updateData.clients[0]
      } else {
        updateObject.$set['client'] = null
      }
    } else if (updateData.client !== undefined) {
      updateObject.$set['client'] = updateData.client || null
    }
    
    // Handle tags array
    if (updateData.tags !== undefined) {
      updateObject.$set['tags'] = updateData.tags
    }
    
    // Handle customFields object
    if (updateData.customFields !== undefined) {
      updateObject.$set['customFields'] = updateData.customFields
    }
    
    // Handle date fields (convert string dates to Date objects)
    if (updateData.startDate !== undefined) {
      updateObject.$set['startDate'] = updateData.startDate 
        ? new Date(updateData.startDate) 
        : updateData.startDate
    }
    if (updateData.endDate !== undefined) {
      updateObject.$set['endDate'] = updateData.endDate 
        ? new Date(updateData.endDate) 
        : updateData.endDate
    }
    
    // Handle isDraft flag
    if (updateData.isDraft !== undefined) {
      updateObject.$set['isDraft'] = updateData.isDraft
    }
    
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
    
    // Add other top-level fields to $set (excluding fields already handled above)
    const excludedKeys = [
      'settings', 
      'status', 
      'priority', 
      'budget', 
      'teamMembers', 
      'clients', 
      'client', 
      'tags', 
      'customFields',
      'startDate',
      'endDate',
      'isDraft'
    ] // Already handled above
    Object.keys(updateData).forEach(key => {
      if (!excludedKeys.includes(key) && updateData[key] !== undefined) {
        updateObject.$set[key] = updateData[key]
      }
    })

    // Always use $set operator for proper MongoDB updates
    const finalUpdateData = updateObject

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
