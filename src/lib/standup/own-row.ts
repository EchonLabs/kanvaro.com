/**
 * RUN-26, in one place.
 *
 * "A member's own row locks the moment the stand-up leaves `Ready`." The rule
 * was written out twice — once in `StandupRunScreen.tsx`'s `readOnly` and once
 * in `MyStandupScreen.tsx`'s — which is exactly how two screens end up
 * disagreeing about when a member may type.
 *
 * Its own module rather than `lifecycle.ts`: that file is the natural home for
 * status logic, but it imports `@/models/Standup` for its value-level
 * `STANDUP_STATUSES`, and both callers here are client components that must
 * not pull Mongoose into the browser bundle. This file has no imports at all,
 * deliberately.
 *
 * The server does not rely on this — it is a display rule, and the allocations
 * routes enforce the same restriction themselves (SEC-1: never a
 * client-side-only gate).
 */
export interface OwnRowLockInput {
  /** The stand-up's lifecycle status (§10.1). */
  status: string
  /**
   * True for a PM. A PM is never locked out — they are the one running the
   * stand-up — so this short-circuits the status test entirely.
   */
  canAllocateOthers: boolean
}

export function isOwnRowReadOnly(input: OwnRowLockInput): boolean {
  return !input.canAllocateOthers && input.status !== 'Ready'
}
