/**
 * The figures the summary's stat grid and attendance card show.
 *
 * Kept out of the components so each number is a rule stated once and tested
 * once, rather than an expression buried in JSX that only a rendered test can
 * reach. Every one of them is defensive about the payload: these rows are
 * `Mixed` in the schema, so a missing or unreadable field counts as nothing
 * rather than turning a tile into `NaN`.
 */
import type { LooseRow, MemberCommitment, SummaryPayload } from './types'

export interface SummaryStats {
  completedCount: number
  overEstimatedCount: number
  debtMinutes: number
  openBlockerCount: number
  carryForwardCount: number
  overrideCount: number
  presentCount: number
  attendanceTotal: number
  attendancePercent: number
  fullAttendance: boolean
}

/** A tolerant numeric read — see the docblock above for why it never throws. */
function numberFrom(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * An outcome that cost the plan time: the task ran past its estimate, or it
 * never moved because something blocked it. Matched on substrings because the
 * stored vocabulary has grown (`delivered_over`, `over_estimate`, `blocked`)
 * and a summary written under an older one should still count.
 */
function ranOver(row: LooseRow): boolean {
  const outcome = String(row.outcome ?? '').toLowerCase()
  return outcome.includes('over') || outcome.includes('blocked')
}

export function summaryStats(summary: SummaryPayload): SummaryStats {
  const attendanceTotal = summary.attendance.length
  const presentCount = summary.attendance.filter((row) => row.status === 'present').length

  return {
    completedCount: summary.completedYesterday.length,
    overEstimatedCount: summary.varianceTable.filter(ranOver).length,
    debtMinutes: summary.debtMovements.reduce(
      (total, row) => total + numberFrom(row.outstandingDebtMinutes),
      0
    ),
    /**
     * Read off each blocker's own status rather than `raised.length -
     * resolved.length`: the two arrays are independent records — a blocker
     * resolved today may have been raised on an earlier day — so subtracting
     * them can report a negative count, or hide an open one.
     */
    openBlockerCount: summary.blockersRaised.filter(
      (row) => String(row.status ?? '').toLowerCase() === 'open'
    ).length,
    carryForwardCount: summary.carryForwardState.length,
    overrideCount: summary.overridesIssued.length,
    presentCount,
    attendanceTotal,
    attendancePercent:
      attendanceTotal > 0 ? Math.round((presentCount / attendanceTotal) * 100) : 0,
    /**
     * An empty attendance list is not full attendance — nobody was recorded,
     * which is a gap in the record, not a perfect turnout.
     */
    fullAttendance: attendanceTotal > 0 && presentCount === attendanceTotal
  }
}

/**
 * How many minutes each member committed to today, keyed by member id.
 *
 * The attendance roster stores only `{ memberId, name, status }` — no
 * capacity, no workload — so a row's second line and its alert state are read
 * off the commitments the same stand-up recorded. That join is what makes an
 * absence actionable: a member who is out *and* holds commitments has work
 * stranded on them, which is a different fact from simply being out, and the
 * only one worth colouring a card for.
 *
 * Members absent from `memberCommitments` are absent from the map rather than
 * stored as zero, so a caller's `?? 0` is the single place the default lives.
 */
export function committedMinutesByMember(commitments: MemberCommitment[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const member of commitments ?? []) {
    const total = (member.allocations ?? []).reduce(
      (sum, allocation) => sum + numberFrom(allocation?.plannedMinutes),
      0
    )
    totals.set(String(member.memberId), total)
  }
  return totals
}
