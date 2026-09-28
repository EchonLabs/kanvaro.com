import { NextRequest, NextResponse } from 'next/server'
import { processTimerCleanup } from '@/lib/cron/timer-cleanup'

/**
 * Cron job endpoint to automatically stop timers that exceed their maxSessionHours limit.
 * This should be called periodically (every 5-15 minutes recommended).
 * 
 * @description Checks all active timers and automatically stops those that have exceeded
 * their maxSessionHours limit when allowOvertime is false. Creates time entries with
 * durations capped at the maximum allowed session hours.
 * 
 * @security Optional Bearer token authentication via CRON_SECRET environment variable
 * 
 * @example Vercel Cron Setup
 * Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/timer-cleanup",
 *     "schedule": "0/10 * * * *"
 *   }]
 * }
 * 
 * @example External Cron Service
 * GET https://your-domain.com/api/cron/timer-cleanup
 * Header: Authorization: Bearer YOUR_CRON_SECRET
 * 
 * @returns JSON with summary of stopped, skipped, and failed timers
 */
export async function GET(request: NextRequest) {
  try {
    // Optional: Add authorization header check for security
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const data = await processTimerCleanup()

    return NextResponse.json(data)
  } catch (error) {
    console.error('Timer cleanup error:', error)
    return NextResponse.json(
      {
        error: 'Failed to cleanup timers',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
