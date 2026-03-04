import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { ActiveTimer } from '@/models/ActiveTimer'
import { TimeEntry } from '@/models/TimeEntry'
import { TimeTrackingSettings } from '@/models/TimeTrackingSettings'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { Organization } from '@/models/Organization'

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
    }).populate('project', 'name').populate('task', 'title')

    if (!activeTimer) {
      return NextResponse.json({ activeTimer: null })
    }

    // Calculate current duration
    const now = new Date()
    const baseDuration = Math.round((now.getTime() - activeTimer.startTime.getTime()) / (1000 * 60))
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
    await connectDB()
    
    const body = await request.json()
    const { userId, organizationId, projectId, taskId, description, category, tags, isBillable, hourlyRate } = body

    if (!userId || !organizationId || !projectId || !description) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check if user already has an active timer
    const existingTimer = await ActiveTimer.findOne({
      user: userId,
      organization: organizationId
    })

    if (existingTimer) {
      return NextResponse.json({ error: 'User already has an active timer' }, { status: 400 })
    }

    // Get project and check if time tracking is allowed
    const project = await Project.findById(projectId)
    if (!project || !project.settings.allowTimeTracking) {
      return NextResponse.json({ error: 'Time tracking not allowed for this project' }, { status: 403 })
    }

    // Get time tracking settings
    let settings = await TimeTrackingSettings.findOne({
      organization: organizationId,
      project: projectId
    }) || await TimeTrackingSettings.findOne({
      organization: organizationId,
      project: null
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

    if (!settings.allowTimeTracking) {
      return NextResponse.json({ error: 'Time tracking not enabled' }, { status: 403 })
    }

    // Get user's hourly rate if not provided
    const user = await User.findById(userId)
    const finalHourlyRate = hourlyRate || user?.billingRate || settings.defaultHourlyRate

    // Create active timer
    const activeTimer = new ActiveTimer({
      user: userId,
      organization: organizationId,
      project: projectId,
      task: taskId,
      description,
      startTime: new Date(),
      category,
      tags: tags || [],
      isBillable: isBillable ?? true,
      hourlyRate: finalHourlyRate,
      maxSessionHours: settings.maxSessionHours
    })

    await activeTimer.save()

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
        const pausedDuration = Math.round((now.getTime() - activeTimer.pausedAt.getTime()) / (1000 * 60))
        activeTimer.totalPausedDuration += pausedDuration
        activeTimer.pausedAt = undefined
        break

      case 'stop':
        // Create time entry
        const baseDuration = Math.round((now.getTime() - activeTimer.startTime.getTime()) / (1000 * 60))
        const totalDuration = Math.max(0, baseDuration - activeTimer.totalPausedDuration)

        const timeEntry = new TimeEntry({
          user: activeTimer.user,
          organization: activeTimer.organization,
          project: activeTimer.project,
          task: activeTimer.task,
          description: description || activeTimer.description,
          startTime: activeTimer.startTime,
          endTime: now,
          duration: totalDuration,
          isBillable: activeTimer.isBillable,
          hourlyRate: activeTimer.hourlyRate,
          status: 'completed',
          category: category || activeTimer.category,
          tags: tags || activeTimer.tags
        })

        await timeEntry.save()

        // Delete active timer
        await ActiveTimer.findByIdAndDelete(activeTimer._id)

        return NextResponse.json({
          message: 'Timer stopped successfully',
          timeEntry: timeEntry.toObject()
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
    const baseDuration = Math.round((now.getTime() - activeTimer.startTime.getTime()) / (1000 * 60))
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
