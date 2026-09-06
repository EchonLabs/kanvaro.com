/**
 * Next's process-start hook. Deliberately thin — the scheduler itself is a
 * normal, testable module.
 */
export async function register(): Promise<void> {
  // Runs in the Edge runtime and during `next build` too; neither should tick.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  const { schedulerIsEnabled, startScheduler } = await import('@/lib/standup/jobs/scheduler')
  if (!schedulerIsEnabled()) return

  startScheduler()
}
