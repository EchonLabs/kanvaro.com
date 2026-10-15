import cron from 'node-cron'
import { processTaskDeadlines } from '@/lib/cron/task-deadlines'
import { processTimerCleanup } from '@/lib/cron/timer-cleanup'
import { processEventReminders } from '@/lib/cron/event-reminders'
import { processNotificationCleanup } from '@/lib/cron/notification-cleanup'

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
  console.log('[Cron Scheduler] Initializing background schedulers...')

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

  // Timer Auto-Stop Cleanup - Every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    try {
      const result = await processTimerCleanup()
      console.log(
        `[Cron Scheduler] Timer Cleanup completed: ${result.summary.stopped} stopped, ${result.summary.skipped} skipped, ${result.summary.errors} errors`
      )
    } catch (err) {
      console.error('[Cron Scheduler] Error in Timer Cleanup cron job:', err)
    }
  })
  console.log('[Cron Scheduler] Timer Cleanup cron job registered: */10 * * * * (Every 10 minutes)')

  // Sprint Event Reminders - Every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await processEventReminders()
      console.log(
        `[Cron Scheduler] Event Reminders completed: ${result.results.email1Day} 1-day emails, ${result.results.notification1Hour} 1-hour notifications, ${result.results.notification15Min} 15-min notifications, ${result.results.errors.length} errors`
      )
    } catch (err) {
      console.error('[Cron Scheduler] Error in Event Reminders cron job:', err)
    }
  })
  console.log('[Cron Scheduler] Event Reminders cron job registered: */5 * * * * (Every 5 minutes)')

  // Notification Cleanup - Daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      const result = await processNotificationCleanup()
      console.log(
        `[Cron Scheduler] Notification Cleanup completed: ${result.totalDeleted} deleted across ${result.details.length} organizations`
      )
    } catch (err) {
      console.error('[Cron Scheduler] Error in Notification Cleanup cron job:', err)
    }
  })
  console.log('[Cron Scheduler] Notification Cleanup cron job registered: 0 2 * * * (Daily at 2:00 AM)')
}
