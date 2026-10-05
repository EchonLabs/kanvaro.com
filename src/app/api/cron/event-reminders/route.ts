import { NextRequest, NextResponse } from 'next/server'
import { processEventReminders } from '@/lib/cron/event-reminders'

// Main cron handler - should be called periodically (e.g., every 5 minutes)
export async function GET(req: NextRequest) {
  try {
    // Check for authorization (you can add a secret key check here)
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    // If CRON_SECRET is set, validate it
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
