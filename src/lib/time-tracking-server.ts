import { ActiveTimer, IActiveTimer } from '@/models/ActiveTimer'
import { TimeEntry } from '@/models/TimeEntry'
import { TimeTrackingSettings } from '@/models/TimeTrackingSettings'
import { Project } from '@/models/Project'
import { Organization } from '@/models/Organization'
import { applyRoundingRules } from '@/lib/utils'
import { logActivity } from '@/lib/activity-logger'
import mongoose from 'mongoose'

const MINUTES_PER_HOUR = 60

export type EffectiveTimeTrackingSettings = {
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

export type StopTimerReason = 'manual' | 'auto_max_session' | 'auto_max_daily'

export const getIdString = (value: any): string | null => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null) {
    if ('_id' in value && value._id) return value._id.toString()
    if ('id' in value && value.id) return value.id.toString()
  }
  return value.toString?.() ?? null
}

export const calculateCurrentDurationMinutes = (timer: IActiveTimer, referenceDate = new Date()) => {
  const effectiveEnd = timer.pausedAt ? timer.pausedAt : referenceDate
  const baseDuration = (effectiveEnd.getTime() - timer.startTime.getTime()) / (1000 * 60)
  return Math.max(0, baseDuration - (timer.totalPausedDuration || 0))
}

export async function getEffectiveTimeTrackingSettings(
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

export async function getDailyHoursLogged(userId: string, organizationId: string): Promise<number> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const result = await TimeEntry.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        organization: new mongoose.Types.ObjectId(organizationId),
        startTime: { $gte: today, $lt: tomorrow }
      }
    },
    {
      $group: {
        _id: null,
        totalDuration: { $sum: '$duration' }
      }
    }
  ])

  const totalMinutes = result.length > 0 ? result[0].totalDuration : 0
  return totalMinutes / MINUTES_PER_HOUR
}

export interface StopTimerOptions {
  description?: string
  category?: string
  tags?: string[]
  reason?: StopTimerReason
  stopSettings?: EffectiveTimeTrackingSettings
  now?: Date
}

