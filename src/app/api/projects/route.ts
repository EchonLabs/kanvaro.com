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
import { apiBaseUrl } from 'next-auth/client/_utils'

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

    console.log('Projects API - User permissions:', {
      userId,
      canViewAllProjects,
      hasProjectRead: await PermissionService.hasPermission(userId, Permission.PROJECT_READ)
    })
    
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '1000')
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
        { "teamMembers.memberId": userId }, // Check teamMembers array for memberId
        { client: userId }
      ]
      console.log('Projects API - Restricted query for team member:', {
        userId,
        baseFilters: filters,
        finalQuery: projectQuery
      })
    } else {
      console.log('Projects API - Unrestricted query for admin:', {
        userId,
        query: projectQuery
      })
    }

    const projects = await Project.find(projectQuery)
      .select('name startDate endDate createdBy teamMembers client status priority settings')
      .populate('createdBy', 'firstName lastName email')
      .populate('client', 'firstName lastName email')
      .populate('teamMembers.memberId', 'firstName lastName email _id')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)

    const total = await Project.countDocuments(projectQuery)

    console.log('Projects API - Query results:', {
      query: projectQuery,
      totalProjectsFound: total,
      projectsReturned: projects.length,
      projects: projects.map(p => ({
        _id: p._id,
        name: p.name,
        createdBy: p.createdBy?._id,
        teamMembers: p.teamMembers?.map((tm: any) => tm.memberId),
        isUserCreator: p.createdBy?._id?.toString() === userId,
        isUserTeamMember: p.teamMembers?.some((tm: any) => tm.memberId?.toString() === userId)
      }))
    })

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
        status: status || 'planning' || 'draft',
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
          defaultHourlyRate: budget.defaultHourlyRate || 0,
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
 let baseUrl: string
        
        // First, check if NEXT_PUBLIC_APP_URL is explicitly set (recommended for all environments)
        if (process.env.NEXT_PUBLIC_APP_URL) {
          baseUrl = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '') // Remove trailing slash
        } else {
          // Fall back to detecting from request headers
          // When behind a proxy/load balancer, check x-forwarded-* headers first
          const forwardedHost = request.headers.get('x-forwarded-host')
          const forwardedProto = request.headers.get('x-forwarded-proto')
          
          // Get the host from various sources, prioritizing origin/referer headers for external URLs
          const originHeader = request.headers.get('origin')
          const refererHeader = request.headers.get('referer')
          const hostHeader = request.headers.get('host')
          
          // Extract host from origin or referer (these usually have the correct external domain)
          let extractedHost: string | null = null
          let extractedProtocol: string | null = null
          
          if (originHeader) {
            try {
              const originUrl = new URL(originHeader)
              extractedHost = originUrl.host
              extractedProtocol = originUrl.protocol.replace(':', '')
            } catch (e) {
              // Invalid origin, continue
            }
          }
          
          if (!extractedHost && refererHeader) {
            try {
              const refererUrl = new URL(refererHeader)
              extractedHost = refererUrl.host
              extractedProtocol = refererUrl.protocol.replace(':', '')
            } catch (e) {
              // Invalid referer, continue
            }
          }
          
          // Determine protocol
          let protocol: string
          if (extractedProtocol) {
            protocol = extractedProtocol
          } else if (forwardedProto) {
            protocol = forwardedProto.split(',')[0].trim() // Use first proto if multiple
          } else if (hostHeader?.includes('localhost') || hostHeader?.includes('127.0.0.1')) {
            protocol = 'http'
          } else {
            protocol = 'https' // Default to https for production domains
          }
          
          // Determine host - prefer extracted host from origin/referer, then forwarded host, then host header
          let host: string
          if (extractedHost && !extractedHost.includes('localhost') && !extractedHost.includes('127.0.0.1')) {
            // Use extracted host if it's a valid external domain
            host = extractedHost
          } else if (forwardedHost) {
            host = forwardedHost.split(',')[0].trim() // Use first host if multiple
          } else if (hostHeader) {
            host = hostHeader.replace(/^https?:\/\//, '') // Remove protocol if present
          } else {
            host = 'localhost:3000' // Fallback
            protocol = 'http'
          }
          
          // Clean up host (remove any protocol prefix, remove trailing slash, remove port if default)
          host = host.replace(/^https?:\/\//, '').replace(/\/$/, '')
          // Remove default ports
          host = host.replace(/^(.+):80$/, '$1')
          host = host.replace(/^(.+):443$/, '$1')
          
          baseUrl = `${protocol}://${host}`
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
              name || 'Untitled Project',
              baseUrl
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
