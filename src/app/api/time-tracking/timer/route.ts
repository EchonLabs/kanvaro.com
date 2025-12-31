import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { ActiveTimer, IActiveTimer } from '@/models/ActiveTimer'
import { TimeEntry } from '@/models/TimeEntry'
import { TimeTrackingSettings } from '@/models/TimeTrackingSettings'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { Organization } from '@/models/Organization'
import { applyRoundingRules } from '@/lib/utils'
import { notificationService } from '@/lib/notification-service'
import { isNotificationEnabled } from '@/lib/notification-utils'
import { zonedTimeToUtc } from 'date-fns-tz'

type EffectiveTimeTrackingSettings = {
  maxSessionHours?: number
  allowOvertime?: boolean
  maxDailyHours?: number
  maxWeeklyHours?: number
  requireApproval?: boolean
  requireDescription?: boolean
  roundingRules?: {
    enabled?: boolean
    increment?: number
    roundUp?: boolean
  }
  notifications?: {
    onTimerStart?: boolean
    onTimerStop?: boolean
    onOvertime?: boolean
    onApprovalNeeded?: boolean
    onTimeSubmitted?: boolean
  }
}

type StopTimerReason = 'manual' | 'auto_max_session'

const MINUTES_PER_HOUR = 60

const getIdString = (value: any): string | null => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null) {
    if ('_id' in value && value._id) return value._id.toString()
    if ('id' in value && value.id) return value.id.toString()
  }
  return value.toString?.() ?? null
}

const calculateCurrentDurationMinutes = (timer: IActiveTimer, referenceDate = new Date()) => {
  const baseDuration = (referenceDate.getTime() - timer.startTime.getTime()) / (1000 * 60)
  return Math.max(0, baseDuration - (timer.totalPausedDuration || 0))
}

async function getEffectiveTimeTrackingSettings(
  organizationId: string | null,
  projectId?: string | null
): Promise<EffectiveTimeTrackingSettings | null> {
  if (!organizationId) return null

  if (projectId) {
    const projectSettings = await TimeTrackingSettings.findOne({
      organization: organizationId,
      project: projectId
    })
    if (projectSettings) {
      const settings = projectSettings.toObject()
      // Also check project.settings.requireApproval as fallback if not set in TimeTrackingSettings
      if (settings.requireApproval === undefined || settings.requireApproval === null) {
        const project = await Project.findById(projectId).select('settings.requireApproval')
        if (project?.settings?.requireApproval !== undefined) {
          settings.requireApproval = project.settings.requireApproval
        }
      }
      return settings
    }
  }

  const orgSettings = await TimeTrackingSettings.findOne({
    organization: organizationId,
    project: null
  })
  if (orgSettings) {
    return orgSettings.toObject()
  }

  const organization = await Organization.findById(organizationId).select('settings.timeTracking')
  return organization?.settings?.timeTracking ?? null
}

interface StopTimerOptions {
  description?: string
  category?: string
  tags?: string[]
  reason?: StopTimerReason
  stopSettings?: EffectiveTimeTrackingSettings
  now?: Date
  userTimezone?: string
}

const buildNotificationPayload = (
  title: string,
  message: string,
  timeEntryId: string,
  projectUrl: string
) => ({
  type: 'time_tracking' as const,
  title,
  message,
  data: {
    entityType: 'time_entry' as const,
    entityId: timeEntryId,
    action: 'updated' as const,
    priority: 'low' as const,
    url: projectUrl
  },
  sendEmail: false,
  sendPush: false
})

