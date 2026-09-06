import mongoose, { Schema, Document } from 'mongoose'

/**
 * Where an allocation came from (ALO-4).
 *
 * This is not decoration. `carried_forward` drives the carry-chain age badges,
 * `auto_prefilled` is what ALO-11 requires be visibly marked and removable in
 * one click, and `self_selected` is the only source a team member may create
 * themselves (ALO-23). The variance engine reads it too: a pre-assigned row and
 * a row the PM placed during the stand-up carry different expectations.
 */
export const ALLOCATION_SOURCES = [
  'pre_assigned',
  'assigned_in_standup',
  'carried_forward',
  'auto_prefilled',
  'self_selected'
] as const
export type AllocationSource = typeof ALLOCATION_SOURCES[number]

/**
 * Why an allocation was detached from its member without being deleted.
 *
 * RUN-7 says marking a member absent moves their allocations into the
 * carry-forward register with the tag `owner_absent`. The register is Phase 9
 * and attendance is Phase 7, so the plan (§6.4 OB-13) splits the requirement:
 * Phase 7 detaches — `excludedFromCapacity` plus this field — and Phase 9
 * sweeps the detached rows into the register at completion.
 *
 * It is a separate field rather than an overload of `excludedFromCapacity`
 * because "blocked, deliberately not allocated" and "the owner is not here"
 * carry forward differently, and the classifier has to tell them apart. Phase 8
 * depends on that distinction too: V11 requires the variance classifier to post
 * *zero* ledger entries for a retroactively absent member, and this is the flag
 * it keys off.
 */
export const DETACHED_REASONS = ['owner_absent'] as const
export type DetachedReason = typeof DETACHED_REASONS[number]

export interface IAllocation extends Document {
  standup: mongoose.Types.ObjectId
  /** Denormalised so Phase 8's ledger scan never has to join through stand-ups. */
  sprint: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId
  /** The person committing the hours. */
  member: mongoose.Types.ObjectId
  task: mongoose.Types.ObjectId

  /**
   * Minutes planned for **this day only**, never the task total (ALO-4).
   *
   * Minutes, not hours (DAT-2). The spec's tables are written in hours because
   * that is what the screen shows; every stored and computed value in this
   * module is an integer minute, and the conversion happens once, at the
   * display boundary, in `formatMinutesAsHours()`.
   */
  plannedMinutes: number
  source: AllocationSource

  /** The previous day's allocation this one continues. */
  carriedFromAllocation?: mongoose.Types.ObjectId
  /** The first allocation in the chain, so age is one read rather than a walk. */
  carryChainRoot?: mongoose.Types.ObjectId

  isBlocked: boolean
  /** RUN-16 — the PM kept a blocked task allocated. Requires a note. */
  allocatedDespiteBlocked: boolean
  blockedNote?: string

  /**
   * True when these minutes must not count against the member's capacity
   * (RUN-15 for a blocker, RUN-7 for an absence). `computeCapacity` expects
   * `allocatedMinutes` to already exclude these rows.
   */
  excludedFromCapacity: boolean
  excludeReason?: string
  detachedReason?: DetachedReason

  /** ALO-9 — the PM confirmed a second member on this task is deliberate pairing. */
  pairedDeliberately: boolean
  note?: string

  /**
   * The PM's answers to the two questions the stand-up asks about this row,
   * recorded live and frozen onto the `AllocationVariance` at completion.
   *
   * They live here rather than only on the variance record because the PM
   * answers them *during* the stand-up, hours before classification persists
   * anything — and CC-3 will not let the day complete until they exist.
   * `revisedRemainingMinutes` mirrors what the revision wrote to the task
   * (VAR-16); the task keeps the authoritative value and its revision history.
   */
  revisedRemainingMinutes?: number
  revisionReason?: string
  revisionDetail?: string
  /** V7 / V4 — why planned time did not happen (§12.2, AC-18). */
  notStartedReason?: string

  /**
   * The task's status when this allocation was made.
   *
   * Phase 8's classifier needs it to tell V7 from V12: a row with zero logged
   * hours whose status never moved is `not_started` and the PM owes a reason,
   * while one whose status advanced anyway is `no_time_logged_but_progressed`
   * — a warning that accrues no debt until real hours are entered. Nothing
   * else records it, and reading the task later answers with today's status,
   * not the status the day was planned against.
   */
  taskStatusAtAllocation?: string

