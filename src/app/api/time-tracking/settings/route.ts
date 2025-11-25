import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { TimeTrackingSettings } from '@/models/TimeTrackingSettings'
import { Organization } from '@/models/Organization'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

export async function GET(request: NextRequest) {
  try {
    await connectDB()
    
    // Authenticate user
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const organizationId = user.organization

    // Get query params for optional projectId
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    // Get time tracking settings - check project-specific first, then organization-wide
    let settings = null

    if (projectId) {
      settings = await TimeTrackingSettings.findOne({
        organization: organizationId,
        project: projectId
      })
    }

    if (!settings) {
      settings = await TimeTrackingSettings.findOne({
        organization: organizationId,
        project: null
      })
    }

    // If no TimeTrackingSettings exist, fallback to organization settings and create default
    if (!settings) {
      const organization = await Organization.findById(organizationId)
      
      if (!organization) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
      }

      // Return organization settings (for backwards compatibility)
      // But also create TimeTrackingSettings document for future use
      const orgTimeTracking = organization.settings?.timeTracking || {}
      
      // Create default TimeTrackingSettings based on organization settings
      settings = new TimeTrackingSettings({
        organization: organizationId,
        project: null,
        allowTimeTracking: orgTimeTracking.allowTimeTracking ?? true,
        allowManualTimeSubmission: orgTimeTracking.allowManualTimeSubmission ?? true,
        requireApproval: orgTimeTracking.requireApproval ?? false,
        allowBillableTime: orgTimeTracking.allowBillableTime ?? true,
        defaultHourlyRate: orgTimeTracking.defaultHourlyRate ?? 0,
        maxDailyHours: orgTimeTracking.maxDailyHours ?? 12,
        maxWeeklyHours: orgTimeTracking.maxWeeklyHours ?? 60,
        maxSessionHours: orgTimeTracking.maxSessionHours ?? 8,
        allowOvertime: orgTimeTracking.allowOvertime ?? false,
        requireDescription: orgTimeTracking.requireDescription ?? false,
        requireCategory: orgTimeTracking.requireCategory ?? false,
        allowFutureTime: orgTimeTracking.allowFutureTime ?? false,
        allowPastTime: orgTimeTracking.allowPastTime ?? true,
        pastTimeLimitDays: orgTimeTracking.pastTimeLimitDays ?? 30,
        roundingRules: orgTimeTracking.roundingRules || {
          enabled: false,
          increment: 15,
          roundUp: true
        },
        notifications: orgTimeTracking.notifications || {
          onTimerStart: false,
          onTimerStop: true,
          onOvertime: true,
          onApprovalNeeded: true,
          onTimeSubmitted: true
        }
      })

      await settings.save()
    }

    // Return settings as plain object
    return NextResponse.json({
      settings: {
        allowTimeTracking: settings.allowTimeTracking,
        allowManualTimeSubmission: settings.allowManualTimeSubmission,
        requireApproval: settings.requireApproval,
        allowBillableTime: settings.allowBillableTime,
        defaultHourlyRate: settings.defaultHourlyRate ?? 0,
        maxDailyHours: settings.maxDailyHours,
        maxWeeklyHours: settings.maxWeeklyHours,
        maxSessionHours: settings.maxSessionHours,
        allowOvertime: settings.allowOvertime,
        requireDescription: settings.requireDescription,
        requireCategory: settings.requireCategory,
        allowFutureTime: settings.allowFutureTime,
        allowPastTime: settings.allowPastTime,
        pastTimeLimitDays: settings.pastTimeLimitDays,
        roundingRules: settings.roundingRules,
        notifications: settings.notifications
      }
    })
  } catch (error) {
    console.error('Error fetching time tracking settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch time tracking settings' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    await connectDB()
    
    // Authenticate user
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const organizationId = user.organization

    // Check permissions
    const canUpdate = await PermissionService.hasPermission(user.id, Permission.ORGANIZATION_UPDATE)
    if (!canUpdate) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update time tracking settings' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const settings = body.settings

    if (!settings) {
      return NextResponse.json({ error: 'Settings data is required' }, { status: 400 })
    }

    // Find or create organization-level TimeTrackingSettings
    const updateFields: any = {
      organization: organizationId,
      project: null
    }

    // Update all fields explicitly
    if (settings.allowTimeTracking !== undefined) updateFields.allowTimeTracking = settings.allowTimeTracking
    if (settings.allowManualTimeSubmission !== undefined) updateFields.allowManualTimeSubmission = settings.allowManualTimeSubmission
    if (settings.requireApproval !== undefined) updateFields.requireApproval = settings.requireApproval
    if (settings.allowBillableTime !== undefined) updateFields.allowBillableTime = settings.allowBillableTime
    if (settings.defaultHourlyRate !== undefined) updateFields.defaultHourlyRate = settings.defaultHourlyRate
    if (settings.maxDailyHours !== undefined) updateFields.maxDailyHours = settings.maxDailyHours
    if (settings.maxWeeklyHours !== undefined) updateFields.maxWeeklyHours = settings.maxWeeklyHours
    if (settings.maxSessionHours !== undefined) updateFields.maxSessionHours = settings.maxSessionHours
    if (settings.allowOvertime !== undefined) updateFields.allowOvertime = settings.allowOvertime
    if (settings.requireDescription !== undefined) updateFields.requireDescription = settings.requireDescription
    if (settings.requireCategory !== undefined) updateFields.requireCategory = settings.requireCategory
    if (settings.allowFutureTime !== undefined) updateFields.allowFutureTime = settings.allowFutureTime
    if (settings.allowPastTime !== undefined) updateFields.allowPastTime = settings.allowPastTime
    if (settings.pastTimeLimitDays !== undefined) updateFields.pastTimeLimitDays = settings.pastTimeLimitDays
    if (settings.roundingRules !== undefined) updateFields.roundingRules = settings.roundingRules
    if (settings.notifications !== undefined) updateFields.notifications = settings.notifications

    // Update or create the TimeTrackingSettings document
    const timeTrackingSettings = await TimeTrackingSettings.findOneAndUpdate(
      {
        organization: organizationId,
        project: null
      },
      {
        $set: updateFields
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    )

    // Sync back to Organization document for backwards compatibility
    const organization = await Organization.findById(organizationId)
    if (organization) {
      if (!organization.settings) {
        organization.settings = {}
      }
      if (!organization.settings.timeTracking) {
        organization.settings.timeTracking = {}
      }

      // Update organization settings with the new values
      if (settings.allowTimeTracking !== undefined) organization.settings.timeTracking.allowTimeTracking = settings.allowTimeTracking
      if (settings.allowManualTimeSubmission !== undefined) organization.settings.timeTracking.allowManualTimeSubmission = settings.allowManualTimeSubmission
      if (settings.requireApproval !== undefined) organization.settings.timeTracking.requireApproval = settings.requireApproval
      if (settings.allowBillableTime !== undefined) organization.settings.timeTracking.allowBillableTime = settings.allowBillableTime
      if (settings.defaultHourlyRate !== undefined) organization.settings.timeTracking.defaultHourlyRate = settings.defaultHourlyRate
      if (settings.maxDailyHours !== undefined) organization.settings.timeTracking.maxDailyHours = settings.maxDailyHours
      if (settings.maxWeeklyHours !== undefined) organization.settings.timeTracking.maxWeeklyHours = settings.maxWeeklyHours
      if (settings.maxSessionHours !== undefined) organization.settings.timeTracking.maxSessionHours = settings.maxSessionHours
      if (settings.allowOvertime !== undefined) organization.settings.timeTracking.allowOvertime = settings.allowOvertime
      if (settings.requireDescription !== undefined) organization.settings.timeTracking.requireDescription = settings.requireDescription
      if (settings.requireCategory !== undefined) organization.settings.timeTracking.requireCategory = settings.requireCategory
      if (settings.allowFutureTime !== undefined) organization.settings.timeTracking.allowFutureTime = settings.allowFutureTime
      if (settings.allowPastTime !== undefined) organization.settings.timeTracking.allowPastTime = settings.allowPastTime
      if (settings.pastTimeLimitDays !== undefined) organization.settings.timeTracking.pastTimeLimitDays = settings.pastTimeLimitDays
      if (settings.roundingRules !== undefined) organization.settings.timeTracking.roundingRules = settings.roundingRules
      if (settings.notifications !== undefined) organization.settings.timeTracking.notifications = settings.notifications

      await organization.save()
    }

    console.log('TimeTrackingSettings updated successfully:', {
      allowFutureTime: timeTrackingSettings.allowFutureTime,
      requireDescription: timeTrackingSettings.requireDescription,
      requireApproval: timeTrackingSettings.requireApproval,
      allowOvertime: timeTrackingSettings.allowOvertime
    })

    return NextResponse.json({
      success: true,
      message: 'Time tracking settings updated successfully',
      settings: {
        allowTimeTracking: timeTrackingSettings.allowTimeTracking,
        allowManualTimeSubmission: timeTrackingSettings.allowManualTimeSubmission,
        requireApproval: timeTrackingSettings.requireApproval,
        allowBillableTime: timeTrackingSettings.allowBillableTime,
        defaultHourlyRate: timeTrackingSettings.defaultHourlyRate ?? 0,
        maxDailyHours: timeTrackingSettings.maxDailyHours,
        maxWeeklyHours: timeTrackingSettings.maxWeeklyHours,
        maxSessionHours: timeTrackingSettings.maxSessionHours,
        allowOvertime: timeTrackingSettings.allowOvertime,
        requireDescription: timeTrackingSettings.requireDescription,
        requireCategory: timeTrackingSettings.requireCategory,
        allowFutureTime: timeTrackingSettings.allowFutureTime,
        allowPastTime: timeTrackingSettings.allowPastTime,
        pastTimeLimitDays: timeTrackingSettings.pastTimeLimitDays,
        roundingRules: timeTrackingSettings.roundingRules,
        notifications: timeTrackingSettings.notifications
      }
    })
  } catch (error) {
    console.error('Error updating time tracking settings:', error)
    return NextResponse.json(
      { error: 'Failed to update time tracking settings' },
      { status: 500 }
    )
  }
}
