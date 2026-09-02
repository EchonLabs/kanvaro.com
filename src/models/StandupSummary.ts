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
 */
export interface ISummaryMemberCommitment {
  memberId: Types.ObjectId
  name: string
  allocations: Array<{ taskId: Types.ObjectId; taskKey?: string; plannedMinutes: number }>
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
    pmNotes: { type: String }
  },
  { timestamps: true }
)

export const StandupSummary =
  (mongoose.models.StandupSummary as mongoose.Model<IStandupSummary>) ||
  mongoose.model<IStandupSummary>('StandupSummary', StandupSummarySchema)
