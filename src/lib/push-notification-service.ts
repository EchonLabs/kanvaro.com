import { INotification } from '@/models/Notification'

export interface PushSubscription {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export interface PushNotificationPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  data?: Record<string, any>
  actions?: Array<{
    action: string
    title: string
    icon?: string
  }>
}

export class PushNotificationService {
  private static instance: PushNotificationService
  private vapidKeys: { publicKey: string; privateKey: string } | null = null

  private constructor() {
    this.initializeVapidKeys()
  }

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService()
    }
    return PushNotificationService.instance
  }

  private initializeVapidKeys() {
    // In production, these should be stored securely and generated once
    // For now, we'll use placeholder keys
    this.vapidKeys = {
      publicKey: process.env.VAPID_PUBLIC_KEY || 'placeholder-public-key',
      privateKey: process.env.VAPID_PRIVATE_KEY || 'placeholder-private-key'
    }
  }

  /**
   * Send push notification to a specific subscription
   */
  async sendToSubscription(
    subscription: PushSubscription,
    payload: PushNotificationPayload
  ): Promise<boolean> {
    try {
      const response = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.vapidKeys?.privateKey}`,
          'TTL': '86400' // 24 hours
        },
        body: JSON.stringify(payload)
      })

      return response.ok
    } catch (error) {
      console.error('Failed to send push notification:', error)
      return false
    }
  }

  /**
   * Send push notification to multiple subscriptions
   */
  async sendToSubscriptions(
    subscriptions: PushSubscription[],
    payload: PushNotificationPayload
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0
    let failed = 0

    const promises = subscriptions.map(async (subscription) => {
      const success = await this.sendToSubscription(subscription, payload)
      if (success) {
        sent++
      } else {
        failed++
      }
    })

    await Promise.all(promises)

    return { sent, failed }
  }

  /**
   * Send notification to user's push subscriptions
   */
  async sendNotificationToUser(
    userId: string,
    notification: INotification
  ): Promise<boolean> {
    try {
      // TODO: Get user's push subscriptions from database
      // For now, we'll return true as a placeholder
      console.log('Push notification would be sent to user:', userId, notification.title)
      return true
    } catch (error) {
      console.error('Failed to send push notification to user:', error)
      return false
    }
  }

  /**
   * Generate push notification payload from notification
   */
  generatePayload(notification: INotification): PushNotificationPayload {
    const icons: Record<string, string> = {
      task: '/icons/task.png',
      project: '/icons/project.png',
      team: '/icons/team.png',
      system: '/icons/system.png',
      budget: '/icons/budget.png',
      deadline: '/icons/deadline.png',
      reminder: '/icons/reminder.png',
      invitation: '/icons/invitation.png',
      time_tracking: '/icons/time-tracking.png',
      sprint_event: '/icons/sprint-event.png'
    }

    const priority = notification.data?.priority || 'medium'
    const badgeColors = {
      low: '#10b981',
      medium: '#3b82f6',
      high: '#f59e0b',
      critical: '#ef4444'
    }

    return {
      title: notification.title,
      body: notification.message,
      icon: icons[notification.type] || '/icons/notification.png',
      badge: `/icons/badge-${priority}.png`,
      data: {
        notificationId: (notification._id as any).toString(),
        type: notification.type,
        entityId: notification.data?.entityId,
        entityType: notification.data?.entityType,
        url: notification.data?.url,
        priority: priority,
        timestamp: notification.createdAt.toISOString()
      },
      actions: this.generateActions(notification)
    }
  }

  /**
   * Generate action buttons for push notification
   */
  private generateActions(notification: INotification): Array<{
    action: string
    title: string
    icon?: string
  }> {
    const actions = []

    // View action
    if (notification.data?.url) {
      actions.push({
        action: 'view',
        title: 'View',
        icon: '/icons/view.png'
      })
    }

    // Mark as read action
    actions.push({
      action: 'mark_read',
      title: 'Mark as Read',
      icon: '/icons/check.png'
    })

    // Dismiss action
    actions.push({
      action: 'dismiss',
      title: 'Dismiss',
      icon: '/icons/close.png'
    })

    return actions
  }

  /**
   * Get VAPID public key for client-side subscription
   */
  getVapidPublicKey(): string {
    return this.vapidKeys?.publicKey || ''
  }

  /**
   * Validate push subscription
   */
  validateSubscription(subscription: any): subscription is PushSubscription {
    return (
      subscription &&
      typeof subscription.endpoint === 'string' &&
      subscription.keys &&
      typeof subscription.keys.p256dh === 'string' &&
      typeof subscription.keys.auth === 'string'
    )
  }
}

export const pushNotificationService = PushNotificationService.getInstance()
