/**
 * Limits applied by the tool wrapper (task 4.1): calls per user per minute, and the size of
 * one result.
 */

export interface RateLimits {
  /** Read tools per user per minute (default 60). */
  readsPerMinute?: number
  /** Write and critical tools per user per minute (default 20). */
  writesPerMinute?: number
  now?: () => number
}

export interface RateLimiter {
  /** Counts one call. Returns 0 if allowed, otherwise the seconds until the next one is. */
  take(userId: string, bucket: 'read' | 'write'): number
}

/**
 * Fixed one-minute windows per user, in memory. Fine for a single instance; with several
 * instances behind a load balancer each would allow the full rate (move to the database then).
 */
export function createRateLimiter(opts: RateLimits = {}): RateLimiter {
  const now = opts.now ?? Date.now
  const max = { read: opts.readsPerMinute ?? 60, write: opts.writesPerMinute ?? 20 }
  const windows = new Map<string, { start: number; count: number }>()

  return {
    take(userId, bucket) {
      const key = `${bucket}:${userId}`
      const t = now()
      let w = windows.get(key)
      if (!w || t - w.start >= 60_000) {
        if (windows.size >= MAX_WINDOWS) sweep(windows, t)
        w = { start: t, count: 0 }
        windows.set(key, w)
      }
      if (w.count >= max[bucket]) return Math.max(1, Math.ceil((w.start + 60_000 - t) / 1000))
      w.count++
      return 0
    },
  }
}

const MAX_WINDOWS = 10_000

/**
 * Bounds memory: drops windows that have ended. Only if every window is still current (a flood
 * of 10,000 users or addresses in one minute) is everything dropped, as a last resort.
 */
export function sweep(windows: Map<string, { start: number }>, now: number): void {
  for (const [key, w] of windows) if (now - w.start >= 60_000) windows.delete(key)
  if (windows.size >= MAX_WINDOWS) windows.clear()
}

/** About 100 KB of JSON per result: enough for a page of 100 items, small enough for the AI. */
export const MAX_RESULT_BYTES = 100_000

export interface Capped {
  value: unknown
  /** Set when a list was cut: how many items are shown out of how many. */
  truncated?: { shown: number; total: number }
}

/**
 * Keeps a result under `maxBytes`. A list (the result itself, or its largest list field) is
 * cut to the items that fit. Returns undefined when the result can't be made small enough.
 */
export function capSize(value: unknown, maxBytes = MAX_RESULT_BYTES): Capped | undefined {
  if (byteLength(value) <= maxBytes) return { value }

  const list = largestList(value)
  if (!list) return undefined
  const { items, rebuild } = list

  // Binary search for the most items that still fit.
  let lo = 0
  let hi = items.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (byteLength(rebuild(items.slice(0, mid))) <= maxBytes) lo = mid
    else hi = mid - 1
  }
  if (lo === 0) return undefined
  return { value: rebuild(items.slice(0, lo)), truncated: { shown: lo, total: items.length } }
}

function largestList(value: unknown): { items: unknown[]; rebuild: (items: unknown[]) => unknown } | undefined {
  if (Array.isArray(value)) return { items: value, rebuild: items => items }
  if (typeof value !== 'object' || value === null) return undefined
  const obj = value as Record<string, unknown>
  let best: string | undefined
  let bestSize = 0
  for (const [key, v] of Object.entries(obj)) {
    if (!Array.isArray(v)) continue
    const size = byteLength(v)
    if (size > bestSize) {
      best = key
      bestSize = size
    }
  }
  if (best === undefined) return undefined
  const key = best
  return { items: obj[key] as unknown[], rebuild: items => ({ ...obj, [key]: items }) }
}

export function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8')
}
