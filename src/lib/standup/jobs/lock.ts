import { JobLock } from '@/models/JobLock'

// Web Crypto, not node:crypto. Next compiles `instrumentation.ts` for the Edge
// runtime as well as Node, and the whole scheduler graph is pulled in with it,
// so a Node builtin here fails the build even though the ticker never runs on
// Edge. `globalThis.crypto` exists on both (Node >= 18).
const randomUUID = (): string => globalThis.crypto.randomUUID()

/** Mongo's duplicate-key error. The signal that someone else holds the lock. */
const DUPLICATE_KEY = 11000

/**
 * Runs `fn` while holding an exclusive lock on `key`.
 *
 * Returns `null` — never throws — when another runner holds it, because a
 * skipped run is the normal outcome of two schedulers ticking at once, not an
 * error worth waking anyone for.
 */
export async function withJobLock<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T | null> {
  const owner = randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)

  try {
    // Matches only a free key: absent, or present but expired. When a live lock
    // exists the filter misses, the upsert tries to insert, and the unique index
    // rejects it — which is exactly the signal we want.
    await JobLock.findOneAndUpdate(
      { key, expiresAt: { $lte: now } },
      { $set: { key, owner, acquiredAt: now, expiresAt } },
      { upsert: true, new: true }
    )
  } catch (error) {
    if ((error as { code?: number }).code === DUPLICATE_KEY) return null
    throw error
  }

  try {
    return await fn()
  } finally {
    // Scoped to `owner`: if this run overran its TTL and another runner has
    // since claimed the key, deleting it would release someone else's lock.
    await JobLock.deleteOne({ key, owner })
  }
}
