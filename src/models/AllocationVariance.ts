import mongoose, { Schema, Document } from 'mongoose'

/**
 * The twelve outcomes the variance classifier may assign an allocation at
 * stand-up completion (§16.2). Six pairs, split by whether the task closed
 * on this day: `delivered_*` for a task that reached done, `open_*` for one
 * that did not. The remaining six are the exceptions the classifier must
 * name rather than force into an under/on/over shape — a blocked task, a
 * descoped one, a reassignment mid-flight, an absent owner, a task worked
 * without a single logged minute, and one never started at all.
 */
export const VARIANCE_OUTCOMES = [
  'delivered_under', 'delivered_on_estimate', 'delivered_over',
  'open_under_consumed', 'open_fully_consumed', 'open_over_consumed',
  'not_started', 'blocked', 'descoped', 'reassigned',
  'owner_absent', 'no_time_logged_but_progressed'
] as const
export type VarianceOutcome = typeof VARIANCE_OUTCOMES[number]

export interface IAllocationVariance extends Document {
  /** The allocation this row explains. One row per allocation (DAT-2 §16.2). */
  allocation: mongoose.Types.ObjectId
  /** The stand-up the allocation belonged to — the day being explained. */
  standup: mongoose.Types.ObjectId
  /** The stand-up that closed and triggered this computation, usually the next one. */
  computedAtStandup: mongoose.Types.ObjectId
  sprint: mongoose.Types.ObjectId
  member: mongoose.Types.ObjectId
  task: mongoose.Types.ObjectId
  /** Denormalised so a ledger or reporting scan never has to join through the task. */
  project: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId

  /** What was planned for this allocation, in minutes (frozen at completion). */
  plannedMinutes: number
  /** What the member actually logged against the task on this day. */
  loggedMinutesOnDay: number
  /** logged - planned, for this day only. */
  dayVarianceMinutes: number

  /** The task's original estimate, never revised, carried for the task's whole life. */
  originalEstimateMinutes: number
  /** Everything logged against the task to date, across every member and day. */
  totalLoggedMinutesOnTask: number
  /** total logged - original estimate, at the task level. */
  taskVarianceMinutes: number

  remainingBeforeMinutes: number
  remainingAfterMinutes: number
  /** Set only when the owner re-estimated remaining work at this stand-up. */
  revisedRemainingMinutes?: number
  revisionReason?: string
  revisionDetail?: string

  /** The task's status at the moment this stand-up closed. */
  taskStatusAtClose: string
  outcome: VarianceOutcome

  /** 0 unless the outcome produces one — an over-consumption or an overrun. */
  overrunMinutes: number
  /** 0 unless the outcome produces one — an under-consumption credited back. */
  creditMinutes: number
  notStartedReason?: string

  /**
   * E40. Time logged retrospectively against a day that already closed
   * recomputes this row. The recompute must be visibly marked, never silent,
   * because the ledger entries it produced were already posted once.
   */
  recomputedAfterCompletion: boolean
  /**
   * D-D. True on a non-owner allocation of a shared task. A shared
   * contribution carries a day variance (its own logged time) but no task
   * variance — the task-level numbers belong to the owner's row alone.
   */
  sharedContribution: boolean

  computedAt: Date
}

const wholeMinutes = (field: string) => ({
  validator: (value: number) => Number.isInteger(value),
  message: `${field} must be a whole number of minutes`
})

const AllocationVarianceSchema = new Schema<IAllocationVariance>(
  {
    allocation: { type: Schema.Types.ObjectId, ref: 'Allocation', required: true },
    standup: { type: Schema.Types.ObjectId, ref: 'Standup', required: true },
    computedAtStandup: { type: Schema.Types.ObjectId, ref: 'Standup', required: true },
    sprint: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },

    plannedMinutes: {
      type: Number,
      required: true,
      validate: wholeMinutes('plannedMinutes')
    },
    loggedMinutesOnDay: {
      type: Number,
      required: true,
      validate: wholeMinutes('loggedMinutesOnDay')
    },
    dayVarianceMinutes: {
      type: Number,
      required: true,
      validate: wholeMinutes('dayVarianceMinutes')
    },

    originalEstimateMinutes: {
      type: Number,
      required: true,
      validate: wholeMinutes('originalEstimateMinutes')
    },
    totalLoggedMinutesOnTask: {
      type: Number,
      required: true,
      validate: wholeMinutes('totalLoggedMinutesOnTask')
    },
    taskVarianceMinutes: {
      type: Number,
      required: true,
      validate: wholeMinutes('taskVarianceMinutes')
    },

    remainingBeforeMinutes: {
      type: Number,
      required: true,
      validate: wholeMinutes('remainingBeforeMinutes')
    },
    remainingAfterMinutes: {
      type: Number,
      required: true,
      validate: wholeMinutes('remainingAfterMinutes')
    },
    revisedRemainingMinutes: {
      type: Number,
      validate: wholeMinutes('revisedRemainingMinutes')
    },
    revisionReason: { type: String, trim: true, maxlength: 500 },
    revisionDetail: { type: String, trim: true, maxlength: 1000 },

    taskStatusAtClose: { type: String, required: true, trim: true },
    outcome: { type: String, enum: VARIANCE_OUTCOMES, required: true },

    overrunMinutes: {
      type: Number,
      default: 0,
      validate: wholeMinutes('overrunMinutes')
    },
    creditMinutes: {
      type: Number,
      default: 0,
      validate: wholeMinutes('creditMinutes')
    },
    notStartedReason: { type: String, trim: true, maxlength: 500 },

    recomputedAfterCompletion: { type: Boolean, default: false },
    sharedContribution: { type: Boolean, default: false },

    computedAt: { type: Date, required: true }
  },
  { timestamps: false }
)

/** DAT-2 §16.2. One variance row per allocation — the classifier writes each once. */
AllocationVarianceSchema.index({ allocation: 1 }, { unique: true })

/** The debt ledger's and the classifier's own scan: a member's rows across a sprint. */
AllocationVarianceSchema.index({ sprint: 1, member: 1 })

/** Finds everything a given completion computed, for audit and reprocessing. */
AllocationVarianceSchema.index({ computedAtStandup: 1 })

/** Reporting's read: an outcome's distribution within a sprint. */
AllocationVarianceSchema.index({ outcome: 1, sprint: 1 })

export const AllocationVariance =
  (mongoose.models.AllocationVariance as mongoose.Model<IAllocationVariance>) ||
  mongoose.model<IAllocationVariance>('AllocationVariance', AllocationVarianceSchema)
