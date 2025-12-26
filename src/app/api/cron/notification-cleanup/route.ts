import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Organization } from '@/models/Organization'
import { Notification } from '@/models/Notification'

export async function GET(request: NextRequest) {
  try {
    await connectDB()

    // Get all organizations with auto cleanup enabled
    const organizations = await Organization.find({
      'settings.notifications.autoCleanup': true
    }).select('settings.notifications name')

    let totalDeleted = 0
    const results = []

    for (const org of organizations) {
      const retentionDays = org.settings.notifications?.retentionDays || 30
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

      // Delete old notifications for this organization
      const result = await Notification.deleteMany({
        organization: org._id,
        createdAt: { $lt: cutoffDate }
      })

      if (result.deletedCount > 0) {
        totalDeleted += result.deletedCount
        results.push({
          organization: org.name,
          deletedCount: result.deletedCount,
          retentionDays
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Notification cleanup completed. Deleted ${totalDeleted} old notifications across ${results.length} organizations`,
      details: results
    })
  } catch (error) {
    console.error('Notification cleanup error:', error)
    return NextResponse.json(
      { error: 'Failed to cleanup notifications' },
      { status: 500 }
    )
  }
}
