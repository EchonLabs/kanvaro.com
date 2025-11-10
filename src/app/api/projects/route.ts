import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { notificationService } from '@/lib/notification-service'

// In-memory cache for request deduplication
const pendingRequests = new Map<string, Promise<any>>()
import { Counter } from '@/models/Counter'

export async function GET(request: NextRequest) {
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

    // Check if user can view all projects (admin permission)
    const canViewAllProjects = await PermissionService.hasPermission(userId, Permission.PROJECT_VIEW_ALL)
    
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const priority = searchParams.get('priority') || ''

    // Build filters
    const filters: any = { 
      organization: organizationId,
      is_deleted: { $ne: true } // Exclude deleted projects
    }
    
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ]
    }
    
    if (status) {
      filters.status = status
    }
    
    if (priority) {
      filters.priority = priority
    }

    let projectQuery: any = { ...filters }
    
    // If user can't view all projects, filter by access
    if (!canViewAllProjects) {
      projectQuery.$or = [
        { createdBy: userId },
        { teamMembers: userId },
        { client: userId }
      ]
    }

    const projects = await Project.find(projectQuery)
      .populate('createdBy', 'firstName lastName email')
      .populate('teamMembers', 'firstName lastName email')
      .populate('client', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)

    const total = await Project.countDocuments(projectQuery)

    return NextResponse.json({
      success: true,
      data: projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })

  } catch (error) {
    console.error('Get projects error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

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

    // Check if user can create projects
    const canCreateProject = await PermissionService.hasPermission(userId, Permission.PROJECT_CREATE)
    if (!canCreateProject) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create projects' },
        { status: 403 }
      )
    }

    const {
      name,
      description,
      status,
      priority,
      startDate,
      endDate,
      budget,
      teamMembers,
      clients,
      settings,
      tags,
      customFields,
      isDraft
    } = await request.json()

    // Validate required fields (only if not a draft)
    if (!isDraft && (!name || !startDate)) {
      return NextResponse.json(
        { error: 'Name and start date are required' },
        { status: 400 }
      )
    }

    // Create a unique key for this request to prevent duplicates
    const requestKey = `${userId}-${organizationId}-${name?.trim()}-${isDraft}`
    
    // Check if there's already a pending request for this project
    if (pendingRequests.has(requestKey)) {
      console.log('Duplicate request detected, waiting for existing request to complete')
      try {
        const result = await pendingRequests.get(requestKey)
        return NextResponse.json(result)
      } catch (error) {
        // If the pending request failed, remove it and continue
        pendingRequests.delete(requestKey)
      }
    }

    // Duplicate prevention: Check for existing project with same name by same user (excluding deleted projects)
    if (name && name.trim()) {
      const existingProject = await Project.findOne({
        name: name.trim(),
        createdBy: userId,
        organization: organizationId,
        is_deleted: { $ne: true }, // Exclude deleted projects
        $or: [
          { isDraft: false },
          { isDraft: isDraft } // Only check draft status if we're creating a draft
        ]
      })

      if (existingProject) {
        return NextResponse.json(
          { error: 'A project with this name already exists' },
          { status: 409 }
        )
      }
    }

    // Create a promise for the project creation to handle concurrent requests
    const createProjectPromise = (async () => {
      // Generate sequential project number for this organization
      const counter = await Counter.findOneAndUpdate(
        { scope: 'project', organization: organizationId },
        { $inc: { seq: 1 }, $setOnInsert: { updatedAt: new Date() } },
        { new: true, upsert: true }
      )
      const projectNumber = counter.seq

      // Create project
      const project = new Project({
        name: name || 'Untitled Project',
        description,
        status: status || 'planning',
        isDraft: isDraft || false,
        is_deleted: false, // Ensure new projects are not deleted
        organization: organizationId,
        createdBy: userId,
        projectNumber,
        teamMembers: teamMembers || [],
        client: clients?.[0], // For now, only support one client
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : undefined,
        budget: budget ? {
          total: budget.total || 0,
          spent: 0,
          currency: budget.currency || 'USD',
          categories: {
            labor: budget.categories?.labor || 0,
            materials: budget.categories?.materials || 0,
            overhead: budget.categories?.overhead || 0
          }
        } : undefined,
        settings: {
          allowTimeTracking: settings?.allowTimeTracking ?? true,
          allowManualTimeSubmission: settings?.allowManualTimeSubmission ?? true,
          allowExpenseTracking: settings?.allowExpenseTracking ?? true,
          requireApproval: settings?.requireApproval ?? false,
          notifications: {
            taskUpdates: settings?.notifications?.taskUpdates ?? true,
            budgetAlerts: settings?.notifications?.budgetAlerts ?? true,
            deadlineReminders: settings?.notifications?.deadlineReminders ?? true
          }
        },
        tags: tags || [],
        customFields: customFields || {}
      })

      await project.save()

      // Populate the created project
      const populatedProject = await Project.findById(project._id)
        .populate('createdBy', 'firstName lastName email')
        .populate('teamMembers', 'firstName lastName email')
        .populate('client', 'firstName lastName email')

      // Send notifications to team members
      if (teamMembers && teamMembers.length > 0) {
        try {
          const createdByUser = await User.findById(userId).select('firstName lastName')
          const createdByName = createdByUser ? `${createdByUser.firstName} ${createdByUser.lastName}` : 'Someone'
          
          await notificationService.notifyProjectUpdate(
            project._id.toString(),
            'created',
            teamMembers,
            organizationId,
            name || 'Untitled Project'
          )
        } catch (notificationError) {
          console.error('Failed to send project creation notifications:', notificationError)
          // Don't fail the project creation if notification fails
        }
      }

      return {
        success: true,
        message: 'Project created successfully',
        data: populatedProject
      }
    })()

    // Store the promise in pending requests
    pendingRequests.set(requestKey, createProjectPromise)

    try {
      const result = await createProjectPromise
      return NextResponse.json(result)
    } finally {
      // Clean up the pending request
      pendingRequests.delete(requestKey)
    }

  } catch (error) {
    console.error('Create project error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
