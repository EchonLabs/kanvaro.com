import mongoose, { Schema, Document } from 'mongoose'

/**
 * A member's estimate-debt position on one sprint, cached (spec §16.3, DAT-5).
 *
 * Every number here is derived: the ledger is the source of truth and this row
 * is a read model, rebuildable at any time by
 * `npm run standup:rebuild-debt-summaries` (NFR-9). Nothing may be recorded
 * here that cannot be recomputed from `EstimateDebtLedger` — the moment the
 * summary holds an original fact, dropping it loses data, and the whole point
 * of DAT-5 is that dropping it never can.
 *
 * Unlike the ledger it summarises, this collection is freely rewritten. That
 * asymmetry is deliberate and is why they are two models rather than one.
 */
export interface IMemberSprintDebtSummary extends Document {
  project: mongoose.Types.ObjectId
  sprint: mongoose.Types.ObjectId
  member: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId

  /** VAR-6's balance, floored at zero. Surplus is not stored — it is derived. */
  outstandingMinutes: number
  accruedMinutes: number
  creditedMinutes: number
  settledMinutes: number
  writtenOffMinutes: number
  carriedInMinutes: number

  lastRebuiltAt: Date
  /**
   * DAT-9. How many ledger entries this row was built from. A caller that
   * finds more entries than this knows the summary is behind and can fall
   * back to computing live rather than quoting a stale number.
   */
  sourceVersion: number
}

const wholeMinutes = (field: string) => ({
  validator: (value: number) => Number.isInteger(value),
  message: `${field} must be a whole number of minutes`
})

const minuteTotal = (field: string) => ({
  type: Number,
  default: 0,
  min: 0,
  validate: wholeMinutes(field)
})

const MemberSprintDebtSummarySchema = new Schema<IMemberSprintDebtSummary>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    sprint: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },

    outstandingMinutes: minuteTotal('outstandingMinutes'),
    accruedMinutes: minuteTotal('accruedMinutes'),
    creditedMinutes: minuteTotal('creditedMinutes'),
    settledMinutes: minuteTotal('settledMinutes'),
    writtenOffMinutes: minuteTotal('writtenOffMinutes'),
    carriedInMinutes: minuteTotal('carriedInMinutes'),

    lastRebuiltAt: { type: Date, required: true },
    sourceVersion: { type: Number, default: 0, min: 0 }
  },
  { timestamps: false }
)

/** One summary per member per sprint — the read model's whole shape. */
MemberSprintDebtSummarySchema.index({ sprint: 1, member: 1 }, { unique: true })

export const MemberSprintDebtSummary =
  (mongoose.models.MemberSprintDebtSummary as mongoose.Model<IMemberSprintDebtSummary>) ||
  mongoose.model<IMemberSprintDebtSummary>(
    'MemberSprintDebtSummary',
    MemberSprintDebtSummarySchema
  )
