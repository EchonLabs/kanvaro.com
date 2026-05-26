export async function register() {
  // Only run on the Node.js server runtime, not in the Edge runtime or browser
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerDailyStandupJob } = await import(
      '@/lib/services/standup-scheduler.service'
    )
    try {
      await registerDailyStandupJob()
      console.log('[standup] Daily EOD analysis job registered')
    } catch (err) {
      // Don't crash the server if Redis isn't available yet
      console.warn('[standup] Failed to register daily job (Redis may not be ready):', err)
    }
  }
}
