/**
 * The planning gate and its waiver (spec PLN-1/2/3, PLN-16 to PLN-19, AC-5, AC-7).
 *
 * "This is a hard gate." The only bypass is an Org-Admin waiver — and the
 * waiver has a carve-out that is the single most important rule in this file:
 *
 *   **PLN-19. A waiver may never permit allocating an unestimated task.**
 *
 * Not "should not". The capacity maths is meaningless without an estimate, so
 * allocating an unestimated task is refused under every circumstance, waiver or
 * no waiver. AC-7 tests exactly this, and E15 restates it.
 */
import { StandupError } from './errors'
import { standupStrings } from './strings'
import type { ChecklistItem } from './planning-checklist'
import { canRunStandupOn, type SprintState } from './sprint-states'

/** PLN-17 — a waiver needs more explanation than an override's 20 characters. */
export const MIN_WAIVER_JUSTIFICATION_LENGTH = 30
/** PLN-17 — default expiry, capped at the sprint end date. */
export const DEFAULT_WAIVER_DAYS = 7

export interface PlanningWaiver {
  waivedCheckIds: string[]
  justification: string
  issuedBy: string
  issuedAt: Date
  expiresAt: Date
  revokedAt?: Date | null
}

/**
 * Checks a waiver may **never** cover.
 *
 * PC-3 is every task being estimated. A waiver may legitimately let planning
 * complete with PC-3 failing — the spec allows that, so a sprint can start with
 * some backlog still unestimated — but it can never let one of those
 * unestimated tasks be *allocated*. {@link assertTaskAllocatable} is where that
 * second half is enforced.
 */
export const NEVER_WAIVABLE_FOR_ALLOCATION = ['PC-3'] as const

export function isWaiverActive(waiver: PlanningWaiver | null | undefined, now = new Date()): boolean {
  if (!waiver) return false
  if (waiver.revokedAt) return false
  return waiver.expiresAt.getTime() > now.getTime()
}

/** Which checks an active waiver currently covers. Empty when inactive. */
export function waivedChecks(
  waiver: PlanningWaiver | null | undefined,
  now = new Date()
): string[] {
  return isWaiverActive(waiver, now) ? waiver!.waivedCheckIds : []
}

export interface GateInput {
  sprintState: SprintState
  /** ISO date, project local. */
  sprintStartDate: string
  today: string
  /** Mandatory checks that failed at the last evaluation. */
  blockers: ChecklistItem[]
  waiver?: PlanningWaiver | null
  now?: Date
}

export interface GateResult {
  passed: boolean
  /** Blockers still standing after the waiver is applied. */
  remainingBlockers: ChecklistItem[]
  /** Blockers the waiver excused, for PLN-18's banner. */
  waivedBlockers: ChecklistItem[]
}

/**
 * Evaluates PLN-2: may a stand-up start for this sprint?
 *
 * Two independent reasons to refuse, and they are not interchangeable — a
 * sprint can be perfectly planned and still too early to run.
 */
export function evaluatePlanningGate(input: GateInput): GateResult {
  const { sprintState, sprintStartDate, today, blockers, waiver } = input
  const now = input.now ?? new Date()

  const waived = waivedChecks(waiver, now)
  const waivedBlockers = blockers.filter((item) => waived.includes(item.checkId))
  const remainingBlockers = blockers.filter((item) => !waived.includes(item.checkId))

  const stateAllows = canRunStandupOn(sprintState, sprintStartDate, today)

  return {
    passed: stateAllows && remainingBlockers.length === 0,
    remainingBlockers,
    waivedBlockers
  }
}

/**
 * Throws `PLANNING_GATE_NOT_PASSED` unless a stand-up may run (AC-5).
 *
 * The payload lists every failing checklist item, because AC-5 requires the
 * response to say precisely why rather than just refusing.
 */
