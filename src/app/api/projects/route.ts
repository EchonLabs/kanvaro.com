import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
import { User } from '@/models/User'
import { Organization } from '@/models/Organization'
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

    // Calculate progress for each project
    const projectsWithProgress = await Promise.all(
      projects.map(async (project) => {
        const tasks = await Task.find({ 
          project: project._id,
          organization: organizationId
        })
        
        const totalTasks = tasks.length
        // Consider tasks with status 'done' or 'completed' as completed
        const tasksCompleted = tasks.filter(
          task => task.status === 'done' || task.status === 'completed'
        ).length
        const completionPercentage = totalTasks > 0 
          ? Math.round((tasksCompleted / totalTasks) * 100) 
          : 0

        return {
          ...project.toObject(),
          progress: {
            completionPercentage,
            tasksCompleted,
            totalTasks
          }
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: projectsWithProgress,
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

    const requestBody = await request.json()
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
      attachments,
      externalLinks,
      isDraft,
      isBillableByDefault
    } = requestBody
    
    // Debug: Log externalLinks to see what we're receiving
    console.log('Received externalLinks:', JSON.stringify(externalLinks, null, 2))

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
    // Optimized query - only select needed fields, use lean for faster query
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
      }).select('_id').lean() // Only select _id, use lean for faster query

      if (existingProject) {
        return NextResponse.json(
          { error: 'A project with this name already exists' },
          { status: 409 }
        )
      }
    }

    // Create a promise for the project creation to handle concurrent requests
    const createProjectPromise = (async () => {
      // Get organization currency
      const organization = await Organization.findById(organizationId)
      const orgCurrency = organization?.currency || 'USD'
      
      // Generate sequential project number for this organization
      const counter = await Counter.findOneAndUpdate(
        { scope: 'project', organization: organizationId },
        { $inc: { seq: 1 }, $setOnInsert: { updatedAt: new Date() } },
        { new: true, upsert: true }
      )
      const projectNumber = counter.seq

      // Process externalLinks first
      const processedExternalLinks = {
        figma: Array.isArray(externalLinks?.figma) 
          ? externalLinks.figma.filter((link: string) => link && link.trim()).map((link: string) => link.trim())
          : [],
        documentation: Array.isArray(externalLinks?.documentation) 
          ? externalLinks.documentation.filter((link: string) => link && link.trim()).map((link: string) => link.trim())
          : []
      }
      
      // Debug: Log what we received
      console.log('Received externalLinks:', JSON.stringify(externalLinks, null, 2))
      console.log('Processed externalLinks:', JSON.stringify(processedExternalLinks, null, 2))

      // Create project
      const project = new Project({
        name: name || 'Untitled Project',
        description,
        status: status || 'planning',
        isDraft: isDraft || false,
        isBillableByDefault: isBillableByDefault !== undefined ? Boolean(isBillableByDefault) : true,
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
          currency: orgCurrency, // Use organization currency instead of project currency
          categories: {
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
        customFields: customFields || {},
        attachments: attachments ? attachments.map((att: any) => ({
          name: att.name,
          url: att.url,
          size: att.size,
          type: att.type,
          uploadedBy: userId,
          uploadedAt: att.uploadedAt ? new Date(att.uploadedAt) : new Date()
        })) : [],
        externalLinks: processedExternalLinks
      })
      
      // Set externalLinks explicitly to ensure it's saved (in case constructor didn't set it)
      project.externalLinks = processedExternalLinks
      
      // Debug: Log what we're about to save
      console.log('Received externalLinks:', JSON.stringify(externalLinks, null, 2))
      console.log('Processed externalLinks:', JSON.stringify(processedExternalLinks, null, 2))
      console.log('Project externalLinks before save:', JSON.stringify(project.externalLinks, null, 2))

      // Explicitly mark externalLinks as modified to ensure it's saved
      project.markModified('externalLinks')
      project.markModified('externalLinks.figma')
      project.markModified('externalLinks.documentation')

      // Save and populate in one operation
      await project.save()
      
      // Reload the project to verify what was saved
      const savedProject = await Project.findById(project._id).lean()
      await project.populate([
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'teamMembers', select: 'firstName lastName email' },
        { path: 'client', select: 'firstName lastName email' }
      ])

      // Return response immediately - send notifications asynchronously
      const response = {
        success: true,
        message: 'Project created successfully',
        data: project.toObject()
      }

      // Send notifications asynchronously (non-blocking)
      if (teamMembers && teamMembers.length > 0) {
        // Run in background without blocking the response
        ;(async () => {
          try {
            await notificationService.notifyProjectUpdate(
              project._id.toString(),
              'created',
              teamMembers,
              organizationId,
              name || 'Untitled Project'
            )
          } catch (notificationError) {
            console.error('Failed to send project creation notifications (non-blocking):', notificationError)
            // Don't fail the project creation if notification fails
          }
        })()
      }

      return response
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
