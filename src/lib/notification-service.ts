import { Notification, INotification } from '@/models/Notification'
import { User } from '@/models/User'
import { emailService } from './email/EmailService'
import { broadcastNotification, broadcastToUsers } from './notification-broadcaster'
import connectDB from './db-config'

export interface NotificationData {
  type: 'task' | 'project' | 'team' | 'system' | 'budget' | 'deadline' | 'reminder' | 'invitation' | 'time_tracking'
  title: string
  message: string
  data?: {
    entityType?: 'task' | 'project' | 'epic' | 'sprint' | 'story' | 'user' | 'budget' | 'time_entry'
    entityId?: string
    action?: 'created' | 'updated' | 'deleted' | 'assigned' | 'completed' | 'overdue' | 'reminder'
    priority?: 'low' | 'medium' | 'high' | 'critical'
    url?: string
    projectName?: string
    metadata?: Record<string, any>
  }
  sendEmail?: boolean
  sendPush?: boolean
}

export class NotificationService {
  private static instance: NotificationService

  private constructor() { }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }



  /**
   * Create and send a notification to a single user
   */
  async createNotification(
    userId: string,
    organizationId: string,
    notificationData: NotificationData
  ): Promise<INotification | null> {
    try {
      await connectDB()

      // Get user preferences
      const user = await User.findById(userId).select('preferences')
      if (!user) {
        console.error('User not found:', userId)
        return null
      }

      const { email, inApp, push } = user.preferences.notifications

      // Create notification record
      const notification = new Notification({
        user: userId,
        organization: organizationId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data,
        sentVia: {
          inApp: inApp,
          email: email && (notificationData.sendEmail ?? false),
          push: push && (notificationData.sendPush ?? false)
        }
      })

      await notification.save()

      // Broadcast notification via SSE for real-time delivery
      broadcastNotification(userId, notification.toObject())

      // Send email if enabled
      if (email && (notificationData.sendEmail ?? false)) {
        await this.sendEmailNotification(userId, notification)
      }

      // Send push notification if enabled
      if (push && (notificationData.sendPush ?? false)) {
        await this.sendPushNotification(userId, notification)
      }

      return notification
    } catch (error) {
      console.error('Failed to create notification:', error)
      return null
    }
  }

  /**
   * Create and send notifications to multiple users
   */
  async createBulkNotifications(
    userIds: string[],
    organizationId: string,
    notificationData: NotificationData
  ): Promise<INotification[]> {
    const notifications: INotification[] = []

    for (const userId of userIds) {
      const notification = await this.createNotification(userId, organizationId, notificationData)
      if (notification) {
        notifications.push(notification)
      }
    }

    return notifications
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(
    userId: string,
    options: {
      limit?: number
      offset?: number
      unreadOnly?: boolean
      type?: string
    } = {}
  ): Promise<{ notifications: INotification[], total: number, unreadCount: number }> {
    try {
      await connectDB()

      const { limit = 20, offset = 0, unreadOnly = false, type } = options

      const query: any = { user: userId }
      if (unreadOnly) {
        query.isRead = false
      }
      if (type) {
        query.type = type
      }

      const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(query)
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip(offset)
          .lean(),
        Notification.countDocuments(query),
        Notification.countDocuments({ user: userId, isRead: false })
      ])

      return { notifications: notifications as any, total, unreadCount }
    } catch (error) {
      console.error('Failed to get user notifications:', error)
      return { notifications: [], total: 0, unreadCount: 0 }
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      await connectDB()

      const result = await Notification.updateOne(
        { _id: notificationId, user: userId, isRead: false },
        { isRead: true, readAt: new Date() }
      )

      return result.modifiedCount > 0
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
      return false
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<boolean> {
    try {
      await connectDB()

      const result = await Notification.updateMany(
        { user: userId, isRead: false },
        { isRead: true, readAt: new Date() }
      )

      return result.modifiedCount > 0
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error)
      return false
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    try {
      await connectDB()

      const result = await Notification.deleteOne({ _id: notificationId, user: userId })
      return result.deletedCount > 0
    } catch (error) {
      console.error('Failed to delete notification:', error)
      return false
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(userId: string, notification: INotification): Promise<void> {
    try {
      const user = await User.findById(userId).select('email firstName lastName')
      if (!user) return

      const emailHtml = this.generateNotificationEmail(notification, user.firstName || 'User')

      await emailService.sendEmail({
        to: user.email,
        subject: notification.title,
        html: emailHtml
      })

      // Update notification to mark email as sent
      await Notification.updateOne(
        { _id: notification._id },
        { emailSent: true }
      )
    } catch (error) {
      console.error('Failed to send email notification:', error)
    }
  }

  /**
   * Send push notification
   */
  private async sendPushNotification(userId: string, notification: INotification): Promise<void> {
    try {
      // TODO: Implement push notification service (Web Push API, FCM, etc.)
      // For now, we'll just log it
      console.log('Push notification would be sent:', {
        userId,
        title: notification.title,
        message: notification.message
      })

      // Update notification to mark push as sent
      await Notification.updateOne(
        { _id: notification._id },
        { pushSent: true }
      )
    } catch (error) {
      console.error('Failed to send push notification:', error)
    }
  }

  /**
   * Generate email HTML for notification
   */
  private generateNotificationEmail(notification: INotification, userName: string): string {
    const priorityColors = {
      low: '#10b981',
      medium: '#3b82f6',
      high: '#f59e0b',
      critical: '#ef4444'
    }

    const priority = notification.data?.priority || 'medium'
    const color = priorityColors[priority]

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${notification.title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8fafc;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            position: relative;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .notification-content {
            background: #f8fafc;
            border-left: 4px solid ${color};
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        .notification-details {
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 15px;
            margin: 20px 0;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 14px;
        }
        .detail-label {
            font-weight: 600;
            color: #6b7280;
        }
        .detail-value {
            color: #111827;
        }
        .button {
            display: inline-block;
            background: ${color};
            color: #ffffff !important;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            margin: 20px 0;
            text-align: center;
            border: none;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;
            font-size: 14px;
            line-height: 1.2;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }
        .button:hover {
            background: ${this.adjustColor(color, -20)};
            color: #ffffff !important;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
        }
        .priority-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            background: ${color}20;
            color: ${color};
            margin-left: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${notification.title} <span class="priority-badge">${priority}</span></h1>
        </div>

        <p>Hello ${userName},</p>
        
        <div class="notification-content">
            <p>${notification.message}</p>
        </div>

        ${notification.data ? `
        <div class="notification-details">
            ${notification.data.entityType ? `<div class="detail-row"><span class="detail-label">Type:</span> <span class="detail-value">${notification.data.entityType.charAt(0).toUpperCase() + notification.data.entityType.slice(1)}</span></div>` : ''}
            ${notification.data.projectName ? `<div class="detail-row"><span class="detail-label">Project:</span> <span class="detail-value">${notification.data.projectName}</span></div>` : ''}
            <div class="detail-row"><span class="detail-label">Priority:</span> <span class="detail-value">${priority.charAt(0).toUpperCase() + priority.slice(1)}</span></div>
            <div class="detail-row"><span class="detail-label">Time:</span> <span class="detail-value">${new Date(notification.createdAt || Date.now()).toLocaleString()}</span></div>
        </div>
        ` : ''}

        ${notification.data?.url ? `
        <div style="text-align: center;">
            <a href="${notification.data.url}" class="button">View Details</a>
        </div>
        ` : ''}

        <div class="footer">
            <p>This notification was sent by your Kanvaro team</p>
            <p>You can manage your notification preferences in your account settings</p>
        </div>
    </div>
</body>
</html>
    `
  }

  /**
   * Create task-related notifications
   */
  async notifyTaskUpdate(
    taskId: string,
    action: 'created' | 'updated' | 'assigned' | 'completed' | 'overdue',
    assignedUserId: string,
    organizationId: string,
    taskTitle: string,
    projectName?: string,
    baseUrl?: string
  ): Promise<void> {
    const messages = {
      created: `A new task "${taskTitle}" has been created${projectName ? ` in project "${projectName}"` : ''}`,
      updated: `Task "${taskTitle}" has been updated${projectName ? ` in project "${projectName}"` : ''}`,
      assigned: `You have been assigned to task "${taskTitle}"${projectName ? ` in project "${projectName}"` : ''}`,
      completed: `Task "${taskTitle}" has been completed${projectName ? ` in project "${projectName}"` : ''}`,
      overdue: `Task "${taskTitle}" is overdue${projectName ? ` in project "${projectName}"` : ''}`
    }

    await this.createNotification(assignedUserId, organizationId, {
      type: 'task',
      title: `Task ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      message: messages[action],
      data: {
        entityType: 'task',
        entityId: taskId,
        action,
        priority: action === 'overdue' ? 'high' : 'medium',
        url: `${baseUrl}/login?redirect=/tasks/${taskId}`,
        projectName: projectName
      },
      sendEmail: true,
      sendPush: true
    })
  }

  /**
   * Create project-related notifications
   */
  async notifyProjectUpdate(
    projectId: string,
    action: 'created' | 'updated' | 'deadline_approaching' | 'completed',
    userIds: string[],
    organizationId: string,
    projectName: string,
    baseUrl: string
  ): Promise<void> {
    const messages = {
      created: `New project "${projectName}" has been created`,
      updated: `Project "${projectName}" has been updated`,
      deadline_approaching: `Project "${projectName}" deadline is approaching`,
      completed: `Project "${projectName}" has been completed`
    }

    await this.createBulkNotifications(userIds, organizationId, {
      type: 'project',
      title: `Project ${action.replace('_', ' ').charAt(0).toUpperCase() + action.replace('_', ' ').slice(1)}`,
      message: messages[action],
      data: {
        entityType: 'project',
        entityId: projectId,
        action: action === 'deadline_approaching' ? 'reminder' : action,
        priority: action === 'deadline_approaching' ? 'high' : 'medium',
        url: `${baseUrl}/login?redirect=/projects/${projectId}`,
        projectName: projectName
      },
      sendEmail: true,
      sendPush: true
    })
  }

  /**
   * Create team-related notifications
   */
  async notifyTeamUpdate(
    action: 'member_joined' | 'member_left' | 'role_changed',
    userIds: string[],
    organizationId: string,
    memberName: string,
    details?: string
  ): Promise<void> {
    const messages = {
      member_joined: `${memberName} has joined the team`,
      member_left: `${memberName} has left the team`,
      role_changed: `${memberName}'s role has been changed${details ? `: ${details}` : ''}`
    }

    await this.createBulkNotifications(userIds, organizationId, {
      type: 'team',
      title: 'Team Update',
      message: messages[action],
      data: {
        entityType: 'user',
        action: action === 'member_joined' ? 'created' : action === 'member_left' ? 'deleted' : 'updated',
        priority: 'low'
      },
      sendEmail: false,
      sendPush: false
    })
  }

  /**
   * Notify user when added to a project team
   */
  async notifyProjectTeamMemberAdded(
    projectId: string,
    userIds: string[],
    organizationId: string,
    projectName: string,
    baseUrl: string
  ): Promise<void> {
    await this.createBulkNotifications(userIds, organizationId, {
      type: 'project',
      title: 'Added to Project',
      message: `You have been added as a member to the project – ${projectName}.`,
      data: {
        entityType: 'project',
        entityId: projectId,
        action: 'assigned',
        priority: 'medium',
        url: `${baseUrl}/login?redirect=/projects/${projectId}`,
        projectName: projectName
      },
      sendEmail: true,
      sendPush: true
    })
  }

  /**
   * Create budget-related notifications
   */
  async notifyBudgetUpdate(
    projectId: string,
    action: 'budget_exceeded' | 'budget_warning' | 'budget_updated',
    userIds: string[],
    organizationId: string,
    projectName: string,
    budgetInfo?: string,
    baseUrl?: string
  ): Promise<void> {
    const messages = {
      budget_exceeded: `Project "${projectName}" has exceeded its budget${budgetInfo ? `: ${budgetInfo}` : ''}`,
      budget_warning: `Project "${projectName}" is approaching its budget limit${budgetInfo ? `: ${budgetInfo}` : ''}`,
      budget_updated: `Budget for project "${projectName}" has been updated${budgetInfo ? `: ${budgetInfo}` : ''}`
    }

    await this.createBulkNotifications(userIds, organizationId, {
      type: 'budget',
      title: 'Budget Alert',
      message: messages[action],
      data: {
        entityType: 'budget',
        entityId: projectId,
        action: action === 'budget_exceeded' ? 'overdue' : action === 'budget_warning' ? 'reminder' : 'updated',
        priority: action === 'budget_exceeded' ? 'critical' : 'high',
        url: `${baseUrl}/login?redirect=/projects/${projectId}`,
        projectName: projectName
      },
      sendEmail: true,
      sendPush: true
    })
  }

  /**
   * Helper method to adjust color brightness for hover effects
   */
  private adjustColor(color: string, amount: number): string {
    // Remove # if present
    const usePound = color[0] === '#'
    const col = usePound ? color.slice(1) : color

    // Convert to RGB
    const num = parseInt(col, 16)
    let r = (num >> 16) + amount
    let g = (num >> 8 & 0x00FF) + amount
    let b = (num & 0x0000FF) + amount

    // Ensure values stay within 0-255
    r = Math.max(0, Math.min(255, r))
    g = Math.max(0, Math.min(255, g))
    b = Math.max(0, Math.min(255, b))

    // Convert back to hex with proper padding
    const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
    return (usePound ? '#' : '') + hex
  }
}

export const notificationService = NotificationService.getInstance()
