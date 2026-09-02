/**
 * The carry-forward register's pure rules (spec §13.3, CFW-2..4).
 *
 * Ageing bands, the mandatory-note check and the "is this note new" test are
 * decisions that read nothing but their inputs, so they live here — apart
 * from `carry-forward-service.ts`, which is the only place that touches the
 * database — for the same reason `variance.ts` sits apart from
 * `variance-service.ts`: a pure function is exhaustively testable at every
 * boundary without a database, and the service module is what the rest of
 * the app is allowed to call.
 */
import type { CarryForwardStatus } from '@/models/CarryForwardItem'

/** §13.3's fixed chronic threshold. Not configurable — CFW-3 gives only the note and escalation bands a per-project setting. */
export const CHRONIC_AGE_THRESHOLD = 8

/** CFW-4's floor on a carry-forward note. */
export const CARRY_FORWARD_NOTE_MIN_LENGTH = 10

export interface AgeThresholds {
  /** Age at which a note becomes mandatory every subsequent stand-up (default 3). */
  noteThreshold: number
  /** Age at which the item is flagged escalated (default 5). */
  escalationThreshold: number
}

export type AgeBand = 'normal' | 'note_required' | 'escalated' | 'chronic'

/**
 * §13.3's table, evaluated for one item's current age.
 *
 * `chronic` implies `escalated` implies `note_required` — the bands are
 * cumulative, so a chronic item at age 9 still needs its note as well as its
 * documented decision, it does not stop needing one because it moved up a
 * band.
 */
export function ageBandFor(ageInStandups: number, thresholds: AgeThresholds): AgeBand {
  if (ageInStandups >= CHRONIC_AGE_THRESHOLD) return 'chronic'
  if (ageInStandups >= thresholds.escalationThreshold) return 'escalated'
  if (ageInStandups >= thresholds.noteThreshold) return 'note_required'
  return 'normal'
}

/** Whether CC-4 must block completion for this item today (spec CFW-3, "every subsequent stand-up"). */
export function requiresNoteToday(ageInStandups: number, thresholds: AgeThresholds): boolean {
  return ageBandFor(ageInStandups, thresholds) !== 'normal'
}

export interface NoteValidationInput {
  text: string
  previousNoteText?: string
}

export type NoteValidationResult =
  | { valid: true }
  | { valid: false; code: 'TOO_SHORT' | 'NOTE_UNCHANGED'; message: string }

/**
 * CFW-4. At least ten characters, and not a verbatim resubmission of the last
 * note on this item.
 *
 * Comparison is on the trimmed text only — whitespace-only churn between two
 * otherwise identical notes is not "today's update" any more than resending
 * the same string outright.
 */
export function validateCarryForwardNote(input: NoteValidationInput): NoteValidationResult {
  const trimmed = input.text.trim()

  if (trimmed.length < CARRY_FORWARD_NOTE_MIN_LENGTH) {
    return {
      valid: false,
      code: 'TOO_SHORT',
      message: `A carry-forward note needs at least ${CARRY_FORWARD_NOTE_MIN_LENGTH} characters.`
    }
  }

  if (input.previousNoteText !== undefined && trimmed === input.previousNoteText.trim()) {
    return {
      valid: false,
      code: 'NOTE_UNCHANGED',
      message: 'Add today’s update, not yesterday’s.'
    }
  }

  return { valid: true }
}

/** §13.2's "closes when" column — which resolution types are legal for which item type (CFW-7). */
export const VALID_RESOLUTIONS_BY_TYPE: Record<string, readonly string[]> = {
  unfinished_task: ['done', 'reassigned', 'descoped', 'other'],
  unrevised_estimate: ['done', 'other'],
  open_blocker: ['done', 'other'],
  owner_absent: ['reassigned', 'done', 'other'],
  unassigned_task: ['done', 'reassigned', 'other'],
  missed_standup_rollup: ['acknowledged', 'other'],
  override_followup: ['done', 'other'],
  not_started_commitment: ['done', 'descoped', 'other'],
  cross_sprint: ['done', 'reassigned', 'descoped', 'other']
}

export function isResolutionValidForType(
  type: string,
  resolutionType: string
): boolean {
  return (VALID_RESOLUTIONS_BY_TYPE[type] ?? []).includes(resolutionType)
}

/**
 * A status carrying `chronic`, for the tag rather than the enum — `status`
 * only ever holds one of the seven CFW-1 lifecycle states, so "chronic" is
 * recorded as a tag (§13.4) alongside whatever status the item is actually in.
 */
export function withChronicTag(
  tags: readonly string[],
  ageInStandups: number
): string[] {
  const isChronic = ageInStandups >= CHRONIC_AGE_THRESHOLD
  const withoutChronic = tags.filter((tag) => tag !== 'chronic')
  return isChronic ? [...withoutChronic, 'chronic'] : withoutChronic
}

/** CFW-10's default sort: oldest problem first, ties broken for stable rendering. */
export function sortByAgeDescending<T extends { ageInStandups: number; id: string }>(
  items: readonly T[]
): T[] {
  return [...items].sort((a, b) => {
    if (a.ageInStandups !== b.ageInStandups) return b.ageInStandups - a.ageInStandups
    return a.id.localeCompare(b.id)
  })
}

/** CFW-11's count summary strip. */
export interface CarryForwardSummary {
  totalOpen: number
  needingNoteToday: number
  escalated: number
  resolvedYesterday: number
}

export function summarise(
  items: readonly {
    status: CarryForwardStatus
    ageInStandups: number
    /** Whether the item's newest note was already written for today's round. */
    notedToday: boolean
    resolvedOnDate?: string
  }[],
  thresholds: AgeThresholds,
  todayDate: string
): CarryForwardSummary {
  const open = items.filter((item) =>
    item.status === 'open' || item.status === 'noted' || item.status === 'escalated'
  )

  return {
    totalOpen: open.length,
    // Not "eligible for a note" — "still owed one". Otherwise a PM who notes
    // every aged item one by one watches this count sit frozen all meeting,
    // which reads as the note never having been recorded.
    needingNoteToday: open.filter(
      (item) => requiresNoteToday(item.ageInStandups, thresholds) && !item.notedToday
    ).length,
    escalated: open.filter((item) => item.status === 'escalated').length,
    resolvedYesterday: items.filter(
      (item) => item.status !== 'open' && item.status !== 'noted' && item.status !== 'escalated' &&
        item.resolvedOnDate === todayDate
    ).length
  }
}
