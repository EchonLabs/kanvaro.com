import mongoose, { Schema, Document } from 'mongoose'

/**
 * A named collection of holidays an organisation maintains, typically one per
 * country or office (spec CAL-7). Projects subscribe to zero or more.
 *
 * Sets are **perpetual, not per-year**. Most Sri Lankan holidays are lunar and
 * cannot be generated from a rule, so each year's gazette is imported into the
 * same set as it is published. Year-scoped sets would force every project to
 * re-subscribe annually, and a forgotten subscription would silently generate
 * stand-ups on public holidays — the worst failure mode this module has.
 *
 * The trade-off is that a set can run out of loaded dates. That is handled by
 * deriving coverage from the holidays themselves and warning when a sprint runs
 * past the last loaded date, so a gap announces itself instead of hiding.
 */
export interface IHolidaySet extends Document {
  organization: mongoose.Types.ObjectId
  name: string
  description?: string
  /** ISO 3166-1 alpha-2, e.g. "LK". Advisory only — sets are not required to be national. */
  countryCode?: string
  isActive: boolean
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const HolidaySetSchema = new Schema<IHolidaySet>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500
    },
    countryCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 2
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
)

// One set name per organisation, so "Sri Lanka Public Holidays" is unambiguous
// when a project picks subscriptions.
HolidaySetSchema.index({ organization: 1, name: 1 }, { unique: true })

export const HolidaySet =
  mongoose.models.HolidaySet || mongoose.model<IHolidaySet>('HolidaySet', HolidaySetSchema)
