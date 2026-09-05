/**
 * Estimate rules (spec PLN-12/13, DAT-6/7, VAR-15/16, INV-4).
 *
 * Two numbers live on a task and they are not the same thing:
 *
 *   originalEstimateMinutes   what the team agreed at planning. Never changes.
 *   remainingEstimateMinutes  what the PM currently believes is left.
 *
 * The whole variance engine in Phase 5 rests on that separation — the sprint
 * report has to be able to say "you estimated six and it took eleven", which is
 * impossible if the original is edited when reality disagrees with it.
 *
 * This module holds the pure rules. The model-layer enforcement that DAT-6
 * demands lives in `models/Task.ts`, which imports from here.
 */
import { StandupError } from './errors'
import { hoursToMinutes, minutes, type Minutes } from './minutes'

export const ESTIMATE_UNITS = ['story_points', 'hours'] as const
export type EstimateUnit = typeof ESTIMATE_UNITS[number]

export const ESTIMATE_METHODS = ['poker', 'manual'] as const
export type EstimateMethod = typeof ESTIMATE_METHODS[number]

/**
 * Reasons a remaining estimate may be revised (VAR-15).
 *
 * A fixed list rather than free text, because the estimation-quality report in
 * Phase 8 groups by these. `other` is the escape hatch and demands detail.
 */
export const REVISION_REASONS = [
  'underestimated',
  'scope_grew',
  'unexpected_complexity',
  'rework_required',
  'blocked_time_lost',
  'interrupted_by_other_work',
  'dependency_late',
  'other'
] as const
export type RevisionReason = typeof REVISION_REASONS[number]

/** VAR-15: `other` requires free text of at least this length. */
export const MIN_REVISION_DETAIL_LENGTH = 10

export interface DeriveEstimateInput {
  /** The raw agreed value — a poker card, or hours typed directly. */
  value: number
  unit: EstimateUnit
  /** Project conversion factor (PLN-10/13). Ignored when the unit is hours. */
  pointsToHours?: number
}

/**
 * Converts an agreed estimate to the integer minutes the allocation engine uses
 * (PLN-13).
 *
 * NFR-P3 fixes the rounding point: conversion rounds to the nearest **minute**
 * at the moment the estimate is finalised, and that minute value is what is
 * stored. Rounding later, or repeatedly, is how a 3-point task drifts.
 *
 * The spec's PLN-13 says story points round "to one decimal place" of hours.
 * Rounding to the minute is strictly finer and satisfies both, so no precision
 * is lost — 0.1h is 6 minutes.
 */
export function deriveEstimateMinutes(input: DeriveEstimateInput): Minutes {
  const { value, unit } = input

  if (!Number.isFinite(value) || value <= 0) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'An estimate must be a number greater than zero.',
      { value }
    )
  }

  if (unit === 'hours') return hoursToMinutes(value)

  const pointsToHours = input.pointsToHours ?? 4
  if (!Number.isFinite(pointsToHours) || pointsToHours <= 0) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'The points-to-hours factor must be greater than zero.',
      { pointsToHours }
    )
  }

  return hoursToMinutes(value * pointsToHours)
}

export interface RevisionInput {
  /** The task's current remaining estimate, before this revision. */
  previousRemainingMinutes: number
  newRemainingMinutes: number
  reason: RevisionReason
  detail?: string
}

export interface RevisionEntry {
  previousRemainingMinutes: number
  newRemainingMinutes: number
  reason: RevisionReason
  detail?: string
}

/**
 * Validates a proposed revision and returns the entry to append (VAR-16).
 *
 * Returns rather than mutates so the caller decides where it lands, and so this
 * can be exercised without a task document.
 */
export function buildRevision(input: RevisionInput): RevisionEntry {
  const { newRemainingMinutes, reason, detail } = input

  if (!Number.isInteger(newRemainingMinutes) || newRemainingMinutes < 0) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'A remaining estimate must be a whole number of minutes, and cannot be negative.',
      { newRemainingMinutes }
    )
  }

  if (!REVISION_REASONS.includes(reason)) {
    throw new StandupError('VALIDATION_FAILED', `"${reason}" is not a revision reason.`, {
      reason,
      allowed: REVISION_REASONS
    })
  }

  if (reason === 'other' && (detail ?? '').trim().length < MIN_REVISION_DETAIL_LENGTH) {
    throw new StandupError(
      'VALIDATION_FAILED',
      `Choosing "other" needs at least ${MIN_REVISION_DETAIL_LENGTH} characters explaining why.`,
      { reason, detail }
    )
  }

  return {
    previousRemainingMinutes: input.previousRemainingMinutes,
    newRemainingMinutes,
    reason,
    ...(detail && detail.trim() ? { detail: detail.trim() } : {})
  }
}

/**
 * The projected total the revise-estimate modal must display (§15.11).
 *
 * "Kasun's new total on this task would be 11.0h" is called out in the spec as
 * the moment a PM decides whether to split or descope, so it is computed here
 * rather than assembled in the component.
 */
export function projectedTotalMinutes(
  totalLoggedMinutes: number,
  newRemainingMinutes: number
): Minutes {
  return minutes(totalLoggedMinutes + newRemainingMinutes)
}

/**
 * Whether a task's original estimate may still be written.
 *
 * DAT-6/INV-4: once the sprint leaves Planning the original is frozen. The lock
 * is stamped on the task itself (`estimateLockedAt`) rather than resolved by
 * looking up the sprint on every save — a per-write lookup would be both slow
 * and, worse, wrong for a task that has since moved sprints.
 */
export function isEstimateLocked(task: { estimateLockedAt?: Date | null }): boolean {
  return !!task.estimateLockedAt
}
