import { NextRequest, NextResponse } from 'next/server'
import { processTaskDeadlines } from '@/lib/cron/task-deadlines'
import { isCronRequestAuthorised } from '@/lib/standup/jobs/auth'
import { resolveBaseUrl } from '@/lib/request-base-url'

export async function GET(req: NextRequest) {
  try {
    // Same enforce-if-set check as the other cron routes (plan CRON-1), using
    // the shared timing-safe comparison.
    if (!isCronRequestAuthorised(req.headers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Reminder emails link back into the app. resolveBaseUrl prefers the
    // configured NEXT_PUBLIC_APP_URL, so a spoofed Host header cannot point
    // those links at another site.
    const data = await processTaskDeadlines(resolveBaseUrl(req))

    return NextResponse.json({
      success: true,
      message: 'Task deadline reminders processed',
      ...data
    })
  } catch (error: any) {
    console.error('Error processing task deadline reminders:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
