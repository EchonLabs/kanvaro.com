import { NextRequest, NextResponse } from 'next/server'
import { processTaskDeadlines } from '@/lib/cron/task-deadlines'

export async function GET(req: NextRequest) {
  try {
    // Authorization check
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Determine base URL if available from request headers
    const host = req.headers.get('host') || req.headers.get('x-forwarded-host') || ''
    const proto = req.headers.get('x-forwarded-proto') || 'https'
    const baseUrl = host ? `${proto}://${host}` : undefined

    const data = await processTaskDeadlines(baseUrl)

    return NextResponse.json({
      success: true,
      message: 'Task deadline reminders processed',
      ...data
    })
  } catch (error: any) {
    console.error('Error processing task deadline reminders:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}