export async function stopTimerInternal(
  activeTimer: IActiveTimer,
  options: StopTimerOptions = {}
): Promise<{ success: boolean; timeEntry?: any; duration?: number; error?: string; alreadyStopped?: boolean; autoStopped?: boolean; reason?: string }> {
  const organizationId = getIdString(activeTimer.organization)
  const projectId = getIdString(activeTimer.project)

  if (!organizationId) {
    return { success: false, error: 'Invalid organization for timer' }
  }

  const stopSettings =
    options.stopSettings || (await getEffectiveTimeTrackingSettings(organizationId, projectId))

  if (!stopSettings) {
    return { success: false, error: 'Time tracking settings not found' }
  }

  const userId = getIdString(activeTimer.user)
  let endTime = options.now || new Date()

  // Finalize current pause period before computing duration
  if (activeTimer.pausedAt) {
    const currentPauseMinutes = (endTime.getTime() - activeTimer.pausedAt.getTime()) / (1000 * 60)
    activeTimer.totalPausedDuration = (activeTimer.totalPausedDuration || 0) + currentPauseMinutes
    activeTimer.pausedAt = undefined
  }
  
  const isAutoStop = options.reason === 'auto_max_session' || options.reason === 'auto_max_daily'
  let effectiveLimitMinutes: number | null = null
  
  if (isAutoStop) {
    const isSessionStop = options.reason === 'auto_max_session'
    const isDailyStop = options.reason === 'auto_max_daily'

    // Calculate session limit - always enforceable if it was the reason for stop
    const sessionLimitMinutes = stopSettings.maxSessionHours
      ? stopSettings.maxSessionHours * MINUTES_PER_HOUR
      : null

    // Calculate daily remaining limit - only enforceable if allowOvertime is false
    let dailyRemainingMinutes: number | null = null
    if (stopSettings.maxDailyHours && stopSettings.allowOvertime === false) {
      const uId = getIdString(activeTimer.user)
      const oId = getIdString(activeTimer.organization)
      if (uId && oId) {
        const dailyHoursLogged = await getDailyHoursLogged(uId, oId)
        const remainingHours = Math.max(0, stopSettings.maxDailyHours - dailyHoursLogged)
        dailyRemainingMinutes = remainingHours * MINUTES_PER_HOUR
      }
    }

    // Determine the effective limit
    if (isSessionStop) {
      effectiveLimitMinutes = sessionLimitMinutes
    } else if (isDailyStop) {
      effectiveLimitMinutes = dailyRemainingMinutes
    }

    if (effectiveLimitMinutes !== null) {
      const maxDurationMs = effectiveLimitMinutes * 60 * 1000
      const totalPausedMs = (activeTimer.totalPausedDuration || 0) * 60 * 1000
      endTime = new Date(activeTimer.startTime.getTime() + maxDurationMs + totalPausedMs)
    }
  }

  let totalDuration = calculateCurrentDurationMinutes(activeTimer, endTime)
  
  if (isAutoStop && effectiveLimitMinutes !== null && totalDuration > effectiveLimitMinutes) {
    totalDuration = effectiveLimitMinutes
  }
  
  let finalDuration = totalDuration
  if (stopSettings.roundingRules?.enabled) {
    finalDuration = applyRoundingRules(totalDuration, {
      enabled: stopSettings.roundingRules.enabled ?? false,
      increment: stopSettings.roundingRules.increment ?? 15,
      roundUp: stopSettings.roundingRules.roundUp ?? true
    })
  }

  if (finalDuration <= 0) {
    const deletedTimer = await ActiveTimer.findOneAndDelete({ _id: activeTimer._id })
    if (!deletedTimer) {
      return { success: true, alreadyStopped: true, duration: 0 }
    }
    return {
      success: true,
      duration: 0,
      autoStopped: isAutoStop,
      reason: options.reason ?? 'manual'
    }
  }

  const category = options.category ?? activeTimer.category
  const tags = options.tags ?? activeTimer.tags
  const projectValue = (activeTimer.project as any)?._id ?? activeTimer.project
  const taskValue = (activeTimer.task as any)?._id ?? activeTimer.task

  let requiresProjectApproval = false
  if (projectId) {
    const project = await Project.findById(projectId).select('settings.requireApproval')
    requiresProjectApproval = project?.settings?.requireApproval === true
  }

  const timeEntry = new TimeEntry({
    user: activeTimer.user,
    organization: activeTimer.organization,
    project: projectValue,
    task: taskValue,
    description: options.description ?? activeTimer.description ?? 'Auto-stopped timer',
    startTime: activeTimer.startTime,
    endTime,
    duration: finalDuration,
    isBillable: activeTimer.isBillable,
    hourlyRate: activeTimer.hourlyRate,
    status: 'completed',
    category,
    tags,
    isApproved: !requiresProjectApproval
  })

  const deletedTimer = await ActiveTimer.findOneAndDelete({ _id: activeTimer._id })
  if (!deletedTimer) {
    return { success: true, alreadyStopped: true, duration: 0 }
  }
  await timeEntry.save()

  // Log activity (non-blocking)
  const projectNameForLog = (activeTimer.project as any)?.name || 'Unknown Project'
  const taskTitleForLog = (activeTimer.task as any)?.title || undefined
  logActivity({
    organizationId: String(organizationId),
    userId: String(userId),
    action: 'time_entry_saved',
    entityType: 'timer',
    entityId: String(activeTimer._id),
    entityName: taskTitleForLog || projectNameForLog,
    projectId: projectId || undefined,
    projectName: projectNameForLog,
    details: {
      timeEntryId: String(timeEntry._id),
      taskTitle: taskTitleForLog,
      duration: finalDuration,
      description: timeEntry.description
    }
  }).catch(err => console.error('Failed to log time entry saved activity from timer internal:', err))

  return {
    success: true,
    timeEntry: timeEntry.toObject(),
    duration: finalDuration,
    autoStopped: isAutoStop,
    reason: options.reason ?? 'manual'
  }
}

export async function enforceTimerLimitsInternal(
  activeTimer: IActiveTimer
): Promise<{ success: boolean; result?: any } | null> {
  const organizationId = getIdString(activeTimer.organization)
  if (!organizationId) return null

  const projectId = getIdString(activeTimer.project)
  const stopSettings = await getEffectiveTimeTrackingSettings(organizationId, projectId)
  if (!stopSettings) return null

  const now = new Date()
  const currentDuration = calculateCurrentDurationMinutes(activeTimer, now)

  // Check max session hours limit - ALWAYS enforce if set
  if (stopSettings.maxSessionHours) {
    const sessionLimitMinutes = stopSettings.maxSessionHours * MINUTES_PER_HOUR
    if (currentDuration >= sessionLimitMinutes) {
      const result = await stopTimerInternal(activeTimer, {
        stopSettings,
        now,
        reason: 'auto_max_session'
      })
      return { success: true, result }
    }
  }

  // Check max daily hours limit - only enforce if allowOvertime is false
  if (stopSettings.maxDailyHours && stopSettings.allowOvertime === false) {
    const userId = getIdString(activeTimer.user)
    if (userId) {
      const dailyHoursLogged = await getDailyHoursLogged(userId, organizationId)
      const currentSessionHours = currentDuration / MINUTES_PER_HOUR
      const totalDailyHours = dailyHoursLogged + currentSessionHours

      if (totalDailyHours >= stopSettings.maxDailyHours) {
        const result = await stopTimerInternal(activeTimer, {
          stopSettings,
          now,
          reason: 'auto_max_daily'
        })
        return { success: true, result }
      }
    }
  }

  return null
}
