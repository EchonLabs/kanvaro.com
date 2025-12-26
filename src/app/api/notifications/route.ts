import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/auth-utils'
import { notificationService } from '@/lib/notification-service'
import { Organization } from '@/models/Organization'
import { Notification } from '@/models/Notification'
import connectDB from '@/lib/db-config'

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    const unreadOnly = searchParams.get('unreadOnly') === 'true'
    const type = searchParams.get('type') || undefined

    const result = await notificationService.getUserNotifications(authResult.user.id, {
      limit,
      offset,
      unreadOnly,
      type
    })

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Failed to get notifications:', error)
    return NextResponse.json(
      { error: 'Failed to get notifications' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const body = await request.json()
    const { action, notificationId } = body

    await connectDB()

    if (action === 'markAllRead') {
      const success = await notificationService.markAllAsRead(authResult.user.id)
      return NextResponse.json({ success })
    }

    if (action === 'markAsRead' && notificationId) {
      const success = await notificationService.markAsRead(notificationId, authResult.user.id)
      return NextResponse.json({ success })
    }

    if (action === 'delete' && notificationId) {
      const success = await notificationService.deleteNotification(notificationId, authResult.user.id)
      return NextResponse.json({ success })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Failed to update notification:', error)
    return NextResponse.json(
      { error: 'Failed to update notification' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'cleanup') {
      // Get organization settings
      const organization = await Organization.findById(authResult.user.organization)
      if (!organization?.settings?.notifications?.autoCleanup) {
        return NextResponse.json({
          error: 'Auto cleanup is disabled for this organization'
        }, { status: 400 })
      }

      const retentionDays = organization.settings.notifications.retentionDays || 30
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

      // Delete old notifications for this organization
      const result = await Notification.deleteMany({
        organization: authResult.user.organization,
        createdAt: { $lt: cutoffDate }
      })

      return NextResponse.json({
        success: true,
        message: `Deleted ${result.deletedCount} old notifications older than ${retentionDays} days`
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Failed to cleanup notifications:', error)
    return NextResponse.json(
      { error: 'Failed to cleanup notifications' },
      { status: 500 }
    )
  }
}
