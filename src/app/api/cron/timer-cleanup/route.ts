import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { ActiveTimer, IActiveTimer } from '@/models/ActiveTimer'
import { TimeEntry } from '@/models/TimeEntry'
import { TimeTrackingSettings } from '@/models/TimeTrackingSettings'
import { Organization } from '@/models/Organization'
import { Project } from '@/models/Project'
import { applyRoundingRules } from '@/lib/utils'

import mongoose from 'mongoose'

import { 
  getEffectiveTimeTrackingSettings, 
  getDailyHoursLogged, 
  calculateCurrentDurationMinutes, 
  stopTimerInternal, 
  getIdString 
} from '@/lib/time-tracking-server'

const MINUTES_PER_HOUR = 60

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
    if (!settings) {
      return { success: false, timerId, error: 'Settings not found' }
    }

    // Determine if we should enforce limits
    const hasSessionLimit = !!settings.maxSessionHours
    const hasDailyLimit = !!settings.maxDailyHours && settings.allowOvertime === false

    if (!hasSessionLimit && !hasDailyLimit) {
      return { success: false, timerId, error: 'Timer does not require enforcement (no session limit and overtime allowed)' }
    }

    // Need at least one limit to enforce
    if (!settings.maxSessionHours && !settings.maxDailyHours) {
      return { success: false, timerId, error: 'No limits configured' }
    }

    const now = new Date()

    // Finalize current pause period before computing duration
    if (activeTimer.pausedAt) {
      const currentPauseMinutes = (now.getTime() - activeTimer.pausedAt.getTime()) / (1000 * 60)
      activeTimer.totalPausedDuration = (activeTimer.totalPausedDuration || 0) + currentPauseMinutes
      activeTimer.pausedAt = undefined
    }

    const currentDuration = calculateCurrentDurationMinutes(activeTimer, now)
    let shouldStop = false
    let reason = 'session'

    // Check max session hours
    if (settings.maxSessionHours) {
      if (currentDuration >= settings.maxSessionHours * MINUTES_PER_HOUR) {
        shouldStop = true
        reason = 'session'
      }
    }

    // Check max daily hours
    const userId = getIdString(activeTimer.user)
    if (!shouldStop && settings.maxDailyHours && userId) {
      const dailyHoursLogged = await getDailyHoursLogged(userId, organizationId)
      const currentSessionHours = currentDuration / MINUTES_PER_HOUR
      if (dailyHoursLogged + currentSessionHours >= settings.maxDailyHours) {
        shouldStop = true
        reason = 'daily'
      }
    }

    if (!shouldStop) {
      return { success: false, timerId, error: 'Timer has not exceeded limit' }
    }

    // Calculate the effective limit (min of session limit and remaining daily hours)
    let effectiveLimitMinutes: number | null = null
    if (settings.maxSessionHours) {
      effectiveLimitMinutes = settings.maxSessionHours * MINUTES_PER_HOUR
    }
    if (settings.maxDailyHours && userId) {
      const dailyHoursLogged = await getDailyHoursLogged(userId, organizationId)
      const dailyRemainingMinutes = Math.max(0, (settings.maxDailyHours - dailyHoursLogged)) * MINUTES_PER_HOUR
      if (effectiveLimitMinutes !== null) {
        effectiveLimitMinutes = Math.min(effectiveLimitMinutes, dailyRemainingMinutes)
      } else {
        effectiveLimitMinutes = dailyRemainingMinutes
      }
    }

    // Calculate end time based on effective limit
    const maxDurationMs = (effectiveLimitMinutes ?? currentDuration) * 60 * 1000
    const totalPausedMs = (activeTimer.totalPausedDuration || 0) * 60 * 1000
    const endTime = new Date(activeTimer.startTime.getTime() + maxDurationMs + totalPausedMs)

    // Calculate final duration (capped at effective limit)
    let finalDuration = effectiveLimitMinutes ?? currentDuration
    if (finalDuration > currentDuration) finalDuration = currentDuration

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

    // Atomically claim the timer — only the first caller succeeds
    const deletedTimer = await ActiveTimer.findOneAndDelete({ _id: activeTimer._id })
    if (!deletedTimer) {
      // Another process (user stop, GET auto-stop) already handled this timer
      return { success: false, timerId, error: 'Timer already stopped by another process' }
    }
    await timeEntry.save()

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
        
        if (!settings) {
          skippedCount++
          continue
        }

        // Check if we have any limits to enforce
        // maxSessionHours is always enforced if set
        // maxDailyHours is only enforced if allowOvertime is false
        const hasSessionLimit = !!settings.maxSessionHours
        const hasDailyLimit = !!settings.maxDailyHours && settings.allowOvertime === false

        if (!hasSessionLimit && !hasDailyLimit) {
          skippedCount++
          continue
        }

        // Check if timer has exceeded any limit
        const currentDuration = calculateCurrentDurationMinutes(timer, new Date())
        let exceeded = false

        // Check session limit
        if (settings.maxSessionHours) {
          const maxDurationMinutes = settings.maxSessionHours * MINUTES_PER_HOUR
          if (currentDuration >= maxDurationMinutes) {
            exceeded = true
          }
        }

        // Check daily limit
        if (!exceeded && settings.maxDailyHours) {
          const timerId = getIdString(timer.user)
          if (timerId) {
            const dailyHoursLogged = await getDailyHoursLogged(timerId, organizationId)
            const currentSessionHours = currentDuration / MINUTES_PER_HOUR
            if (dailyHoursLogged + currentSessionHours >= settings.maxDailyHours) {
              exceeded = true
            }
          }
        }

        if (!exceeded) {
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
