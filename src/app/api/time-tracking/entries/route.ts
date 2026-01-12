import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { TimeEntry } from '@/models/TimeEntry'
import { TimeTrackingSettings } from '@/models/TimeTrackingSettings'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { Organization } from '@/models/Organization'
import { Task } from '@/models/Task'
import { applyRoundingRules } from '@/lib/utils'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'

export async function GET(request: NextRequest) {
  try {
    await connectDB()
    
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const organizationId = searchParams.get('organizationId')
    const projectId = searchParams.get('projectId')
    const taskId = searchParams.get('taskId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const status = searchParams.get('status')
    const isBillable = searchParams.get('isBillable')
    const isApproved = searchParams.get('isApproved')
    const isRejected = searchParams.get('isRejected')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!organizationId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }
    const orgId = organizationId as string

    // Authenticate viewer from cookies
    const cookieStore = cookies()
    const accessToken = cookieStore.get('accessToken')?.value
    const refreshToken = cookieStore.get('refreshToken')?.value

    if (!accessToken && !refreshToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let viewer: any = null
    let viewerId: string = ''
    try {
      if (accessToken) {
        const decoded: any = jwt.verify(accessToken, JWT_SECRET)
        viewer = await User.findById(decoded.userId)
      }
    } catch {}
    if (!viewer && refreshToken) {
      try {
        const decoded: any = jwt.verify(refreshToken, JWT_REFRESH_SECRET)
        viewer = await User.findById(decoded.userId)
      } catch {}
    }
    if (!viewer || !viewer.isActive) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    viewerId = viewer._id.toString()

    // Build base query
    const query: any = {
      organization: orgId
    }

    // Determine user scoping based on permissions and partner assignments
    const hasViewAll = await PermissionService.hasPermission(viewerId, Permission.TIME_TRACKING_VIEW_ALL)
    const hasViewAssigned = await PermissionService.hasPermission(viewerId, Permission.TIME_TRACKING_VIEW_ASSIGNED)

    if (userId) {
      // Targeting a specific user
      const isSelf = userId === viewerId
      if (!isSelf && !hasViewAll) {
        if (hasViewAssigned) {
          const target = await User.findById(userId).select('organization projectManager humanResourcePartner')
          const sameOrg = target && target.organization && target.organization.toString() === orgId
          const isAssigned = target && (
            (target.projectManager && target.projectManager.toString() === viewerId) ||
            (target.humanResourcePartner && target.humanResourcePartner.toString() === viewerId)
          )
          if (!sameOrg || !isAssigned) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
          }
        } else {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      }
      query.user = userId
    } else {
      // No explicit user requested
      if (hasViewAll) {
        // no user filter
      } else if (hasViewAssigned) {
        const assignedUsers = await User.find({
          organization: orgId,
          $or: [
            { projectManager: viewer._id },
            { humanResourcePartner: viewer._id }
          ]
        }).select('_id')
        const ids = assignedUsers.map((u: any) => u._id.toString())
        
        // If no assigned users, return empty results immediately
        if (ids.length === 0) {
          return NextResponse.json({
            success: true,
            data: [],
            pagination: {
              page,
              limit,
              total: 0,
              totalPages: 0
            },
            summary: {
              totalDuration: 0,
              totalCost: 0
            }
          })
        }
        
        query.user = { $in: ids }
      } else {
        // Only own logs
        query.user = viewerId
      }
    }

    if (projectId) query.project = projectId
    if (taskId) query.task = taskId
    if (status) query.status = status
    if (isBillable !== null) query.isBillable = isBillable === 'true'

    // Handle approval status filtering
    if (isApproved !== null) {
      if (isApproved === 'true') {
        // Approved entries
        query.isApproved = true
      } else if (isApproved === 'false') {
        // Pending entries (not approved and not rejected)
        query.isApproved = false
        query.isReject = false
      } else if (isApproved === 'rejected') {
        // Rejected entries
        query.isReject = true
      }
    }

    if (isRejected !== null) query.isReject = isRejected === 'true'

    if (startDate || endDate) {
      query.startTime = {}

      if (startDate) {
        const start = new Date(startDate)
        if (!Number.isNaN(start.getTime())) {
          start.setHours(0, 0, 0, 0)
          query.startTime.$gte = start
        }
      }

      if (endDate) {
        const end = new Date(endDate)
        if (!Number.isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999)
          query.startTime.$lte = end
        }
      }

      if (query.startTime && query.startTime.$gte && query.startTime.$lte && query.startTime.$gte > query.startTime.$lte) {
        const tmp = query.startTime.$gte
        query.startTime.$gte = query.startTime.$lte
        query.startTime.$lte = tmp
      }

      if (query.startTime && Object.keys(query.startTime).length === 0) {
        delete query.startTime
      }
    }

    // Get time entries with pagination
    const skip = (page - 1) * limit
    const timeEntries = await TimeEntry.find(query)
      .populate('project', 'name settings')
      .populate({ path: 'task', model: Task, select: 'title' })
      .populate('user', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName')
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
    
    // Normalize the response - ensure project and task are properly formatted
    // Handle cases where project/task might be deleted (populate returns null)
    const normalizedEntries = timeEntries.map((entry: any) => {
      // Check if project exists (populate returns null if document deleted)
      const project = entry.project && typeof entry.project === 'object' && entry.project.name
        ? {
            _id: entry.project._id || entry.project,
            name: entry.project.name,
            settings: entry.project.settings || {}
          }
        : null
      
      // Check if task exists (populate returns null if document deleted)
      // Only set task if task field exists in original entry (not null)
      const task = entry.task && typeof entry.task === 'object' && entry.task.title
        ? { _id: entry.task._id || entry.task, title: entry.task.title }
        : entry.task !== null && entry.task !== undefined
        ? { _id: entry.task._id || entry.task, title: null } // Task reference exists but document deleted
        : null
      
      // Populate user minimal fields for display
      const user = entry.user && typeof entry.user === 'object' && (entry.user.firstName !== undefined || entry.user.lastName !== undefined)
        ? { _id: entry.user._id || entry.user, firstName: entry.user.firstName || '', lastName: entry.user.lastName || '' }
        : { _id: (entry.user && entry.user._id) || entry.user, firstName: '', lastName: '' }
      
      return {
        ...entry,
        user,
        project,
        task
      }
    })

    const total = await TimeEntry.countDocuments(query)

    // Calculate totals
    const totalDuration = await TimeEntry.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$duration' } } }
    ])

    // Calculate total cost using a simpler approach
    const billableEntries = await TimeEntry.find({ ...query, isBillable: true })
    const totalCost = billableEntries.reduce((sum, entry) => {
      return sum + (entry.duration * entry.hourlyRate / 60)
    }, 0)

    return NextResponse.json({
      timeEntries: normalizedEntries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      totals: {
        totalDuration: totalDuration[0]?.total || 0,
        totalCost: totalCost
      }
    })
  } catch (error) {
    console.error('Error fetching time entries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB()
    
    const body = await request.json()
    const {
      userId,
      organizationId,
      projectId,
      taskId,
      description,
      startTime,
      endTime,
      duration,
      isBillable,
      hourlyRate,
      category,
      tags,
      notes
    } = body

    if (!userId || !organizationId || !projectId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Authenticate requester from cookies
    const cookieStore = cookies()
    const accessToken = cookieStore.get('accessToken')?.value
    const refreshToken = cookieStore.get('refreshToken')?.value

    if (!accessToken && !refreshToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let requester: any = null
    let requesterId: string = ''
    try {
      if (accessToken) {
        const decoded: any = jwt.verify(accessToken, JWT_SECRET)
        requester = await User.findById(decoded.userId)
      }
    } catch {}
    if (!requester && refreshToken) {
      try {
        const decoded: any = jwt.verify(refreshToken, JWT_REFRESH_SECRET)
        requester = await User.findById(decoded.userId)
      } catch {}
    }
    if (!requester || !requester.isActive) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    requesterId = requester._id.toString()

    // Verify the requester can create time entries for the specified user
    // Allow if: 1) Creating for themselves, OR 2) Has bulk_upload_all permission
    const isCreatingSelf = userId === requesterId
    const hasBulkUploadAll = await PermissionService.hasPermission(requesterId, Permission.TIME_TRACKING_BULK_UPLOAD_ALL)
    
    if (!isCreatingSelf && !hasBulkUploadAll) {
      return NextResponse.json({ error: 'You do not have permission to create time entries for other users' }, { status: 403 })
    }

    // Get project and check if time tracking is allowed
    const project = await Project.findById(projectId)
    if (!project || !project.settings.allowTimeTracking) {
      return NextResponse.json({ error: 'Time tracking not allowed for this project' }, { status: 403 })
    }

    // If taskId is provided, verify task assignment for users without bulk_upload_all permission
    if (taskId && !hasBulkUploadAll) {
      const Task = require('@/models/Task').default
      const task = await Task.findById(taskId)
      
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 })
      }

      // Check if user is assigned to the task
      const isAssignedToTask = task.assignedTo?.some((assigned: any) => {
        const assignedUserId = typeof assigned === 'string' ? assigned : assigned?.user?.toString() || assigned?._id?.toString()
        return assignedUserId === userId
      })

      if (!isAssignedToTask) {
        return NextResponse.json({ error: 'Task is not assigned to you' }, { status: 403 })
      }
    }

    // Get time tracking settings - check project-specific first, then organization-wide
    let settings = await TimeTrackingSettings.findOne({
      organization: organizationId,
      project: projectId
    })
    
    if (!settings) {
      settings = await TimeTrackingSettings.findOne({
        organization: organizationId,
        project: null
      })
    }
    
    console.log('Manual time entry - Time tracking settings found:', {
      hasSettings: !!settings,
      settingsId: settings?._id?.toString(),
      isProjectSpecific: settings?.project?.toString() === projectId,
      projectId: settings?.project?.toString(),
      requestedProjectId: projectId,
      requireDescription: settings?.requireDescription,
      requireDescriptionType: typeof settings?.requireDescription,
      allowManualTimeSubmission: settings?.allowManualTimeSubmission
    })

    // If no TimeTrackingSettings exist, create default ones based on organization settings
    if (!settings) {
      const organization = await Organization.findById(organizationId)
      
      if (!organization || !organization.settings.timeTracking.allowTimeTracking) {
        return NextResponse.json({ error: 'Time tracking not enabled' }, { status: 403 })
      }

      // Check project.settings.requireApproval as fallback
      const projectRequireApproval = project?.settings?.requireApproval ?? undefined

      // Create default TimeTrackingSettings based on organization settings
      settings = new TimeTrackingSettings({
        organization: organizationId,
        project: null,
        allowTimeTracking: organization.settings.timeTracking.allowTimeTracking,
        allowManualTimeSubmission: organization.settings.timeTracking.allowManualTimeSubmission,
        requireApproval: projectRequireApproval !== undefined ? projectRequireApproval : organization.settings.timeTracking.requireApproval,
        allowBillableTime: organization.settings.timeTracking.allowBillableTime,
        defaultHourlyRate: organization.settings.timeTracking.defaultHourlyRate,
        maxDailyHours: organization.settings.timeTracking.maxDailyHours,
        maxWeeklyHours: organization.settings.timeTracking.maxWeeklyHours,
        maxSessionHours: organization.settings.timeTracking.maxSessionHours,
        allowOvertime: organization.settings.timeTracking.allowOvertime,
        requireDescription: organization.settings.timeTracking.requireDescription,
        requireCategory: organization.settings.timeTracking.requireCategory,
        allowFutureTime: organization.settings.timeTracking.allowFutureTime,
        allowPastTime: organization.settings.timeTracking.allowPastTime,
        pastTimeLimitDays: organization.settings.timeTracking.pastTimeLimitDays,
        roundingRules: organization.settings.timeTracking.roundingRules,
        notifications: organization.settings.timeTracking.notifications
      })

      await settings.save()
    } else {
      // If settings exist but requireApproval is not set, check project.settings.requireApproval as fallback
      if ((settings.requireApproval === undefined || settings.requireApproval === null) && project?.settings?.requireApproval !== undefined) {
        settings.requireApproval = project.settings.requireApproval
      }
    }

    if (!settings.allowManualTimeSubmission) {
      return NextResponse.json({ error: 'Manual time submission not allowed' }, { status: 403 })
    }

    // Validate description if required
    // Explicitly check if requireDescription is true (handle both boolean true and undefined as false)
    const requireDescription = settings.requireDescription === true
    const hasDescription = description && typeof description === 'string' && description.trim().length > 0
    
    console.log('Manual time entry - Description validation:', {
      requireDescription,
      hasDescription,
      descriptionValue: description,
      descriptionType: typeof description,
      descriptionLength: description?.length,
      settingsRequireDescription: settings.requireDescription,
      settingsRequireDescriptionType: typeof settings.requireDescription
    })
    
    // Only validate description if it's explicitly required
    if (requireDescription === true && !hasDescription) {
      console.log('Validation failed: Description is required but missing')
      return NextResponse.json({ error: 'Description is required for time entries' }, { status: 400 })
    }
    
    // If description is not required and empty, use empty string or default
    const finalDescription = description || ''

    // Validate time
    const start = new Date(startTime)
    const end = endTime ? new Date(endTime) : new Date()
    const calculatedDuration = Math.round((end.getTime() - start.getTime()) / (1000 * 60))

    if (start > end) {
      return NextResponse.json({ error: 'Start time cannot be after end time' }, { status: 400 })
    }

    // Check if future time is allowed
    if (start > new Date() && !settings.allowFutureTime) {
      return NextResponse.json({ error: 'Future time logging not allowed' }, { status: 400 })
    }

    // Check if past time is allowed
    const daysDiff = Math.ceil((new Date().getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    if (daysDiff > settings.pastTimeLimitDays && !settings.allowPastTime) {
      return NextResponse.json({ error: 'Past time logging not allowed beyond limit' }, { status: 400 })
    }

    // Get user's hourly rate if not provided
    const user = await User.findById(userId)
    const finalHourlyRate = hourlyRate || user?.billingRate || settings.defaultHourlyRate

    const requestedDuration = duration || calculatedDuration

    if (
      settings.allowOvertime === true &&
      settings.maxSessionHours &&
      requestedDuration > settings.maxSessionHours * 60
    ) {
      return NextResponse.json(
        {
          error: `Session duration exceeds the maximum of ${settings.maxSessionHours} ${
            settings.maxSessionHours === 1 ? 'hour' : 'hours'
          }.`
        },
        { status: 400 }
      )
    }

    // Apply rounding rules if enabled
    let finalDuration = requestedDuration
    if (settings.roundingRules.enabled) {
      finalDuration = applyRoundingRules(finalDuration, settings.roundingRules)
    }

    // Create time entry
    // Check project settings for approval requirement
    let projectRequiresApproval = false
    if (projectId) {
      const projectForApproval = await Project.findById(projectId).select('settings.requireApproval')
      projectRequiresApproval = projectForApproval?.settings?.requireApproval === true
    }

    const timeEntry = new TimeEntry({
      user: userId,
      organization: organizationId,
      project: projectId,
      task: taskId,
      description: finalDescription,
      startTime: start,
      endTime: end,
      duration: finalDuration,
      isBillable: isBillable ?? true,
      hourlyRate: finalHourlyRate,
      status: 'completed',
      category,
      tags: tags || [],
      notes,
      isApproved: !projectRequiresApproval
    })

    await timeEntry.save()

    return NextResponse.json({
      message: 'Time entry created successfully',
      timeEntry: timeEntry.toObject()
    })
  } catch (error) {
    console.error('Error creating time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
