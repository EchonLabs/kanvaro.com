import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { ActiveTimer, IActiveTimer } from '@/models/ActiveTimer'
import { TimeEntry } from '@/models/TimeEntry'
import { TimeTrackingSettings } from '@/models/TimeTrackingSettings'
import { Organization } from '@/models/Organization'
import { Project } from '@/models/Project'
import { applyRoundingRules } from '@/lib/utils'
import { notificationService } from '@/lib/notification-service'
import { isNotificationEnabled } from '@/lib/notification-utils'

const MINUTES_PER_HOUR = 60

interface EffectiveTimeTrackingSettings {
  maxSessionHours?: number
  allowOvertime?: boolean
  requireApproval?: boolean
  roundingRules?: {
    enabled?: boolean
    increment?: number
    roundUp?: boolean
  }
  notifications?: {
    onTimerStop?: boolean
    onOvertime?: boolean
    onApprovalNeeded?: boolean
  }
}

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

async function stopExpiredTimer(activeTimer: IActiveTimer): Promise<{
  success: boolean
  timerId: string
  duration?: number
  error?: string
}> {
  const timerId = activeTimer._id.toString()
  
  try {
    const organizationId = getIdString(activeTimer.organization)
    const projectId = getIdString(activeTimer.project)
    const taskId = getIdString(activeTimer.task)
    
    if (!organizationId) {
      return { success: false, timerId, error: 'Invalid organization ID' }
    }

    // Get effective settings
    const settings = await getEffectiveTimeTrackingSettings(organizationId, projectId)
    if (!settings || settings.allowOvertime !== false || !settings.maxSessionHours) {
      return { success: false, timerId, error: 'Timer does not require enforcement' }
    }

    const now = new Date()
    const currentDuration = calculateCurrentDurationMinutes(activeTimer, now)

    // Check if timer has exceeded max session hours
    if (currentDuration < settings.maxSessionHours * MINUTES_PER_HOUR) {
      return { success: false, timerId, error: 'Timer has not exceeded limit' }
    }

    // Calculate the exact end time based on max session hours
    const maxDurationMs = settings.maxSessionHours * MINUTES_PER_HOUR * 60 * 1000
    const totalPausedMs = (activeTimer.totalPausedDuration || 0) * 60 * 1000
    const endTime = new Date(activeTimer.startTime.getTime() + maxDurationMs + totalPausedMs)

    // Calculate final duration (capped at maxSessionHours)
    let finalDuration = settings.maxSessionHours * MINUTES_PER_HOUR

    // Apply rounding rules if configured
    if (settings.roundingRules?.enabled) {
      finalDuration = applyRoundingRules(finalDuration, {
        enabled: true,
        increment: settings.roundingRules.increment || 15,
        roundUp: settings.roundingRules.roundUp ?? true
      })
    }

    // Get project and task info for notifications
    const project = await Project.findById(projectId).select('name')
    const projectName = project?.name || 'Unknown Project'

    // Check if approval is required
    const requiresApproval = settings.requireApproval ?? false
    let requiresProjectApproval = false
    if (projectId) {
      const projectDoc = await Project.findById(projectId).select('settings.requireApproval')
      requiresProjectApproval = projectDoc?.settings?.requireApproval === true
    }

    // Create time entry
    const timeEntry = new TimeEntry({
      user: activeTimer.user,
      organization: activeTimer.organization,
      project: projectId,
      task: taskId,
      description: activeTimer.description || 'Auto-stopped timer',
      startTime: activeTimer.startTime,
      endTime: endTime,
      duration: finalDuration,
      isBillable: activeTimer.isBillable,
      hourlyRate: activeTimer.hourlyRate,
      status: 'completed',
      category: activeTimer.category,
      tags: activeTimer.tags || [],
      isApproved: !(requiresApproval || requiresProjectApproval)
    })

    await timeEntry.save()

    // Delete the active timer
    await ActiveTimer.findByIdAndDelete(activeTimer._id)

    // Format duration for notifications
    const hours = Math.floor(finalDuration / 60)
    const minutes = Math.round(finalDuration % 60)
    const hoursFormatted = `${hours}h ${minutes}m`
    const hasTimeLogged = finalDuration > 0
    const isZeroDurationDisplay = hoursFormatted === '0h 0m'

    // Send notifications (only if time was logged)
    if (hasTimeLogged && !isZeroDurationDisplay) {
      const projectUrl = `/projects/${projectId}`

      // Timer Stop notification
      const timerStopEnabled = await isNotificationEnabled(
        organizationId,
        'onTimerStop',
        projectId
      )
      
      if (timerStopEnabled) {
        await notificationService.createNotification(
          activeTimer.user.toString(),
          organizationId,
          {
            type: 'time_tracking' as const,
            title: 'Timer Auto-Stopped',
            message: `Timer auto-stopped for project "${projectName}" after reaching the session limit. Logged ${hoursFormatted}.`,
            data: {
              entityType: 'time_entry' as const,
              entityId: timeEntry._id.toString(),
              action: 'created' as const,
              priority: 'medium' as const,
              url: projectUrl
            },
            sendEmail: false,
            sendPush: false
          }
        )
      }

      // Approval notification (if approval is required)
      if (requiresApproval || requiresProjectApproval) {
        const approvalEnabled = await isNotificationEnabled(
          organizationId,
          'onApprovalNeeded',
          projectId
        )

        if (approvalEnabled) {
          await notificationService.createNotification(
            activeTimer.user.toString(),
            organizationId,
            {
              type: 'time_tracking' as const,
              title: 'Time Entry Requires Approval',
              message: `Your time entry for "${projectName}" (${hoursFormatted}) requires approval.`,
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
        }
      }
    }

    return {
      success: true,
      timerId,
      duration: finalDuration
    }
  } catch (error) {
    console.error(`Error stopping expired timer ${timerId}:`, error)
    return {
      success: false,
      timerId,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Cron job endpoint to automatically stop timers that exceed their maxSessionHours limit.
 * This should be called periodically (every 5-15 minutes recommended).
 * 
 * @description Checks all active timers and automatically stops those that have exceeded
 * their maxSessionHours limit when allowOvertime is false. Creates time entries with
 * durations capped at the maximum allowed session hours.
 * 
 * @security Optional Bearer token authentication via CRON_SECRET environment variable
 * 
 * @example Vercel Cron Setup
 * Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/timer-cleanup",
 *     "schedule": "&#42;/10 &#42; &#42; &#42; &#42;"
 *   }]
 * }
 * 
 * @example External Cron Service
 * GET https://your-domain.com/api/cron/timer-cleanup
 * Header: Authorization: Bearer YOUR_CRON_SECRET
 * 
 * @returns JSON with summary of stopped, skipped, and failed timers
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB()

    // Optional: Add authorization header check for security
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Find all active timers (don't use .lean() as we need document methods)
    const activeTimers = await ActiveTimer.find({})
      .populate('project', 'name')
      .populate('user', 'firstName lastName')

    if (!activeTimers || activeTimers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active timers found',
        results: []
      })
    }

    // Process each timer
    const results = []
    let stoppedCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (const timer of activeTimers) {
      try {
        const organizationId = getIdString(timer.organization)
        const projectId = getIdString(timer.project)

        if (!organizationId) {
          errorCount++
          results.push({
            timerId: timer._id.toString(),
            error: 'Invalid organization ID',
            status: 'error'
          })
          continue
        }

        // Get settings to check if timer needs enforcement
        const settings = await getEffectiveTimeTrackingSettings(organizationId, projectId)
        
        // Skip timers that don't need enforcement
        if (!settings || settings.allowOvertime !== false || !settings.maxSessionHours) {
          skippedCount++
          continue
        }

        // Check if timer has exceeded the limit
        const currentDuration = calculateCurrentDurationMinutes(timer, new Date())
        const maxDurationMinutes = settings.maxSessionHours * MINUTES_PER_HOUR

        if (currentDuration < maxDurationMinutes) {
          skippedCount++
          continue
        }

        // Stop the expired timer
        const result = await stopExpiredTimer(timer)
        
        if (result.success) {
          stoppedCount++
          results.push({
            timerId: result.timerId,
            user: (timer.user as any)?.firstName && (timer.user as any)?.lastName 
              ? `${(timer.user as any).firstName} ${(timer.user as any).lastName}` 
              : 'Unknown User',
            project: (timer.project as any)?.name || 'Unknown Project',
            duration: result.duration,
            status: 'stopped'
          })
        } else {
          errorCount++
          results.push({
            timerId: result.timerId,
            error: result.error,
            status: 'error'
          })
        }
      } catch (error) {
        errorCount++
        const timerId = timer?._id?.toString() || 'unknown'
        console.error(`Error processing timer ${timerId}:`, error)
        results.push({
          timerId,
          error: error instanceof Error ? error.message : 'Processing error',
          status: 'error'
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Timer cleanup completed. Stopped: ${stoppedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`,
      summary: {
        totalChecked: activeTimers.length,
        stopped: stoppedCount,
        skipped: skippedCount,
        errors: errorCount
      },
      results
    })
  } catch (error) {
    console.error('Timer cleanup error:', error)
    return NextResponse.json(
      {
        error: 'Failed to cleanup timers',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