export function assertPlanningGate(input: GateInput): GateResult {
  const result = evaluatePlanningGate(input)

  if (!result.passed) {
    throw new StandupError('PLANNING_GATE_NOT_PASSED', standupStrings.planning.gateNotPassed(), {
      failingChecks: result.remainingBlockers,
      waivedChecks: result.waivedBlockers.map((item) => item.checkId),
      sprintState: input.sprintState
    })
  }

  return result
}

export interface AllocatableTask {
  id: string
  key?: string
  originalEstimateMinutes?: number | null
}

/**
 * PLN-19 / AC-7 / E15 — refuses to allocate an unestimated task.
 *
 * Takes no waiver argument **on purpose**. There is no input to this function
 * that makes an unestimated task allocatable, so accepting a waiver would imply
 * one exists. If a future caller wants to pass one, the compiler will stop them
 * here rather than at a code review.
 */
export function assertTaskAllocatable(task: AllocatableTask): void {
  const estimate = task.originalEstimateMinutes ?? 0

  if (estimate <= 0) {
    throw new StandupError(
      'TASK_NOT_ESTIMATED',
      `${task.key ?? 'This task'} has no estimate. Estimate it before allocating.`,
      { taskId: task.id, taskKey: task.key }
    )
  }
}

export interface IssueWaiverInput {
  waivedCheckIds: string[]
  justification: string
  issuedBy: string
  /** Capped at this; a waiver may not outlive the sprint (PLN-17). */
  sprintEndDate: Date
  expiresAt?: Date
  now?: Date
}

/**
 * Validates and builds a waiver (PLN-16, PLN-17).
 *
 * Deliberately does **not** check that the caller is an Org Admin — that is the
 * route's job, where the session lives. This validates the waiver's own shape.
 */
export function buildWaiver(input: IssueWaiverInput): PlanningWaiver {
  const now = input.now ?? new Date()
  const justification = input.justification?.trim() ?? ''

  if (!input.waivedCheckIds?.length) {
    throw new StandupError('VALIDATION_FAILED', 'A waiver must name at least one check.', {
      waivedCheckIds: input.waivedCheckIds
    })
  }

  if (justification.length < MIN_WAIVER_JUSTIFICATION_LENGTH) {
    throw new StandupError(
      'INVALID_JUSTIFICATION',
      `A waiver needs at least ${MIN_WAIVER_JUSTIFICATION_LENGTH} characters explaining why it is being issued.`,
      { length: justification.length, required: MIN_WAIVER_JUSTIFICATION_LENGTH }
    )
  }

  const defaultExpiry = new Date(now.getTime() + DEFAULT_WAIVER_DAYS * 24 * 60 * 60 * 1000)
  const requested = input.expiresAt ?? defaultExpiry

  if (requested.getTime() <= now.getTime()) {
    throw new StandupError('VALIDATION_FAILED', 'A waiver cannot expire in the past.', {
      expiresAt: requested
    })
  }

  // PLN-17 caps expiry at the sprint end date: a waiver outliving the sprint it
  // was issued for would silently carry into the next one.
  const expiresAt =
    requested.getTime() > input.sprintEndDate.getTime() ? input.sprintEndDate : requested

  return {
    // Array.from rather than spread: the project targets ES5.
    waivedCheckIds: Array.from(new Set(input.waivedCheckIds)),
    justification,
    issuedBy: input.issuedBy,
    issuedAt: now,
    expiresAt
  }
}

/**
 * The persistent banner PLN-18 requires on every stand-up screen for a sprint
 * under waiver.
 */
export function describeWaiver(
  waiver: PlanningWaiver | null | undefined,
  now = new Date()
): string | null {
  if (!isWaiverActive(waiver, now)) return null

  const checks = waiver!.waivedCheckIds.join(', ')
  const expires = waiver!.expiresAt.toISOString().slice(0, 10)

  return `Planning waiver active for ${checks}. It expires on ${expires}.`
}
