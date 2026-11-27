/**
 * Health and readiness checks (task 1.7).
 * - /health = the process is alive (no dependencies), for the container HEALTHCHECK.
 * - /ready  = the server can do useful work: its database answers and Kanvaro is reachable.
 *   Results are only "ok" / "fail" — never error details.
 */
import type { Db } from 'mongodb'

export type Check = () => Promise<void>
export interface ReadinessChecks {
  database: Check
  kanvaro: Check
}
export type CheckResult = 'ok' | 'fail'

const CHECK_TIMEOUT_MS = 2000

export async function runChecks(checks: ReadinessChecks, timeoutMs = CHECK_TIMEOUT_MS): Promise<{ ready: boolean; checks: Record<keyof ReadinessChecks, CheckResult> }> {
  const entries = await Promise.all(
    (Object.entries(checks) as [keyof ReadinessChecks, Check][]).map(async ([name, check]) => [name, await withTimeout(check, timeoutMs)] as const),
  )
  const results = Object.fromEntries(entries) as Record<keyof ReadinessChecks, CheckResult>
  return { ready: Object.values(results).every(r => r === 'ok'), checks: results }
}

async function withTimeout(check: Check, ms: number): Promise<CheckResult> {
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms) }),
    ])
    return 'ok'
  } catch {
    return 'fail'
  } finally {
    clearTimeout(timer)
  }
}

export function databaseCheck(db: Db): Check {
  return async () => { await db.command({ ping: 1 }) }
}

/** Kanvaro's own unauthenticated health route. Redirects are not followed. */
export function kanvaroCheck(apiBaseUrl: string, fetchImpl: typeof fetch = fetch): Check {
  const url = new URL('/api/health', apiBaseUrl)
  return async () => {
    const res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
    await res.body?.cancel().catch(() => undefined)
    if (res.status < 200 || res.status >= 300) throw new Error(`status ${res.status}`)
  }
}
