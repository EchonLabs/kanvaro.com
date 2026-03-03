import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Organization } from '@/models/Organization'
import { Notification } from '@/models/Notification'
import { getOrgConfigs } from '@/lib/config'
import '@/models/registry'

export async function GET(request: NextRequest) {
  try {
    let totalDeleted = 0
    const allResults: any[] = []

    // Iterate over all configured orgs
    const orgs = getOrgConfigs()
    for (const orgConfig of orgs) {
      await connectDB(orgConfig.id)
      console.log(`[cron/notification-cleanup] Processing org ${orgConfig.id} (db: ${orgConfig.database.database})`)

    // Get all organizations with auto cleanup enabled
    const organizations = await Organization.find({
      'settings.notifications.autoCleanup': true
    }).select('settings.notifications name')

    const results: any[] = []

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

    allResults.push(...results)

    } // end for-each orgConfig

    return NextResponse.json({
      success: true,
      message: `Notification cleanup completed. Deleted ${totalDeleted} old notifications across ${allResults.length} organizations`,
      details: allResults
    })
  } catch (error) {
    console.error('Notification cleanup error:', error)
    return NextResponse.json(
      { error: 'Failed to cleanup notifications' },
      { status: 500 }
    )
  }
}
