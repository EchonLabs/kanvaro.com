import mongoose, { Schema, Document } from 'mongoose'

/**
 * Holiday classification (spec CAL-8).
 *
 * - `public`  — everyone is off. Removes the working day entirely.
 * - `company` — organisation-wide closure. Behaves like `public`.
 * - `optional` — CAL-9: does **not** remove the working day. The stand-up still
 *   runs; only members who marked themselves as observing it lose capacity, and
 *   the stand-up shows an advisory banner.
 */
export const HOLIDAY_TYPES = ['public', 'company', 'optional'] as const
export type HolidayType = typeof HOLIDAY_TYPES[number]

/**
 * A single dated holiday inside a set.
 *
 * Deliberately stores an explicit date rather than a recurrence rule. Most
 * holidays in the calendars this module has to support are lunar — Poya days
 * shift ~11 days a year and 2026 has thirteen of them, Islamic dates are fixed
 * by moon sighting and can move at short notice — so no rule could generate
 * them. Genuinely fixed closures (Christmas, May Day) are expressed as
 * recurring *project overrides* instead, which is where CAL's
 * `recurringAnnually` flag lives.
 */
export interface IHoliday extends Document {
  holidaySet: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId
  name: string
  /** Timezone-independent ISO date, `YYYY-MM-DD` (CAL-5). Never a Date. */
  date: string
  type: HolidayType
  isFullDay: boolean
  /** Required when `isFullDay` is false. Stored as minutes (DAT-2). */
  minutesIfPartial?: number
  createdBy?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const HolidaySchema = new Schema<IHoliday>(
  {
    holidaySet: {
      type: Schema.Types.ObjectId,
      ref: 'HolidaySet',
      required: true
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    date: {
      type: String,
      required: true,
      // Calendar dates are timezone independent (CAL-5). Storing a Date here
      // would make "which day is this" depend on the server's zone.
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Holiday date must be an ISO date, YYYY-MM-DD']
    },
    type: {
      type: String,
      enum: [...HOLIDAY_TYPES],
      required: true,
      default: 'public'
    },
    isFullDay: {
      type: Boolean,
      default: true
    },
    minutesIfPartial: {
      type: Number,
      min: 0,
      required: function (this: { isFullDay?: boolean }) {
        return this.isFullDay === false
      },
      validate: {
        validator: Number.isInteger,
        message: 'minutesIfPartial must be a whole number of minutes'
      }
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
)

// Primary lookup: resolving a date range for a project's subscribed sets.
HolidaySchema.index({ holidaySet: 1, date: 1 })
HolidaySchema.index({ organization: 1, date: 1 })
// Two holidays may legitimately share a date — in 2026 Sri Lanka, 1 May is both
// May Day and Vesak Poya — so the uniqueness key includes the name.
HolidaySchema.index({ holidaySet: 1, date: 1, name: 1 }, { unique: true })

export const Holiday =
  mongoose.models.Holiday || mongoose.model<IHoliday>('Holiday', HolidaySchema)
