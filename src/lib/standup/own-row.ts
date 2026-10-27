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

/**
 * ALO-23/E31: whether the "add a task" self-select control should be
 * disabled.
 *
 * Deliberately a second, narrower function rather than a third input on
 * {@link isOwnRowReadOnly}. That function governs editing the *hours already
 * committed* to an existing row, and RUN-26 keeps that locked the moment the
 * stand-up leaves `Ready` — including once it is `Completed` — because
 * rewriting what a member already told the team they'd do is not something
 * completion should reopen.
 *
 * Adding a brand-new self-selected task is the opposite case, and E31 is
 * specifically about admitting it *after* completion: a member who did extra,
 * unplanned work should be able to say so without waiting for tomorrow's
 * stand-up, provided the project has self-select turned on at all
 * (`allowSelfSelect`) and a PM has not already opened the row to everyone
 * (`canAllocateOthers`). So this disables the control everywhere
 * {@link isOwnRowReadOnly} would, except it leaves `Completed` open —
 * mirroring the same widening `allocations/route.ts` and
 * `allocation-service.ts` made on the server for exactly this control.
 */
export interface SelfSelectDisabledInput {
  /** The stand-up's lifecycle status (§10.1). */
  status: string
  /** True for a PM. A PM is never restricted by either function. */
  canAllocateOthers: boolean
  /** The project's ALO-23 setting. Off means the control stays disabled, whatever the status. */
  allowSelfSelect: boolean
}

export function isSelfSelectDisabled(input: SelfSelectDisabledInput): boolean {
  if (input.canAllocateOthers) return false
  if (!input.allowSelfSelect) return true
  return input.status !== 'Ready' && input.status !== 'Completed'
}
