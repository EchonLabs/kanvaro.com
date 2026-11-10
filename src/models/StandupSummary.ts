import mongoose, { Schema, type Document, type Types } from 'mongoose'

/**
 * A stand-up's persisted summary (spec §15.13, RUN-20 step 8).
 *
 * Built once by the completion saga's `src/lib/standup/summary.ts` from data
 * the saga already holds in memory, then written here verbatim — so a later
 * read of "what did this stand-up's summary say" never recomputes it from the
 * underlying rows, which may have moved on since (a carry-forward item
 * resolved, a variance revised). One summary per stand-up, enforced by the
 * unique index below.
 *
 * The one exception is `dayOutcome`, written later by the *next* stand-up's
 * completion — see {@link ISummaryDayOutcome}.
 */
export interface ISummaryMemberCommitment {
  memberId: Types.ObjectId
  name: string
  allocations: Array<{ taskId: Types.ObjectId; taskKey?: string; plannedMinutes: number }>
}

/**
 * How the day this stand-up planned actually went.
 *
 * The rest of the summary is frozen when the meeting completes, which is the
 * *start* of the working day: it can record the plan, not the result. The
 * result only becomes known at the next stand-up, whose variance step
 * classifies these allocations once members have updated statuses and logged
 * time. That stand-up's completion saga writes this field back onto this
 * document (`record-previous-day-outcome`), so it is absent until then, and
 * stays absent for a sprint's final day and for any day no later stand-up
 * completes after.
 *
 * Purely additive: nothing that reads the other fields depends on it.
 */
export interface ISummaryDayOutcome {
  recordedAt: Date
  /** The stand-up whose completion classified this day. */
  recordedByStandup: Types.ObjectId | string
  recordedByStandupDate: string
  completedTasks: Array<{ taskId: Types.ObjectId | string; taskKey?: string; title?: string }>
  varianceTable: Array<Record<string, unknown>>
  memberTotals: Array<{
    memberId: Types.ObjectId | string
    plannedMinutes: number
    loggedMinutesOnDay: number
    dayVarianceMinutes: number
  }>
}

export interface IStandupSummary extends Document {
  standup: Types.ObjectId
  sprint: Types.ObjectId
  project: Types.ObjectId
  organization: Types.ObjectId
  generatedAt: Date
  headerFacts: {
    standupDate: string
    dayNumber: number
    totalDays: number
    facilitatorName: string
    durationMinutes: number
  }
  attendance: Array<{ memberId: Types.ObjectId; name: string; status: string }>
  completedYesterday: Array<{ taskId: Types.ObjectId; taskKey?: string; title?: string }>
  varianceTable: Array<Record<string, unknown>>
  debtMovements: Array<Record<string, unknown>>
  memberCommitments: ISummaryMemberCommitment[]
  blockersRaised: Array<Record<string, unknown>>
  blockersResolved: Array<Record<string, unknown>>
  carryForwardState: Array<Record<string, unknown>>
  overridesIssued: Array<Record<string, unknown>>
  pmNotes?: string
  /** See {@link ISummaryDayOutcome}. Absent until the next stand-up completes. */
  dayOutcome?: ISummaryDayOutcome
  createdAt: Date
  updatedAt: Date
}

const StandupSummarySchema = new Schema<IStandupSummary>(
  {
    standup: { type: Schema.Types.ObjectId, ref: 'Standup', required: true, unique: true },
    sprint: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    generatedAt: { type: Date, required: true, default: () => new Date() },
    headerFacts: { type: Schema.Types.Mixed, required: true },
    attendance: { type: [{ type: Schema.Types.Mixed }], default: [] },
    completedYesterday: { type: [{ type: Schema.Types.Mixed }], default: [] },
    varianceTable: { type: [{ type: Schema.Types.Mixed }], default: [] },
    debtMovements: { type: [{ type: Schema.Types.Mixed }], default: [] },
    memberCommitments: { type: [{ type: Schema.Types.Mixed }], default: [] },
    blockersRaised: { type: [{ type: Schema.Types.Mixed }], default: [] },
    blockersResolved: { type: [{ type: Schema.Types.Mixed }], default: [] },
    carryForwardState: { type: [{ type: Schema.Types.Mixed }], default: [] },
    overridesIssued: { type: [{ type: Schema.Types.Mixed }], default: [] },
    pmNotes: { type: String },
    dayOutcome: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
)

export const StandupSummary =
  (mongoose.models.StandupSummary as mongoose.Model<IStandupSummary>) ||
  mongoose.model<IStandupSummary>('StandupSummary', StandupSummarySchema)
