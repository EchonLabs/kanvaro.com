/**
 * Next's process-start hook. Deliberately thin — the schedulers themselves are
 * normal, testable modules.
 */
export async function register(): Promise<void> {
  // Runs in the Edge runtime and during `next build` too; neither should tick.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  // Background cron jobs (task deadlines, timers, event reminders, cleanup).
  const { initCronScheduler } = await import('@/lib/cron-scheduler')
  initCronScheduler()

  // Stand-up job scheduler (promotion, reminders, missed).
  const { schedulerIsEnabled, startScheduler } = await import('@/lib/standup/jobs/scheduler')
  if (!schedulerIsEnabled()) return

  startScheduler()
}
