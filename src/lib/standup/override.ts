/**
 * OVR-3/4/5 — the fixed reason-code lists and the justification rule shared
 * by every override type. Pure: the override modal validates client-side
 * with the same function the route validates with server-side.
 */

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
