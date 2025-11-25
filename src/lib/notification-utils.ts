import { Organization } from '@/models/Organization'
import { TimeTrackingSettings } from '@/models/TimeTrackingSettings'
import connectDB from './db-config'

export interface NotificationSettings {
  onTimerStart: boolean
  onTimerStop: boolean
  onOvertime: boolean
  onApprovalNeeded: boolean
  onTimeSubmitted: boolean
}

/**
 * Get notification settings for an organization
 * Checks project-specific settings first, then falls back to organization settings
 */
export async function getNotificationSettings(
  organizationId: string,
  projectId?: string | null
): Promise<NotificationSettings> {
  try {
    await connectDB()

    // Try to get project-specific settings first
    if (projectId) {
      const projectSettings = await TimeTrackingSettings.findOne({
        organization: organizationId,
        project: projectId
      })

      if (projectSettings?.notifications) {
        return projectSettings.notifications
      }
    }

    // Fall back to organization-level settings
    const orgSettings = await TimeTrackingSettings.findOne({
      organization: organizationId,
      project: null
    })

    if (orgSettings?.notifications) {
      return orgSettings.notifications
    }

    // Final fallback: get from Organization model
    const organization = await Organization.findById(organizationId)
    if (organization?.settings?.timeTracking?.notifications) {
      return organization.settings.timeTracking.notifications
    }

    // Default settings (all false except onTimerStop, onOvertime, onApprovalNeeded, onTimeSubmitted)
    return {
      onTimerStart: false,
      onTimerStop: true,
      onOvertime: true,
      onApprovalNeeded: true,
      onTimeSubmitted: true
    }
  } catch (error) {
    console.error('Error getting notification settings:', error)
    // Return default settings on error
    return {
      onTimerStart: false,
      onTimerStop: true,
      onOvertime: true,
      onApprovalNeeded: true,
      onTimeSubmitted: true
    }
  }
}

/**
 * Check if a specific notification type is enabled
 */
export async function isNotificationEnabled(
  organizationId: string,
  notificationType: keyof NotificationSettings,
  projectId?: string | null
): Promise<boolean> {
  const settings = await getNotificationSettings(organizationId, projectId)
  return settings[notificationType] ?? false
}

