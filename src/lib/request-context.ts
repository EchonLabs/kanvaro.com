
import { AsyncLocalStorage } from 'async_hooks'

const orgDbStorage = new AsyncLocalStorage<string>()

/**
 * Module-level fallback for the active org DB name.
 *
 * Next.js App Router's RSC runtime breaks `AsyncLocalStorage.enterWith()` —
 * the store is lost across `await` boundaries.  This variable acts as a
 * synchronous fallback.  It is safe because Mongoose proxy-model resolution
 * (the `get` trap in `makeOrgModel`) runs **synchronously** on the same tick
 * that `connectDB(orgId)` set it, before any interleaving `await` can change
 * it for a different request.
 */
let _fallbackOrgDb: string | undefined

/** Set the active org DB name for the current async call chain. */
export function setCurrentOrgDb(dbName: string): void {
  orgDbStorage.enterWith(dbName)
  _fallbackOrgDb = dbName
}

/** Get the active org DB name, or undefined if none has been set. */
export function getCurrentOrgDb(): string | undefined {
  return orgDbStorage.getStore() ?? _fallbackOrgDb
}
