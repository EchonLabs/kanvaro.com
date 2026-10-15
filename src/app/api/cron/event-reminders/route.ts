import { NextRequest, NextResponse } from 'next/server'
import { processEventReminders } from '@/lib/cron/event-reminders'
import { isCronRequestAuthorised } from '@/lib/standup/jobs/auth'

// Main cron handler - should be called periodically (e.g., every 5 minutes)
export async function GET(req: NextRequest) {
  try {
    // Enforce-if-set (plan CRON-1): when CRON_SECRET is absent this is a no-op and
    // behaviour is unchanged, so an upgrade needs no environment edit.
    if (!isCronRequestAuthorised(req.headers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await processEventReminders()

    return NextResponse.json({
      success: true,
      message: 'Event reminders processed',
      ...data
    })
  } catch (error) {
    console.error('Error processing event reminders:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST endpoint for manual trigger or webhook
export async function POST(req: NextRequest) {
  return GET(req)
}
