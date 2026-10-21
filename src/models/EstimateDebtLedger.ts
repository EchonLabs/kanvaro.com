import mongoose, { Schema, Document } from 'mongoose'

/**
 * The five kinds of movement on a member's estimate debt (spec §16.2, VAR-5).
 *
 * `minutes` is always positive; the sign lives here. An accrual and a carry-in
 * add to what a member is over estimate, a credit, settlement or write-off
 * takes away — which is why VAR-6's balance is a sum over these types and not
 * over a signed column somebody could mis-sign.
 */
export const LEDGER_ENTRY_TYPES = [
  'accrual',
  'credit',
  'settlement',
  'writeoff',
  'carry_in'
] as const
export type LedgerEntryType = typeof LEDGER_ENTRY_TYPES[number]

/**
 * VAR-8's twenty-character floor, enforced here as well as in the service
 * because this is the only layer no future caller can route around.
 *
 * Defined in `lib/standup/debt.ts` and re-exported: the write-off dialog needs
 * the same number, and a component importing from this file would pull the
 * Mongoose driver into the browser bundle.
 */
export { WRITEOFF_REASON_MIN_LENGTH } from '@/lib/standup/debt'
import { WRITEOFF_REASON_MIN_LENGTH } from '@/lib/standup/debt'

export interface IEstimateDebtEntry extends Document {
  project: mongoose.Types.ObjectId
  sprint: mongoose.Types.ObjectId
  member: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId

  entryType: LedgerEntryType
  /** Always positive (§16.2). The sign is implied by `entryType`. */
  minutes: number

  /**
   * The allocation that produced this entry, for accruals and credits.
   * With `entryType` it forms VAR-3's idempotency key: re-running
   * classification over the same day must not post a second accrual.
   */
  sourceAllocation?: mongoose.Types.ObjectId
  /** The stand-up whose completion posted this entry. */
  sourceStandup: mongoose.Types.ObjectId
  /** The sprint debt was carried from, on a `carry_in` (VAR-9). */
  sourceSprint?: mongoose.Types.ObjectId

  /** Required on a write-off, at least `WRITEOFF_REASON_MIN_LENGTH` characters. */
  reason?: string

  createdBy: mongoose.Types.ObjectId
  createdAt: Date
}

const wholeMinutes = (field: string) => ({
  validator: (value: number) => Number.isInteger(value),
  message: `${field} must be a whole number of minutes`
})

const EstimateDebtLedgerSchema = new Schema<IEstimateDebtEntry>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    sprint: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },

    entryType: { type: String, enum: LEDGER_ENTRY_TYPES, required: true },
    minutes: {
      type: Number,
      required: true,
      // A zero-minute entry records nothing and would still consume the
      // idempotency key, blocking the real entry a re-run should post.
      min: [1, 'minutes must be a positive number of minutes'],
      validate: wholeMinutes('minutes')
    },

    sourceAllocation: { type: Schema.Types.ObjectId, ref: 'Allocation' },
    sourceStandup: { type: Schema.Types.ObjectId, ref: 'Standup', required: true },
    sourceSprint: { type: Schema.Types.ObjectId, ref: 'Sprint' },

    reason: {
      type: String,
      trim: true,
      maxlength: 2000,
      /**
       * A write-off with no `reason` at all never reaches the validator below,
       * because Mongoose skips validators on undefined paths. Requiring it
       * conditionally means "no justification" and "a short justification"
       * fail the same way and with the same sentence.
       */
      required: [
        function (this: IEstimateDebtEntry) {
          return this.entryType === 'writeoff'
        },
        `A write-off needs a justification of at least ${WRITEOFF_REASON_MIN_LENGTH} characters.`
      ],
      validate: {
        validator(this: IEstimateDebtEntry, value?: string) {
          if (this.entryType !== 'writeoff') return true
          return (value?.trim().length ?? 0) >= WRITEOFF_REASON_MIN_LENGTH
        },
        message: `A write-off needs a justification of at least ${WRITEOFF_REASON_MIN_LENGTH} characters.`
      }
    },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
)

/**
 * DAT-4 — the ledger is append-only, enforced where nothing can route around it.
 *
 * Debt is the number a PM cites in a live meeting. A correction that edits the
 * original entry leaves no trace of what was said yesterday, so every
 * correction is a new, compensating entry. Putting the refusal on the model
 * rather than in the service means a future service — or a script, or a
 * migration — cannot quietly break the property the whole ledger rests on.
 */
const APPEND_ONLY = 'The estimate debt ledger is append-only (DAT-4). Post a compensating entry instead.'

const refuse = function (this: unknown, next: (error?: Error) => void) {
  next(new Error(APPEND_ONLY))
}

for (const operation of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'replaceOne',
  'deleteOne',
  'deleteMany'
] as const) {
  // `document: true, query: true` on purpose: `deleteOne` and `updateOne` exist
  // as both a query and a document method, and which one a hook defaults to has
  // changed between Mongoose majors. Registering both closes the door whichever
  // way a caller opens it.
  EstimateDebtLedgerSchema.pre(operation as any, { document: true, query: true }, refuse)
}

/** VAR-6's balance read: every entry for one member on one sprint, in order. */
EstimateDebtLedgerSchema.index({ sprint: 1, member: 1, createdAt: 1 })

/**
 * VAR-3's idempotency key, over the entries that have an allocation to key on.
 *
 * Filtered rather than `sparse`. A compound sparse index skips a document only
 * when *every* indexed field is missing, and `entryType` is always present — so
 * `sparse` would index settlements and write-offs under
 * `sourceAllocation: null` and let the first of them block all the rest. The
 * partial filter indexes exactly the rows the key is meant for. (`$exists:
 * true` is permitted in a `partialFilterExpression`; `$exists: false` is not,
 * which is why the settlement key below is written as an `$in` on `entryType`.)
 */
EstimateDebtLedgerSchema.index(
  { sourceAllocation: 1, entryType: 1 },
  { unique: true, partialFilterExpression: { sourceAllocation: { $exists: true } } }
)

/**
 * The same guarantee for the two entry types that have no allocation to key on.
 * A settlement belongs to a member and a stand-up, so re-running that
 * stand-up's completion must find the slot taken rather than settle twice.
 *
 * Written as `$in` rather than `sourceAllocation: { $exists: false }`: MongoDB
 * refuses `$exists` inside a `partialFilterExpression`, a constraint Phase 7
 * hit on `Allocation`'s own partial index.
 */
EstimateDebtLedgerSchema.index(
  { sourceStandup: 1, member: 1, entryType: 1 },
  {
    unique: true,
    partialFilterExpression: { entryType: { $in: ['settlement', 'carry_in'] } }
  }
)

export const EstimateDebtLedger =
  (mongoose.models.EstimateDebtLedger as mongoose.Model<IEstimateDebtEntry>) ||
  mongoose.model<IEstimateDebtEntry>('EstimateDebtLedger', EstimateDebtLedgerSchema)
