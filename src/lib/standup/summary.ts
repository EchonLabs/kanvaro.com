/**
 * The pure §15.13 summary assembler.
 *
 * Takes rows the completion saga has already loaded in the course of its own
 * earlier steps (attendance, variance, debt ledger movements, member
 * commitments, blockers, carry-forward state, overrides) and shapes them into
 * `StandupSummary`'s schema. Deliberately does no querying of its own, so it
 * is unit-testable without a database and never causes the saga to re-read
 * data it already holds.
 */
import type {
  ISummaryDayOutcome,
  ISummaryMemberCommitment,
  IStandupSummary
} from '@/models/StandupSummary'

export interface BuildSummaryInput {
  standupId: string
  sprintId: string
  projectId: string
  organizationId: string
  headerFacts: IStandupSummary['headerFacts']
  attendance: IStandupSummary['attendance']
  completedYesterday: IStandupSummary['completedYesterday']
  varianceTable: IStandupSummary['varianceTable']
  debtMovements: IStandupSummary['debtMovements']
  memberCommitments: ISummaryMemberCommitment[]
  blockersRaised: IStandupSummary['blockersRaised']
  blockersResolved: IStandupSummary['blockersResolved']
  carryForwardState: IStandupSummary['carryForwardState']
  overridesIssued: IStandupSummary['overridesIssued']
  pmNotes?: string
}

export function buildSummaryDocument(input: BuildSummaryInput) {
  return {
    standup: input.standupId,
    sprint: input.sprintId,
    project: input.projectId,
    organization: input.organizationId,
    generatedAt: new Date(),
    headerFacts: input.headerFacts,
    attendance: input.attendance,
    completedYesterday: input.completedYesterday,
    varianceTable: input.varianceTable,
    debtMovements: input.debtMovements,
    memberCommitments: input.memberCommitments,
    blockersRaised: input.blockersRaised,
    blockersResolved: input.blockersResolved,
    carryForwardState: input.carryForwardState,
    overridesIssued: input.overridesIssued,
    pmNotes: input.pmNotes
  }
}

export interface BuildDayOutcomeInput {
  /** The stand-up being completed now: the one that classified the previous day. */
  recordedByStandupId: string
  recordedByStandupDate: string
  completedTasks: ISummaryDayOutcome['completedTasks']
  varianceTable: ISummaryDayOutcome['varianceTable']
  memberTotals: ISummaryDayOutcome['memberTotals']
}

/**
 * The previous day's outcome, as written back onto that day's summary.
 *
 * Built from the same rows the current stand-up's own summary records as
 * "completed yesterday" and "variance", so the two documents can never tell
 * different stories about the same day.
 */
export function buildDayOutcome(input: BuildDayOutcomeInput): ISummaryDayOutcome {
  return {
    recordedAt: new Date(),
    recordedByStandup: input.recordedByStandupId,
    recordedByStandupDate: input.recordedByStandupDate,
    completedTasks: input.completedTasks,
    varianceTable: input.varianceTable,
    memberTotals: input.memberTotals
  }
}

/** UI-11. Filters the full document to one member's personal commitment summary (N4's content). */
export function personalCommitmentFor(summary: BuildSummaryInput, memberId: string) {
  return summary.memberCommitments.find((m) => String(m.memberId) === memberId)
}