async function stopTimerAndBuildResponse(
  activeTimer: IActiveTimer,
  options: StopTimerOptions = {}
): Promise<{ status: number; body: any }> {
  const organizationId = getIdString(activeTimer.organization)
  const projectId = getIdString(activeTimer.project)

  if (!organizationId) {
    return { status: 400, body: { error: 'Invalid organization for timer' } }
  }

  const stopSettings =
    options.stopSettings || (await getEffectiveTimeTrackingSettings(organizationId, projectId))

  if (!stopSettings) {
    return { status: 500, body: { error: 'Time tracking settings not found' } }
  }

  const now = options.now || new Date()
  const stopUserTimezone = options.userTimezone || 'UTC'

  // Convert end time to user's timezone
  const endTimeInUserTimezone = zonedTimeToUtc(now, stopUserTimezone)

  const descriptionSource = options.description ?? activeTimer.description ?? ''
  const finalDescription =
    typeof descriptionSource === 'string'
      ? descriptionSource.trim()
      : String(descriptionSource).trim()
  const requireDescription = stopSettings.requireDescription ?? false

  if (requireDescription && !finalDescription) {
    return { status: 400, body: { error: 'Description is required for time entries' } }
  }

  const totalDuration = calculateCurrentDurationMinutes(activeTimer, endTimeInUserTimezone)
  let finalDuration = totalDuration
  if (stopSettings.roundingRules?.enabled) {
    finalDuration = applyRoundingRules(totalDuration, {
      enabled: stopSettings.roundingRules.enabled ?? false,
      increment: stopSettings.roundingRules.increment ?? 15,
      roundUp: stopSettings.roundingRules.roundUp ?? true
    })
  }
  const hasTimeLogged = finalDuration > 0

  if (!hasTimeLogged) {
    await ActiveTimer.findByIdAndDelete(activeTimer._id)
    return {
      status: 200,
      body: {
        message:
          options.reason === 'auto_max_session'
            ? 'Timer automatically stopped after reaching max session hours.'
            : 'Timer stopped. No time was logged (0 minutes).',
        timeEntry: null,
        hasTimeLogged: false,
        duration: 0,
        notificationsSent: {
          timerStop: false,
          overtime: false,
          approvalNeeded: false,
          timeSubmitted: false
        },
        autoStopped: options.reason === 'auto_max_session',
        reason: options.reason ?? 'manual'
      }
    }
  }

  const requiresApproval = stopSettings.requireApproval ?? false
  const category = options.category ?? activeTimer.category
  const tags = options.tags ?? activeTimer.tags
  const projectValue = (activeTimer.project as any)?._id ?? activeTimer.project
  console.log('-8794651234455',projectValue);
  const taskValue = (activeTimer.task as any)?._id ?? activeTimer.task

  const timeEntry = new TimeEntry({
    user: activeTimer.user,
    organization: activeTimer.organization,
    project: projectValue,
    task: taskValue,
    description: finalDescription,
    startTime: activeTimer.startTime,
    endTime: endTimeInUserTimezone,
    duration: finalDuration,
    isBillable: activeTimer.isBillable,
    hourlyRate: activeTimer.hourlyRate,
    status: 'completed',
    category,
    tags,
    isApproved: !requiresApproval
  })

  await timeEntry.save()
  await ActiveTimer.findByIdAndDelete(activeTimer._id)

  const hoursLogged = finalDuration / MINUTES_PER_HOUR
  const isOvertime =
    stopSettings.allowOvertime === false &&
    (hoursLogged > (stopSettings.maxDailyHours || 8) ||
      hoursLogged > (stopSettings.maxWeeklyHours || 40))

  // Only send notifications if time was actually logged
  // Notifications should only be sent when timer stops with logged time
  const project = projectValue ? await Project.findById(projectValue).select('name settings') : null
  const projectName = project?.name || 'Unknown Project'
  const hoursFormatted = `${Math.floor(hoursLogged)}h ${Math.round((hoursLogged % 1) * 60)}m`
  const projectUrl = '/time-tracking/logs'
  
  // Check if the formatted duration is "0h 0m" (even if hasTimeLogged is true due to seconds)
  // We don't want to spam users with 0h 0m notifications
  const isZeroDurationDisplay = hoursFormatted === '0h 0m'

  const notificationsSent = {
    timerStop: false,
    overtime: false,
    approvalNeeded: false,
    timeSubmitted: false
  }

  // Only send notifications if time was logged (hasTimeLogged is already checked above)
  // Timer Stop notification - only when timer is stopped
  const timerStopEnabled = await isNotificationEnabled(
    organizationId,
    'onTimerStop',
    projectValue?.toString()
  )
  
  if (timerStopEnabled && hasTimeLogged && !isZeroDurationDisplay) {
    await notificationService.createNotification(
      activeTimer.user.toString(),
      organizationId,
      buildNotificationPayload(
        options.reason === 'auto_max_session' ? 'Timer Auto-Stopped' : 'Timer Stopped',
        options.reason === 'auto_max_session'
          ? `Timer auto-stopped for project "${projectName}" after reaching the session limit. Logged ${hoursFormatted}.`
          : `Timer stopped for project "${projectName}". Logged ${hoursFormatted}.`,
        timeEntry._id.toString(),
        projectUrl
      )
    )
    notificationsSent.timerStop = true
  }

  // Overtime notification - only if overtime detected
  if (isOvertime && hasTimeLogged) {
    const overtimeEnabled = await isNotificationEnabled(
      organizationId,
      'onOvertime',
      projectValue?.toString()
    )
    if (overtimeEnabled) {
      await notificationService.createNotification(
        activeTimer.user.toString(),
        organizationId,
        {
          type: 'time_tracking' as const,
          title: 'Overtime Alert',
          message: `Overtime detected: ${hoursFormatted} logged for project "${projectName}". This exceeds the daily/weekly limit.`,
          data: {
            entityType: 'time_entry' as const,
            entityId: timeEntry._id.toString(),
            action: 'updated' as const,
            priority: 'high' as const,
            url: projectUrl
          },
          sendEmail: false,
          sendPush: false
        }
      )
      notificationsSent.overtime = true
    }
  }

  // Approval Required  notification - only if approval is required AND time was logged
 
const projectRequiresApproval = project?.settings?.requireApproval === true;
  if (projectRequiresApproval && hasTimeLogged && !isZeroDurationDisplay) {
    const approvalNeededEnabled = await isNotificationEnabled(
      organizationId,
      'onApprovalNeeded',
      projectValue?.toString()
    )
    if (approvalNeededEnabled) {
      await notificationService.createNotification(
        activeTimer.user.toString(),
        organizationId,
        {
          type: 'time_tracking' as const,
          title: 'Approval Required',
          message: `Time entry for project "${projectName}" (${hoursFormatted}) requires approval.`,
          data: {
            entityType: 'time_entry' as const,
            entityId: timeEntry._id.toString(),
            action: 'updated' as const,
            priority: 'medium' as const,
            url: projectUrl
          },
          sendEmail: false,
          sendPush: false
        }
      )
      notificationsSent.approvalNeeded = true
    }
  }

  // Time Submitted notification - only if no approval required AND time was logged
  if (!requiresApproval && hasTimeLogged && !isZeroDurationDisplay) {
    const timeSubmittedEnabled = await isNotificationEnabled(
      organizationId,
      'onTimeSubmitted',
      projectValue?.toString()
    )
    if (timeSubmittedEnabled) {
      await notificationService.createNotification(
        activeTimer.user.toString(),
        organizationId,
        {
          type: 'time_tracking' as const,
          title: 'Time Submitted',
          message: `Time entry for project "${projectName}" (${hoursFormatted}) has been submitted successfully.`,
          data: {
            entityType: 'time_entry' as const,
            entityId: timeEntry._id.toString(),
            action: 'created' as const,
            priority: 'low' as const,
            url: projectUrl
          },
          sendEmail: false,
          sendPush: false
        }
      )
      notificationsSent.timeSubmitted = true
    }
  }

  return {
    status: 200,
    body: {
      message:
        options.reason === 'auto_max_session'
          ? 'Timer automatically stopped after reaching max session hours.'
          : 'Timer stopped successfully',
      timeEntry: timeEntry.toObject(),
      hasTimeLogged: true,
      duration: finalDuration,
      notificationsSent,
      autoStopped: options.reason === 'auto_max_session',
      reason: options.reason ?? 'manual'
    }
  }
}

