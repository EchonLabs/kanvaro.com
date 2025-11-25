import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { ActiveTimer } from '@/models/ActiveTimer'
import { TimeEntry } from '@/models/TimeEntry'
import { TimeTrackingSettings } from '@/models/TimeTrackingSettings'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { Organization } from '@/models/Organization'
import { applyRoundingRules } from '@/lib/utils'
import { notificationService } from '@/lib/notification-service'
import { isNotificationEnabled } from '@/lib/notification-utils'

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

    // Calculate current duration
    const now = new Date()
    const baseDuration = (now.getTime() - activeTimer.startTime.getTime()) / (1000 * 60)
    const currentDuration = Math.max(0, baseDuration - activeTimer.totalPausedDuration)

    return NextResponse.json({
      activeTimer: {
        ...activeTimer.toObject(),
        currentDuration,
        isPaused: !!activeTimer.pausedAt
      }
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

    // Get user's hourly rate if not provided
    const user = await User.findById(userId)
    const finalHourlyRate = hourlyRate || user?.billingRate || settings.defaultHourlyRate

    // Create active timer
    const activeTimer = new ActiveTimer({
      user: userId,
      organization: organizationId,
      project: projectId,
      task: taskId,
      description: finalDescription,
      startTime: new Date(),
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

    return NextResponse.json({
      message: 'Timer started successfully',
      activeTimer: {
        ...activeTimer.toObject(),
        currentDuration: 0,
        isPaused: false
      },
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

    const now = new Date()

    switch (action) {
      case 'pause':
        if (activeTimer.pausedAt) {
          return NextResponse.json({ error: 'Timer is already paused' }, { status: 400 })
        }
        activeTimer.pausedAt = now
        break

      case 'resume':
        if (!activeTimer.pausedAt) {
          return NextResponse.json({ error: 'Timer is not paused' }, { status: 400 })
        }
        const pausedDuration = (now.getTime() - activeTimer.pausedAt.getTime()) / (1000 * 60)
        activeTimer.totalPausedDuration += pausedDuration
        activeTimer.pausedAt = undefined
        break

      case 'stop':
        // Get time tracking settings for rounding
        let stopSettings = await TimeTrackingSettings.findOne({
          organization: activeTimer.organization,
          project: activeTimer.project
        }) || await TimeTrackingSettings.findOne({
          organization: activeTimer.organization,
          project: null
        })

        // If no TimeTrackingSettings exist, get from organization
        if (!stopSettings) {
          const organization = await Organization.findById(activeTimer.organization)
          if (organization) {
            stopSettings = {
              roundingRules: organization.settings.timeTracking.roundingRules,
              maxDailyHours: organization.settings.timeTracking.maxDailyHours,
              maxWeeklyHours: organization.settings.timeTracking.maxWeeklyHours,
              allowOvertime: organization.settings.timeTracking.allowOvertime,
              requireApproval: organization.settings.timeTracking.requireApproval,
              requireDescription: organization.settings.timeTracking.requireDescription
            } as any
          }
        }

        // Validate description if required
        const finalDescription = description || activeTimer.description
        const requireDescription = stopSettings?.requireDescription ?? false
        const hasDescription = finalDescription && typeof finalDescription === 'string' && finalDescription.trim().length > 0
        
        if (requireDescription && !hasDescription) {
          return NextResponse.json({ error: 'Description is required for time entries' }, { status: 400 })
        }

        // Create time entry
        const baseDuration = (now.getTime() - activeTimer.startTime.getTime()) / (1000 * 60)
        const totalDuration = Math.max(0, baseDuration - activeTimer.totalPausedDuration)

        // Apply rounding rules if enabled
        let finalDuration = totalDuration
        if (stopSettings?.roundingRules?.enabled) {
          finalDuration = applyRoundingRules(totalDuration, stopSettings.roundingRules)
        }

        // Check if time was actually logged (must be > 0)
        const hasTimeLogged = finalDuration > 0

        // If no time was logged, just delete the timer without creating a time entry
        if (!hasTimeLogged) {
          await ActiveTimer.findByIdAndDelete(activeTimer._id)
          return NextResponse.json({
            message: 'Timer stopped. No time was logged (0 minutes).',
            timeEntry: null,
            hasTimeLogged: false,
            duration: 0,
            notificationsSent: {
              timerStop: false,
              overtime: false,
              approvalNeeded: false,
              timeSubmitted: false
            }
          })
        }

        // Check for overtime
        const hoursLogged = finalDuration / 60
        const isOvertime = !stopSettings?.allowOvertime && (
          hoursLogged > (stopSettings?.maxDailyHours || 8) ||
          hoursLogged > (stopSettings?.maxWeeklyHours || 40)
        )

        // Determine status based on approval requirement
        const requiresApproval = stopSettings?.requireApproval ?? false
        const entryStatus = requiresApproval ? 'pending' : 'completed'

        const timeEntry = new TimeEntry({
          user: activeTimer.user,
          organization: activeTimer.organization,
          project: activeTimer.project,
          task: activeTimer.task,
          description: finalDescription,
          startTime: activeTimer.startTime,
          endTime: now,
          duration: finalDuration,
          isBillable: activeTimer.isBillable,
          hourlyRate: activeTimer.hourlyRate,
          status: entryStatus,
          category: category || activeTimer.category,
          tags: tags || activeTimer.tags
        })

        await timeEntry.save()

        // Delete active timer
        await ActiveTimer.findByIdAndDelete(activeTimer._id)

        // Send notifications based on settings (only reached if time was logged)
        const notifications = {
          timerStop: await isNotificationEnabled(activeTimer.organization.toString(), 'onTimerStop', activeTimer.project?.toString()),
          overtime: await isNotificationEnabled(activeTimer.organization.toString(), 'onOvertime', activeTimer.project?.toString()),
          approvalNeeded: await isNotificationEnabled(activeTimer.organization.toString(), 'onApprovalNeeded', activeTimer.project?.toString()),
          timeSubmitted: await isNotificationEnabled(activeTimer.organization.toString(), 'onTimeSubmitted', activeTimer.project?.toString())
        }

        const project = await Project.findById(activeTimer.project).select('name')
        const projectName = project?.name || 'Unknown Project'
        const hoursFormatted = `${Math.floor(hoursLogged)}h ${Math.round((hoursLogged % 1) * 60)}m`

        const notificationsSent = {
          timerStop: false,
          overtime: false,
          approvalNeeded: false,
          timeSubmitted: false
        }

        // Timer stop notification
        if (notifications.timerStop) {
          await notificationService.createNotification(
            activeTimer.user.toString(),
            activeTimer.organization.toString(),
            {
              type: 'time_tracking',
              title: 'Timer Stopped',
              message: `Timer stopped for project "${projectName}". Logged ${hoursFormatted}.`,
              data: {
                entityType: 'time_entry',
                entityId: timeEntry._id.toString(),
                action: 'updated',
                priority: 'low',
                url: `/time-tracking/logs`
              },
              sendEmail: false,
              sendPush: false
            }
          )
          notificationsSent.timerStop = true
        }

        // Overtime notification
        if (isOvertime && notifications.overtime) {
          await notificationService.createNotification(
            activeTimer.user.toString(),
            activeTimer.organization.toString(),
            {
              type: 'time_tracking',
              title: 'Overtime Alert',
              message: `Overtime detected: ${hoursFormatted} logged for project "${projectName}". This exceeds the daily/weekly limit.`,
              data: {
                entityType: 'time_entry',
                entityId: timeEntry._id.toString(),
                action: 'updated',
                priority: 'high',
                url: `/time-tracking/logs`
              },
              sendEmail: false,
              sendPush: false
            }
          )
          notificationsSent.overtime = true
        }

        // Approval needed notification
        if (requiresApproval && notifications.approvalNeeded) {
          await notificationService.createNotification(
            activeTimer.user.toString(),
            activeTimer.organization.toString(),
            {
              type: 'time_tracking',
              title: 'Approval Required',
              message: `Time entry for project "${projectName}" (${hoursFormatted}) requires approval.`,
              data: {
                entityType: 'time_entry',
                entityId: timeEntry._id.toString(),
                action: 'updated',
                priority: 'medium',
                url: `/time-tracking/logs`
              },
              sendEmail: false,
              sendPush: false
            }
          )
          notificationsSent.approvalNeeded = true
        }

        // Time submitted notification (only if not requiring approval, as approval needed covers that case)
        if (!requiresApproval && notifications.timeSubmitted) {
          await notificationService.createNotification(
            activeTimer.user.toString(),
            activeTimer.organization.toString(),
            {
              type: 'time_tracking',
              title: 'Time Submitted',
              message: `Time entry for project "${projectName}" (${hoursFormatted}) has been submitted successfully.`,
              data: {
                entityType: 'time_entry',
                entityId: timeEntry._id.toString(),
                action: 'created',
                priority: 'low',
                url: `/time-tracking/logs`
              },
              sendEmail: false,
              sendPush: false
            }
          )
          notificationsSent.timeSubmitted = true
        }

        return NextResponse.json({
          message: 'Timer stopped successfully',
          timeEntry: timeEntry.toObject(),
          hasTimeLogged,
          duration: finalDuration,
          notificationsSent
        })

      case 'update':
        if (description) activeTimer.description = description
        if (category) activeTimer.category = category
        if (tags) activeTimer.tags = tags
        break

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    await activeTimer.save()

    // Calculate current duration
    const baseDuration = (now.getTime() - activeTimer.startTime.getTime()) / (1000 * 60)
    const currentDuration = Math.max(0, baseDuration - activeTimer.totalPausedDuration)

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
