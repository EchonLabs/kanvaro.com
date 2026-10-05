/**
 * OVR-3/4/5 — the fixed reason-code lists and the justification rule shared
 * by every override type. Pure: the override modal validates client-side
 * with the same function the route validates with server-side.
 */
import type { CheckId, CompletionCheckResult } from './completion-checks'

export const UNDER_ALLOCATION_REASON_CODES = [
  'no_work_available', 'blocked_capacity', 'skills_mismatch', 'awaiting_dependency',
  'training_or_ceremony', 'support_rota', 'part_day_unrecorded', 'onboarding',
  'deliberate_buffer', 'other'
] as const

export const OVER_ALLOCATION_REASON_CODES = [
  'member_agreed_overtime', 'estimates_conservative', 'catching_up_debt',
  'critical_deadline', 'task_will_split', 'other'
] as const

export const JUSTIFICATION_MIN_LENGTH = 20

/** OVR-5's configurable low-value list. */
export const DEFAULT_LOW_VALUE_JUSTIFICATIONS = ['n/a', 'na', 'none', '-', 'asdf', '.', 'ok', 'test']

export type JustificationValidationResult =
  | { valid: true }
  | { valid: false; code: 'TOO_SHORT' | 'LOW_VALUE'; message: string }

export function validateJustification(
  text: string,
  lowValueList: readonly string[] = DEFAULT_LOW_VALUE_JUSTIFICATIONS
): JustificationValidationResult {
  const trimmed = text.trim()

  // Whitespace-only or punctuation-only collapses to nothing meaningful once
  // word characters are stripped, so it fails the length check honestly
  // rather than needing a second regex branch.
  const meaningful = trimmed.replace(new RegExp('[^\\p{L}\\p{N}]', 'gu'), '')

  if (trimmed.length < JUSTIFICATION_MIN_LENGTH || meaningful.length === 0) {
    return {
      valid: false,
      code: 'TOO_SHORT',
      message: `A justification needs at least ${JUSTIFICATION_MIN_LENGTH} characters.`
    }
  }

  if (lowValueList.includes(trimmed.toLowerCase())) {
    return {
      valid: false,
      code: 'LOW_VALUE',
      message: 'That justification does not explain anything. Say what actually happened.'
    }
  }

  return { valid: true }
}

/** §14.2's table, id by type, for OVR-2's "the button must simply not exist" rule. */
export const OVERRIDE_TABLE = {
  under_allocation: { checkId: 'CC-1', overridable: true },
  over_allocation: { checkId: 'CC-6', overridable: true },
  skip_reestimate: { checkId: 'CC-3', overridable: true },
  duplicate_allocation: { checkId: 'CC-10', overridable: true },
  complete_with_absent_facilitator_role: { checkId: null, overridable: true },
  unestimated_task_allocation: { checkId: 'CC-2', overridable: false },
  missing_carry_forward_note: { checkId: 'CC-4', overridable: false },
  empty_allocation: { checkId: 'CC-5', overridable: false },
  missing_attendance: { checkId: 'CC-7', overridable: false },
  sprint_close_without_disposition: { checkId: 'CC-8', overridable: false }
} as const

export type AnyOverrideType = keyof typeof OVERRIDE_TABLE

export function isOverridable(type: string): boolean {
  const entry = OVERRIDE_TABLE[type as AnyOverrideType]
  return entry?.overridable ?? false
}

/**
 * §14's completion-time reconciliation (Task 21 / AC-10).
 *
 * `issueOverride` only ever persists a `StandupOverride` record — it does not
 * touch the completion checks themselves. This is the other half: given the
 * hard-blocking failures `blockingFailures()` returned and the overrides
 * issued on this stand-up, it narrows each failure's `entities` down to the
 * ones no issued override actually covers, and drops a `CompletionCheckResult`
 * from the returned list entirely once its `entities` are all covered.
 *
 * Matching is per-entity, not per-checkId, because a single hard check (e.g.
 * CC-1 naming two under-allocated members) can be genuinely half-resolved: an
 * override naming Kasun must not silently wave through Amal's unrelated gap.
 */
export interface IssuedOverrideForReconciliation {
  type: string
  affectedMemberIds: readonly string[]
  affectedTaskIds: readonly string[]
}

/**
 * checkId -> override type, derived from `OVERRIDE_TABLE`, for the four
 * overridable hard checks this reconciles.
 *
 * Exported because `backfill-service` needs the same derivation to turn a
 * facilitator's acknowledgement of a failing check into the right override
 * type (Ruling 21). Deriving it twice would let the two drift; a non-
 * overridable check is deliberately absent, which is what makes "there is no
 * override type for this check" the single answer to "may it be waved".
 */
export const CHECK_TO_OVERRIDE_TYPE: Partial<Record<CheckId, AnyOverrideType>> = (() => {
  const map: Partial<Record<CheckId, AnyOverrideType>> = {}
  for (const [type, entry] of Object.entries(OVERRIDE_TABLE) as [AnyOverrideType, { checkId: string | null; overridable: boolean }][]) {
    if (entry.overridable && entry.checkId) map[entry.checkId as CheckId] = type
  }
  return map
})()