async function enforceMaxSessionLimit(
  activeTimer: IActiveTimer,
  userTimezone: string = 'UTC'
): Promise<{ status: number; body: any } | null> {
  const organizationId = getIdString(activeTimer.organization)
  if (!organizationId) return null

  const projectId = getIdString(activeTimer.project)
  const stopSettings = await getEffectiveTimeTrackingSettings(organizationId, projectId)
  if (!stopSettings || stopSettings.allowOvertime !== false || !stopSettings.maxSessionHours) {
    return null
  }

  const now = new Date()
  const nowInUserTimezone = zonedTimeToUtc(now, userTimezone)
  const currentDuration = calculateCurrentDurationMinutes(activeTimer, nowInUserTimezone)
  if (currentDuration < stopSettings.maxSessionHours * MINUTES_PER_HOUR) {
    return null
  }

  return stopTimerAndBuildResponse(activeTimer, {
    stopSettings,
    now: nowInUserTimezone,
    reason: 'auto_max_session',
    userTimezone
  })
}

export async function GET(request: NextRequest) {
  try {
    await connectDB()
    
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const organizationId = searchParams.get('organizationId')
console.log('userId',userId);
console.log('organizationId',organizationId);
    if (!userId || !organizationId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // Get active timer for user
    const activeTimer = await ActiveTimer.findOne({
      user: userId,
      organization: organizationId
    }).populate('project', 'name').populate('task', 'title')

    if (!activeTimer) {
      return NextResponse.json({ activeTimer: null })
    }

    // Get user's timezone for timezone-aware operations
    const userForTimezone = await User.findById(userId).select('timezone preferences')
    const getUserTimezone = userForTimezone?.timezone || 'UTC'

    const autoStopResult = await enforceMaxSessionLimit(activeTimer, getUserTimezone)
    if (autoStopResult) {
      return NextResponse.json(
        {
          ...autoStopResult.body,
          activeTimer: null
        },
        { status: autoStopResult.status }
      )
    }

    // Calculate current duration using user's timezone
    const nowInUserTimezone = zonedTimeToUtc(new Date(), getUserTimezone)
    const currentDuration = calculateCurrentDurationMinutes(activeTimer, nowInUserTimezone)

    return NextResponse.json({
      activeTimer: {
        ...activeTimer.toObject(),
        currentDuration,
        isPaused: !!activeTimer.pausedAt
      },
      userTimezone: getUserTimezone
    })
  } catch (error) {
    console.error('Error fetching active timer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('Timer API POST called');
    
    await connectDB()
    
    const body = await request.json()
    console.log('Received body:', body)
    
    const { userId, organizationId, projectId, taskId, description, category, tags, isBillable, hourlyRate } = body
    
    console.log('Extracted fields:', { userId, organizationId, projectId, taskId, description })

    if (!userId || !organizationId || !projectId) {
      console.log('Missing required fields:', { 
        userId: !!userId, 
        organizationId: !!organizationId, 
        projectId: !!projectId
      })
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check if user already has an active timer
    const existingTimer = await ActiveTimer.findOne({
      user: userId,
      organization: organizationId
    })
console.log('existingTimer',existingTimer);

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
    
    console.log('Time tracking settings found:', {
      hasSettings: !!settings,
      settingsId: settings?._id?.toString(),
      isProjectSpecific: settings?.project?.toString() === projectId,
      projectId: settings?.project?.toString(),
      requestedProjectId: projectId,
      requireDescription: settings?.requireDescription,
      requireDescriptionType: typeof settings?.requireDescription,
      allowTimeTracking: settings?.allowTimeTracking,
      allSettingsKeys: settings ? Object.keys(settings.toObject()) : []
    })

    // If no TimeTrackingSettings exist, create default ones based on organization settings
    if (!settings) {
      const organization = await Organization.findById(organizationId)
      console.log('organization',organization);
      
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

    // Validate description if required
    // Explicitly check if requireDescription is true (handle both boolean true and undefined as false)
    const requireDescription = settings.requireDescription === true
    const hasDescription = description && typeof description === 'string' && description.trim().length > 0
    
    console.log('Description validation:', {
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

    // Get user's hourly rate and timezone
    const userForRate = await User.findById(userId)
    const finalHourlyRate = hourlyRate || userForRate?.billingRate || settings.defaultHourlyRate
    const postUserTimezone = userForRate?.timezone || 'UTC'

    // Create timer start time in user's timezone
    const now = new Date()
    const startTimeInUserTimezone = zonedTimeToUtc(now, postUserTimezone)

    // Create active timer
    const activeTimer = new ActiveTimer({
      user: userId,
      organization: organizationId,
      project: projectId,
      task: taskId,
      description: finalDescription,
      startTime: startTimeInUserTimezone,
      category,
      tags: tags || [],
      isBillable: isBillable ?? true,
      hourlyRate: finalHourlyRate,
      maxSessionHours: settings.maxSessionHours
    })
console.log('activeTimer',activeTimer);

    await activeTimer.save()

    // Send timer start notification if enabled
    const shouldNotifyStart = await isNotificationEnabled(organizationId, 'onTimerStart', projectId)
    if (shouldNotifyStart) {
      const project = await Project.findById(projectId).select('name')
      const projectName = project?.name || 'Unknown Project'
      
      await notificationService.createNotification(userId, organizationId, {
        type: 'time_tracking',
        title: 'Timer Started',
        message: `Timer started for project "${projectName}"${description ? `: ${description}` : ''}`,
        data: {
          entityType: 'time_entry',
          entityId: activeTimer._id.toString(),
          action: 'created',
          priority: 'low',
          url: `/time-tracking/timer`
        },
        sendEmail: false,
        sendPush: false
      })
    }

    // Get user's timezone for timezone-aware operations
    const userForStartTimezone = await User.findById(userId).select('timezone')
    const startResponseUserTimezone = userForStartTimezone?.timezone || 'UTC'

    return NextResponse.json({
      message: 'Timer started successfully',
      activeTimer: {
        ...activeTimer.toObject(),
        currentDuration: 0,
        isPaused: false
      },
      userTimezone: startResponseUserTimezone,
      notificationSent: shouldNotifyStart
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
    })

    if (!activeTimer) {
      return NextResponse.json({ error: 'No active timer found' }, { status: 404 })
    }

    // Get user's timezone
    const userForTimezone = await User.findById(userId).select('timezone')
    const userTimezonePUT = userForTimezone?.timezone || 'UTC'

    const autoStopResult = await enforceMaxSessionLimit(activeTimer, userTimezonePUT)
    if (autoStopResult) {
      return NextResponse.json(autoStopResult.body, { status: autoStopResult.status })
    }

    const now = new Date()
    const nowInUserTimezone = zonedTimeToUtc(now, userTimezonePUT)

    switch (action) {
      case 'pause':
        if (activeTimer.pausedAt) {
          return NextResponse.json({ error: 'Timer is already paused' }, { status: 400 })
        }
        activeTimer.pausedAt = nowInUserTimezone
        break

      case 'resume':
        if (!activeTimer.pausedAt) {
          return NextResponse.json({ error: 'Timer is not paused' }, { status: 400 })
        }
        const pausedDuration = (nowInUserTimezone.getTime() - activeTimer.pausedAt.getTime()) / (1000 * 60)
        activeTimer.totalPausedDuration += pausedDuration
        activeTimer.pausedAt = undefined
        break

      case 'stop': {
        const stopResult = await stopTimerAndBuildResponse(activeTimer, {
          description,
          category,
          tags,
          reason: 'manual',
          userTimezone: userTimezonePUT
        })
        return NextResponse.json(stopResult.body, { status: stopResult.status })
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

    // Calculate current duration using user's timezone
    const baseDuration = (nowInUserTimezone.getTime() - activeTimer.startTime.getTime()) / (1000 * 60)
    const currentDuration = Math.max(0, baseDuration - activeTimer.totalPausedDuration)

    // Get user's timezone for timezone-aware operations
    const userForUpdateTimezone = await User.findById(userId).select('timezone')
    const updateUserTimezone = userForUpdateTimezone?.timezone || 'UTC'

    return NextResponse.json({
      message: 'Timer updated successfully',
      activeTimer: {
        ...activeTimer.toObject(),
        currentDuration,
        isPaused: !!activeTimer.pausedAt
      },
      userTimezone: userTimezonePUT
    })
  } catch (error) {
    console.error('Error updating timer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
