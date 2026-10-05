import { NextRequest, NextResponse } from 'next/server'
import { processNotificationCleanup } from '@/lib/cron/notification-cleanup'

export async function GET(request: NextRequest) {
  try {
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
