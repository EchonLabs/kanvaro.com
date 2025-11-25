import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { TimeEntry } from '@/models/TimeEntry'
import { TimeTrackingSettings } from '@/models/TimeTrackingSettings'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { Organization } from '@/models/Organization'
import { Task } from '@/models/Task'
import { applyRoundingRules } from '@/lib/utils'

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
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!userId || !organizationId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // Build query
    const query: any = {
      user: userId,
      organization: organizationId
    }

    if (projectId) query.project = projectId
    if (taskId) query.task = taskId
    if (status) query.status = status
    if (isBillable !== null) query.isBillable = isBillable === 'true'
    if (isApproved !== null) query.isApproved = isApproved === 'true'

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
      .populate('project', 'name')
      .populate({ path: 'task', model: Task, select: 'title' })
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
        ? { _id: entry.project._id || entry.project, name: entry.project.name }
        : null
      
      // Check if task exists (populate returns null if document deleted)
      // Only set task if task field exists in original entry (not null)
      const task = entry.task && typeof entry.task === 'object' && entry.task.title
        ? { _id: entry.task._id || entry.task, title: entry.task.title }
        : entry.task !== null && entry.task !== undefined
        ? { _id: entry.task._id || entry.task, title: null } // Task reference exists but document deleted
        : null
      
      return {
        ...entry,
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

    // Get project and check if time tracking is allowed
    const project = await Project.findById(projectId)
    if (!project || !project.settings.allowTimeTracking) {
      return NextResponse.json({ error: 'Time tracking not allowed for this project' }, { status: 403 })
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

      // Create default TimeTrackingSettings based on organization settings
      settings = new TimeTrackingSettings({
        organization: organizationId,
        project: null,
        allowTimeTracking: organization.settings.timeTracking.allowTimeTracking,
        allowManualTimeSubmission: organization.settings.timeTracking.allowManualTimeSubmission,
        requireApproval: organization.settings.timeTracking.requireApproval,
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

    // Apply rounding rules if enabled
    let finalDuration = duration || calculatedDuration
    if (settings.roundingRules.enabled) {
      finalDuration = applyRoundingRules(finalDuration, settings.roundingRules)
    }

    // Create time entry
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
      isApproved: !settings.requireApproval
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
