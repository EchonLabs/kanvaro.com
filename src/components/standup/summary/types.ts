/**
 * The shape `GET /api/standups/:id/summary` returns, as this screen reads it.
 *
 * Several sections (variance, debt, blockers, carry-forward, overrides) are
 * `Mixed` in the schema and therefore arrive as loose records — see
 * `StandupSummary.ts`. They stay loose here rather than being asserted into
 * concrete interfaces the payload does not guarantee: `field()` in `rows.ts`
 * is how this screen reads them, defensively, the same way the markdown
 * export does.
 */

/** What `getSummary` joins onto every row that names a member. */
export interface MemberIdentity {
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
}

export interface HeaderFacts {
  standupDate: string
  dayNumber: number
  totalDays: number
  facilitatorName: string
  durationMinutes: number
}

export interface AttendanceRow extends MemberIdentity {
  memberId: string
  name: string
  status: string
}

export interface CompletedYesterdayRow {
  taskId: string
  taskKey?: string
  title?: string
}

export interface MemberCommitment extends MemberIdentity {
  memberId: string
  name: string
  allocations: Array<{
    taskId: string
    taskKey?: string
    /** Joined on read by `getSummary`; absent for a task that no longer exists. */
    taskTitle?: string
    plannedMinutes: number
  }>
}

/** A row the schema stores as `Mixed`, optionally hydrated with its member. */
export type LooseRow = Record<string, unknown> & MemberIdentity

/**
 * How the day this stand-up planned went. Written back by the next
 * stand-up's completion, so absent until then (see `StandupSummary.ts`).
 */
export interface DayOutcome {
  recordedAt: string
  recordedByStandup: string
  recordedByStandupDate: string
  completedTasks: CompletedYesterdayRow[]
  varianceTable: LooseRow[]
  memberTotals: Array<
    MemberIdentity & {
      memberId: string
      name?: string
      plannedMinutes: number
      loggedMinutesOnDay: number
      dayVarianceMinutes: number
    }
  >
}

export interface SummaryPayload {
  headerFacts: HeaderFacts
  attendance: AttendanceRow[]
  completedYesterday: CompletedYesterdayRow[]
  varianceTable: LooseRow[]
  debtMovements: LooseRow[]
  memberCommitments: MemberCommitment[]
  blockersRaised: LooseRow[]
  blockersResolved: LooseRow[]
  carryForwardState: LooseRow[]
  overridesIssued: LooseRow[]
  pmNotes?: string
  dayOutcome?: DayOutcome
}
