// Module-level in-flight promise map to deduplicate simultaneous active timer calls
const inFlightTimerPromises = new Map<string, Promise<any>>()

export async function fetchActiveTimer(
  userId: string,
  organizationId: string,
  timezone: string
): Promise<{ ok: boolean; data: any }> {
  const key = `${userId}:${organizationId}`
  let promise = inFlightTimerPromises.get(key)

  if (!promise) {
    promise = (async () => {
      const response = await fetch(
        `/api/time-tracking/timer?userId=${userId}&organizationId=${organizationId}&timezone=${encodeURIComponent(timezone)}`
      )
      const data = await response.json()
      return { ok: response.ok, data }
    })().finally(() => {
      inFlightTimerPromises.delete(key)
    })
    inFlightTimerPromises.set(key, promise)
  }

  return promise
}