/**
 * Does one issued override of the given type cover this one failing entity?
 * Each checkId has its own entity shape and its own scoping rule (member vs.
 * task) — see the per-checkId comments in the prompt/plan this implements.
 */
function entityIsCovered(
  checkId: CheckId,
  entity: Record<string, unknown>,
  overridesOfType: readonly IssuedOverrideForReconciliation[]
): boolean {
  switch (checkId) {
    case 'CC-1':
    case 'CC-6': {
      const memberId = entity.memberId
      if (typeof memberId !== 'string') return false
      return overridesOfType.some((o) => o.affectedMemberIds.includes(memberId))
    }
    case 'CC-3': {
      // OVR-3's override is task-scoped, not member-scoped: a member-only
      // match would incorrectly unblock a different task for the same
      // member. An entity with no taskId (an unfixed call site) can never be
      // resolved — it degrades safely to "still blocks".
      const taskId = entity.taskId
      if (typeof taskId !== 'string') return false
      return overridesOfType.some((o) => o.affectedTaskIds.includes(taskId))
    }
    case 'CC-10': {
      const taskId = entity.taskId
      if (typeof taskId !== 'string') return false
      return overridesOfType.some((o) => o.affectedTaskIds.includes(taskId))
    }
    default:
      return false
  }
}

/**
 * Ruling 21. Two of the four overridable types need something a **backfill**
 * cannot supply, so a facilitator reconstructing a past day may not attest to
 * their checks even though the live run screen can override them:
 *
 * - `over_allocation` (CC-6) — OVR-6 requires the affected member's *own*
 *   acknowledgement tick. A backfill reconstructs the day from one
 *   facilitator's recollection and cannot obtain it; issuing anyway would mean
 *   fabricating somebody else's consent. An over-allocated missed day has to
 *   be fixed by correcting the allocations.
 * - `skip_reestimate` (CC-3) — OVR-3/OVR-7 scope a deferral to exactly one
 *   task and let it happen once. `issueOverride` reads only
 *   `affectedTaskIds[0]` and creates an `override_followup` carry-forward item,
 *   whose `alreadyDeferred` guard then refuses the next attempt. A CC-3 failure
 *   naming several tasks — the normal state of a missed non-day-one day, whose
 *   variance rows are all unanswered — would therefore persist an override and
 *   a carry-forward item, still fail the gate, and be permanently unable to
 *   succeed on a retry. Re-estimates have to be answered, not attested away.
 *
 * This restricts which of the *derived* mappings a backfill may use; it does
 * not re-derive or hardcode the mapping itself, which stays `OVERRIDE_TABLE`'s
 * job. Exported as the single rule, because the backfill dialog has to render
 * exactly the set the service will accept — a dialog that offered a tick the
 * server hard-refuses rejects the whole payload, including the valid parts of
 * it, and tells the facilitator nothing.
 */
export const BACKFILL_UNSUPPORTED_OVERRIDE_TYPES: readonly AnyOverrideType[] = [
  'over_allocation',
  'skip_reestimate'
]

/** Ruling 21: may a backfill's facilitator attest to this failing check? */
export function isCheckAcknowledgeableByBackfill(checkId: string): boolean {
  const type = CHECK_TO_OVERRIDE_TYPE[checkId as CheckId]
  // No entry at all means the check is not overridable by anybody (OVR-2).
  return type !== undefined && !BACKFILL_UNSUPPORTED_OVERRIDE_TYPES.includes(type)
}

export function filterOverriddenFailures(
  failures: readonly CompletionCheckResult[],
  overrides: readonly IssuedOverrideForReconciliation[]
): CompletionCheckResult[] {
  const overridesByType = new Map<string, IssuedOverrideForReconciliation[]>()
  for (const override of overrides) {
    const list = overridesByType.get(override.type) ?? []
    list.push(override)
    overridesByType.set(override.type, list)
  }

  const result: CompletionCheckResult[] = []

  for (const failure of failures) {
    const overrideType = CHECK_TO_OVERRIDE_TYPE[failure.checkId]
    const overridesOfType = overrideType ? (overridesByType.get(overrideType) ?? []) : []

    if (overridesOfType.length === 0) {
      // No matching override issued at all — unchanged.
      result.push(failure)
      continue
    }

    const stillBlocking = failure.entities.filter(
      (entity) => !entityIsCovered(failure.checkId, entity, overridesOfType)
    )

    if (stillBlocking.length === 0) continue // fully resolved — drop the check entirely
    if (stillBlocking.length === failure.entities.length) {
      result.push(failure) // nothing resolved — unchanged, including its original message
      continue
    }

    // Partially resolved: narrow `entities` to the still-blocking rows. The
    // original message text is left as-is rather than regenerated per-check
    // (each check's own `count(...)` phrasing lives in completion-checks.ts) —
    // a deliberate simplification: the narrowed `entities` array is what the
    // UI's RUN-19 jump links actually key off, and the message still
    // correctly says *something* is unresolved.
    result.push({ ...failure, entities: stillBlocking })
  }

  return result
}
