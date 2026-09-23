import cron from 'node-cron'
import { processTaskDeadlines } from '@/lib/cron/task-deadlines'

declare global {
  var __kanvaro_cron_initialized: boolean | undefined
}

/**
 * Initialize background cron jobs for the application.
 * Runs in-process on persistent Node.js environments (Docker / Standalone server).
 */
export function initCronScheduler() {
  if (global.__kanvaro_cron_initialized) {
    console.log('[Cron Scheduler] Already initialized. Skipping.')
    return
  }

  global.__kanvaro_cron_initialized = true
  console.log('[Cron Scheduler] Initializing Task Deadlines scheduler...')

  // Task Deadlines & Overdue Checks - Every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await processTaskDeadlines()
      console.log(
        `[Cron Scheduler] Task Deadlines completed: ${result.results.dueSoon24h} due soon, ${result.results.overdue} overdue, ${result.results.errors.length} errors`
      )
    } catch (err) {
      console.error('[Cron Scheduler] Error in Task Deadlines cron job:', err)
    }
  })

  console.log('[Cron Scheduler] Task Deadlines cron job registered: */30 * * * * (Every 30 minutes)')
}
