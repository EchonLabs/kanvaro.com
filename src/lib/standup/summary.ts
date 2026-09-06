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
import type { ISummaryMemberCommitment, IStandupSummary } from '@/models/StandupSummary'

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

/** UI-11. Filters the full document to one member's personal commitment summary (N4's content). */
export function personalCommitmentFor(summary: BuildSummaryInput, memberId: string) {
  return summary.memberCommitments.find((m) => String(m.memberId) === memberId)
}