  /** Set at stand-up completion (RUN-20 step 2). A frozen row is history. */
  frozenAt?: Date

  /** ALO-22 top-up: added after the stand-up completed. Additions only. */
  addedAfterCompletion: boolean
  addedAfterCompletionAt?: Date
  addedAfterCompletionReason?: string

  createdBy: mongoose.Types.ObjectId
  updatedBy?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const wholeMinutes = {
  validator: (value: number) => Number.isInteger(value),
  message: 'plannedMinutes must be a whole number of minutes'
}

const AllocationSchema = new Schema<IAllocation>(
  {
    standup: { type: Schema.Types.ObjectId, ref: 'Standup', required: true },
    sprint: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },

    // `min: 1` is CC-5 ("Remove or set hours on N empty allocations") enforced
    // at the schema rather than only at the completion check, so no code path
    // — a job, a migration, a future import — can create the empty row the
    // check would later refuse to complete against.
    plannedMinutes: { type: Number, required: true, min: 1, validate: wholeMinutes },
    source: { type: String, enum: ALLOCATION_SOURCES, required: true },

    carriedFromAllocation: { type: Schema.Types.ObjectId, ref: 'Allocation' },
    carryChainRoot: { type: Schema.Types.ObjectId, ref: 'Allocation' },

    isBlocked: { type: Boolean, default: false },
    allocatedDespiteBlocked: { type: Boolean, default: false },
    blockedNote: { type: String, trim: true, maxlength: 1000 },

    excludedFromCapacity: { type: Boolean, default: false },
    excludeReason: { type: String, trim: true, maxlength: 500 },
    detachedReason: { type: String, enum: DETACHED_REASONS },

    pairedDeliberately: { type: Boolean, default: false },
    note: { type: String, trim: true, maxlength: 1000 },

    /** Phase 8 — the PM's live answers, before completion freezes them. */
    revisedRemainingMinutes: {
      type: Number,
      min: 0,
      validate: {
        validator: (value: number) =>
          value === undefined || value === null || Number.isInteger(value),
        message: 'revisedRemainingMinutes must be a whole number of minutes'
      }
    },
    revisionReason: { type: String, trim: true, maxlength: 100 },
    revisionDetail: { type: String, trim: true, maxlength: 1000 },
    notStartedReason: { type: String, trim: true, maxlength: 500 },

    /** Phase 8, V7 vs V12. Optional: rows written before Phase 8 have none. */
    taskStatusAtAllocation: { type: String, trim: true },

    frozenAt: { type: Date },

    addedAfterCompletion: { type: Boolean, default: false },
    addedAfterCompletionAt: { type: Date },
    addedAfterCompletionReason: { type: String, trim: true, maxlength: 500 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
)

/**
 * DAT-3. One live allocation per member per task per stand-up.
 *
 * Partial on purpose. A detached row (RUN-7 — the owner is absent) keeps its
 * key but must not block a reassignment back to the same member, which is
 * exactly what happens when the absence was a mistake or the member turns up
 * late. Constraining only live rows lets the detached history sit alongside the
 * replacement, which is what Phase 9 needs to sweep and what Phase 8 needs to
 * classify.
 *
 * The filter is `detachedReason: null` rather than the more obvious
 * `{ $exists: false }` because MongoDB refuses `$exists: false` in a partial
 * index expression outright ("Expression not supported in partial index").
 * Equality against `null` is accepted and matches both a missing field and an
 * explicit null, which is the same set. Do not "tidy" this back.
 */
AllocationSchema.index(
  { standup: 1, member: 1, task: 1 },
  { unique: true, partialFilterExpression: { detachedReason: null } }
)

/** The capacity board's read: one member's rows for one stand-up. */
AllocationSchema.index({ standup: 1, member: 1 })

/** CC-10's check, and the ALO-9 pairing sum, both walk a task within a stand-up. */
AllocationSchema.index({ standup: 1, task: 1 })

/** Phase 8's ledger scan and the carry chain both walk a member across a sprint. */
AllocationSchema.index({ sprint: 1, member: 1 })

export const Allocation =
  (mongoose.models.Allocation as mongoose.Model<IAllocation>) ||
  mongoose.model<IAllocation>('Allocation', AllocationSchema)
