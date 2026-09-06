import mongoose, { Schema, Document } from 'mongoose'

/**
 * A recurring commitment that eats into a member's project capacity, e.g. a
 * daily support rota (spec ALO-1's `nonProjectCommitment`).
 */
export interface INonProjectCommitment {
  label: string
  /** Minutes, per DAT-2. */
  minutesPerDay: number
  /** 0 = Sunday … 6 = Saturday. Empty means every working day. */
  daysOfWeek: number[]
}

/**
 * A dated leave or availability exception for one member — layer 4 of working
 * day resolution (spec §7.1).
 *
 * CAL-4 is emphatic that this layer may **never** make a date non-working for
 * the project: it only reduces one individual's capacity. A day on which every
 * single member is on leave is still a working day and still gets a stand-up,
 * so that the record of the gap exists.
 *
 * Kanvaro has no leave module, so these are entered manually on the Capacity &
 * Members screen (NFR-I2). `source` is kept so a real leave integration can
 * supersede manual rows later without losing provenance.
 */
export interface IMemberLeave {
  _id?: mongoose.Types.ObjectId
  /** Inclusive ISO date range, `YYYY-MM-DD`. */
  startDate: string
  endDate: string
  /** Minutes removed per day. Absent means the member's whole day. */
  minutesPerDay?: number
  reason?: string
  source: 'manual' | 'leave_module'
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
}

/**
 * A member's capacity on a project, valid from a date.
 *
 * DAT-1: capacity is **dated**. A historical stand-up must resolve capacity as
 * it was on its own `standupDate`, not as it is now — otherwise changing
 * someone's hours today silently rewrites every past day's variance.
 */
export interface IMemberCapacity extends Document {
  project: mongoose.Types.ObjectId
  member: mongoose.Types.ObjectId
  /** Minutes, per DAT-2. Defaults to the project's standard day. */
  dailyCapacityMinutes: number
  /** Inclusive ISO date this row takes effect. */
  effectiveFrom: string
  /** Exclusive ISO date it stops applying. Absent means "current". */
  effectiveTo?: string
  nonProjectCommitments: INonProjectCommitment[]
  leave: IMemberLeave[]
  /**
   * Optional holidays this member observes (CAL-9). Those dates stay working
   * days for the project and still generate a stand-up; only this member's
   * capacity drops.
   *
   * Held here rather than on the user because observance is configured
   * alongside the rest of a member's project availability. If it ever needs to
   * be shared across projects it can move without changing the engine, which
   * reads it only through resolveMemberCapacity().
   */
  observedOptionalHolidays: mongoose.Types.ObjectId[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const NonProjectCommitmentSchema = new Schema<INonProjectCommitment>(
  {
    label: { type: String, required: true, trim: true, maxlength: 100 },
    minutesPerDay: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'minutesPerDay must be a whole number of minutes'
      }
    },
    daysOfWeek: {
      type: [Number],
      default: [],
      validate: {
        validator: (days: number[]) => days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        message: 'daysOfWeek must be integers between 0 (Sunday) and 6 (Saturday)'
      }
    }
  },
  { _id: false }
)

const MemberLeaveSchema = new Schema<IMemberLeave>(
  {
    startDate: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Leave startDate must be an ISO date, YYYY-MM-DD']
    },
    endDate: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Leave endDate must be an ISO date, YYYY-MM-DD']
    },
    minutesPerDay: {
      type: Number,
      min: 0,
      validate: {
        validator: (value?: number) => value === undefined || Number.isInteger(value),
        message: 'minutesPerDay must be a whole number of minutes'
      }
    },
    reason: { type: String, trim: true, maxlength: 300 },
    source: {
      type: String,
      enum: ['manual', 'leave_module'],
      default: 'manual'
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
)

const MemberCapacitySchema = new Schema<IMemberCapacity>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dailyCapacityMinutes: {
      type: Number,
      required: true,
      min: 0,
      max: 1440,
      validate: {
        validator: Number.isInteger,
        message: 'dailyCapacityMinutes must be a whole number of minutes'
      }
    },
    effectiveFrom: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'effectiveFrom must be an ISO date, YYYY-MM-DD']
    },
    effectiveTo: {
      type: String,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'effectiveTo must be an ISO date, YYYY-MM-DD']
    },
    nonProjectCommitments: { type: [NonProjectCommitmentSchema], default: [] },
    leave: { type: [MemberLeaveSchema], default: [] },
    observedOptionalHolidays: [{ type: Schema.Types.ObjectId, ref: 'Holiday' }],
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
)

// Resolving capacity "as of" a date walks this index backwards from the target.
MemberCapacitySchema.index({ project: 1, member: 1, effectiveFrom: -1 })
MemberCapacitySchema.index({ project: 1, isActive: 1 })

export const MemberCapacity =
  mongoose.models.MemberCapacity ||
  mongoose.model<IMemberCapacity>('MemberCapacity', MemberCapacitySchema)
