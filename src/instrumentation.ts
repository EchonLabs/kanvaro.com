/**
 * Next.js Instrumentation Hook
 * Executes once on server startup when deployed in Node.js runtime (Docker / Standalone server).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE === 'phase-production-build') {
      return
    }
    const { initCronScheduler } = await import('@/lib/cron-scheduler')
    initCronScheduler()
  }
}
