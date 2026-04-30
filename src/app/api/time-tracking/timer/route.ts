import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { ActiveTimer, IActiveTimer } from '@/models/ActiveTimer'
import { TimeEntry } from '@/models/TimeEntry'
import { TimeTrackingSettings } from '@/models/TimeTrackingSettings'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { Organization } from '@/models/Organization'
import { applyRoundingRules } from '@/lib/utils'
import { logActivity } from '@/lib/activity-logger'

import { 
  getEffectiveTimeTrackingSettings, 
  getDailyHoursLogged, 
  calculateCurrentDurationMinutes, 
  stopTimerInternal, 
  enforceTimerLimitsInternal,
  getIdString
} from '@/lib/time-tracking-server'

export async function GET(request: NextRequest) {
  try {
    await connectDB()
    
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const organizationId = searchParams.get('organizationId')
    if (!userId || !organizationId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // Get active timer for user
    const activeTimer = await ActiveTimer.findOne({
      user: userId,
      organization: organizationId
    }).populate('project', 'name settings').populate('task', 'title').populate('user', 'firstName lastName')

    if (!activeTimer) {
      return NextResponse.json({ activeTimer: null })
    }

    const autoStopResult = await enforceTimerLimitsInternal(activeTimer)
    if (autoStopResult && autoStopResult.success) {
      return NextResponse.json(
        {
          ...autoStopResult.result,
          activeTimer: null
        },
        { status: 200 }
      )
    }

    const currentDuration = calculateCurrentDurationMinutes(activeTimer, new Date())

    // Calculate remaining daily minutes for the client
    const effectiveSettings = await getEffectiveTimeTrackingSettings(organizationId, null)
    let remainingDailyMinutes: number | null = null
    const MINUTES_PER_HOUR = 60
    if (effectiveSettings?.maxDailyHours && effectiveSettings.allowOvertime === false) {
      const dailyHoursLogged = await getDailyHoursLogged(userId, organizationId)
      const remainingHours = Math.max(0, effectiveSettings.maxDailyHours - dailyHoursLogged)
      remainingDailyMinutes = remainingHours * MINUTES_PER_HOUR
    }

    return NextResponse.json({
      activeTimer: {
        ...activeTimer.toObject(),
        currentDuration,
        isPaused: !!activeTimer.pausedAt,
        remainingDailyMinutes
      }
    })
  } catch (error) {
    console.error('Error fetching active timer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    
    await connectDB()
    
    const body = await request.json()
    
    const { userId, organizationId, projectId, taskId, description, category, tags, isBillable, hourlyRate } = body
    

    if (!userId || !organizationId || !projectId) {
   
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check if user already has an active timer
    const existingTimer = await ActiveTimer.findOne({
      user: userId,
      organization: organizationId
    }).populate('user', 'firstName lastName')

    if (existingTimer) {
      return NextResponse.json({ error: 'User already has an active timer' }, { status: 400 })
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

    if (!settings.allowTimeTracking) {
      return NextResponse.json({ error: 'Time tracking not enabled' }, { status: 403 })
    }

    // Check daily hours limit before starting timer
    if (settings.allowOvertime === false && settings.maxDailyHours) {
      const dailyHoursLogged = await getDailyHoursLogged(userId, organizationId)
      if (dailyHoursLogged >= settings.maxDailyHours) {
        return NextResponse.json(
          { error: `Daily time limit reached. You have already logged ${dailyHoursLogged.toFixed(1)} hours today (maximum: ${settings.maxDailyHours} hours). You cannot start a new timer until tomorrow.` },
          { status: 400 }
        )
      }
    }

    // Validate description if required
    // Explicitly check if requireDescription is true (handle both boolean true and undefined as false)
    const requireDescription = settings.requireDescription === true
    const hasDescription = description && typeof description === 'string' && description.trim().length > 0
    
  
    
    // Only validate description if it's explicitly required
    if (requireDescription === true && !hasDescription) {
      return NextResponse.json({ error: 'Description is required for time entries' }, { status: 400 })
    }
    
    // If description is not required and empty, use empty string or default
    const finalDescription = description || ''

    // Get user's hourly rate
    const userForRate = await User.findById(userId)
    const finalHourlyRate = hourlyRate || userForRate?.billingRate || settings.defaultHourlyRate

    const startTime = new Date()

    // Calculate effective max session hours considering daily limit
    let effectiveMaxSession = settings.maxSessionHours
    if (settings.allowOvertime === false && settings.maxDailyHours) {
      const dailyHoursLogged = await getDailyHoursLogged(userId, organizationId)
      const remainingDailyHours = Math.max(0, settings.maxDailyHours - dailyHoursLogged)
      effectiveMaxSession = Math.min(settings.maxSessionHours, remainingDailyHours)
    }

    // Create active timer
    const activeTimer = new ActiveTimer({
      user: userId,
      organization: organizationId,
      project: projectId,
      task: taskId,
      description: finalDescription,
      startTime,
      category,
      tags: tags || [],
      isBillable: isBillable ?? true,
      hourlyRate: finalHourlyRate,
      maxSessionHours: effectiveMaxSession
    })

    await activeTimer.save()
    
    // Populate user, project and task data after saving
    await activeTimer.populate('user', 'firstName lastName')
    await activeTimer.populate('project', 'name settings')
    await activeTimer.populate('task', 'title')

    // Log activity: timer started (non-blocking)
    const projectNameForLog = (activeTimer.project as any)?.name || 'Unknown Project'
    const taskTitleForLog = (activeTimer.task as any)?.title || undefined
    logActivity({
      organizationId: String(organizationId),
      userId: String(userId),
      action: 'timer_started',
      entityType: 'timer',
      entityId: String(activeTimer._id),
      entityName: taskTitleForLog || projectNameForLog,
      projectId: String(projectId),
      projectName: projectNameForLog,
      details: { taskTitle: taskTitleForLog, description: finalDescription }
    }).catch(err => console.error('Failed to log timer start activity:', err))

    return NextResponse.json({
      message: 'Timer started successfully',
      activeTimer: {
        ...activeTimer.toObject(),
        currentDuration: 0,
        isPaused: false
      }
    })
  } catch (error) {
    console.error('Error starting timer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await connectDB()
    
    const body = await request.json()
    const { userId, organizationId, action, description, category, tags } = body

    if (!userId || !organizationId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const activeTimer = await ActiveTimer.findOne({
      user: userId,
      organization: organizationId
    }).populate('user', 'firstName lastName').populate('project', 'name settings').populate('task', 'title')

    if (!activeTimer) {
      return NextResponse.json({ error: 'No active timer found' }, { status: 404 })
    }

    // NOTE: enforceTimerLimits() removed from PUT handler to prevent race condition.
    // When a user sends a 'stop' action, the stop logic itself handles limit capping.
    // The GET handler and cron job still enforce limits independently.

    const now = new Date()

    const timerProjectName = (activeTimer.project as any)?.name || 'Unknown Project'
    const timerTaskTitle = (activeTimer.task as any)?.title || undefined
    const timerOrgId = String(getIdString(activeTimer.organization) || organizationId)
    const timerProjectId = getIdString(activeTimer.project) || undefined

    switch (action) {
      case 'pause':
        if (activeTimer.pausedAt) {
          return NextResponse.json({ error: 'Timer is already paused' }, { status: 400 })
        }
        activeTimer.pausedAt = now
        // Log activity: timer paused (non-blocking)
        logActivity({
          organizationId: timerOrgId,
          userId: String(userId),
          action: 'timer_paused',
          entityType: 'timer',
          entityId: String(activeTimer._id),
          entityName: timerTaskTitle || timerProjectName,
          projectId: timerProjectId,
          projectName: timerProjectName,
          details: { taskTitle: timerTaskTitle }
        }).catch(err => console.error('Failed to log timer pause activity:', err))
        break

      case 'resume':
        if (!activeTimer.pausedAt) {
          return NextResponse.json({ error: 'Timer is not paused' }, { status: 400 })
        }
        const pausedDuration = (now.getTime() - activeTimer.pausedAt.getTime()) / (1000 * 60)
        activeTimer.totalPausedDuration += pausedDuration
        activeTimer.pausedAt = undefined
        // Log activity: timer resumed (non-blocking)
        logActivity({
          organizationId: timerOrgId,
          userId: String(userId),
          action: 'timer_resumed',
          entityType: 'timer',
          entityId: String(activeTimer._id),
          entityName: timerTaskTitle || timerProjectName,
          projectId: timerProjectId,
          projectName: timerProjectName,
          details: { taskTitle: timerTaskTitle }
        }).catch(err => console.error('Failed to log timer resume activity:', err))
        break

      case 'stop': {
        const stopResult = await stopTimerInternal(activeTimer, {
          description,
          category,
          tags,
          reason: 'manual'
        })
        // Log activity: timer stopped (non-blocking)
        if (stopResult.success && !stopResult.alreadyStopped) {
          logActivity({
            organizationId: timerOrgId,
            userId: String(userId),
            action: 'timer_stopped',
            entityType: 'timer',
            entityId: String(activeTimer._id),
            entityName: timerTaskTitle || timerProjectName,
            projectId: timerProjectId,
            projectName: timerProjectName,
            details: {
              taskTitle: timerTaskTitle,
              duration: stopResult.duration,
              hasTimeLogged: !!stopResult.timeEntry
            }
          }).catch(err => console.error('Failed to log timer stop activity:', err))
        }
        return NextResponse.json(stopResult, { status: stopResult.success ? 200 : 400 })
      }

      case 'update':
        if (description) activeTimer.description = description
        if (category) activeTimer.category = category
        if (tags) activeTimer.tags = tags
        break

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    await activeTimer.save()

    // Use pausedAt-aware duration calculation
    const currentDuration = calculateCurrentDurationMinutes(activeTimer, now)

    return NextResponse.json({
      message: 'Timer updated successfully',
      activeTimer: {
        ...activeTimer.toObject(),
        currentDuration,
        isPaused: !!activeTimer.pausedAt
      }
    })
  } catch (error) {
    console.error('Error updating timer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
