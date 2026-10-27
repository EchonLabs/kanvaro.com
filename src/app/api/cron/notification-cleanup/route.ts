import { NextRequest, NextResponse } from 'next/server'
import { processNotificationCleanup } from '@/lib/cron/notification-cleanup'
import { isCronRequestAuthorised } from '@/lib/standup/jobs/auth'

export async function GET(request: NextRequest) {
  try {
    // Enforce-if-set (plan CRON-1): when CRON_SECRET is absent this is a no-op and
    // behaviour is unchanged, so an upgrade needs no environment edit.
    if (!isCronRequestAuthorised(request.headers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await processNotificationCleanup()

    return NextResponse.json(data)
  } catch (error) {
    console.error('Notification cleanup error:', error)
    return NextResponse.json(
      { error: 'Failed to cleanup notifications' },
      { status: 500 }
    )
  }
}
