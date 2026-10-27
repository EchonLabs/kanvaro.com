import mongoose, { Schema, Document } from 'mongoose'

/**
 * Effect of a project-level calendar override (spec CAL-3).
 *
 * CAL-3 is explicit that layer 3 must work in **both** directions: a project
 * must be able to declare a normal working day non-working, and equally to
 * declare "this listed public holiday is not observed here" and get a stand-up
 * on that date. A boolean would only model half of it.
 */
export const CALENDAR_OVERRIDE_EFFECTS = ['non_working', 'observed_as_working'] as const
export type CalendarOverrideEffect = typeof CALENDAR_OVERRIDE_EFFECTS[number]

export interface IWorkingCalendarOverride {
  _id?: mongoose.Types.ObjectId
  /** Timezone-independent ISO date, `YYYY-MM-DD`. */
  date: string
  name: string
  effect: CalendarOverrideEffect
  isPartialDay: boolean
  /** Required when `isPartialDay` is true. Minutes, per DAT-2. */
  minutesIfPartial?: number
  /**
   * Repeats on the same calendar date every year. Only safe for genuinely fixed
   * dates (Christmas, May Day) — never for lunar holidays, which is why holiday
   * *sets* have no equivalent flag and store explicit dates instead.
   */
  recurringAnnually: boolean
  /**
   * Empty means the whole project. When populated, this is a capacity
   * adjustment for those members and **not** a calendar change — CAL-4 forbids
   * member-scoped data from removing a project working day.
   */
  appliesToMemberIds?: mongoose.Types.ObjectId[]
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
}

/**
 * Layers 1 and 3 of the four-layer working-day resolution (spec §7.1).
 *
 * One document with `scope: 'organization'` defines the organisation's working
 * week; one per project overrides it. Layer 2 (holiday sets) is referenced by
 * `subscribedHolidaySetIds`; layer 4 (member exceptions) lives on
 * `MemberCapacity` because it may only ever reduce an individual's capacity.
 */
export interface IWorkingCalendar extends Document {
  scope: 'organization' | 'project'
  organization: mongoose.Types.ObjectId
  /** Required when scope is `project`. */
  project?: mongoose.Types.ObjectId
  /** 0 = Sunday … 6 = Saturday. Defaults to Mon–Fri. */
  workingDaysOfWeek: number[]
  /** Minutes, per DAT-2. 8 hours is stored as 480. */
  standardMinutesPerDay: number
  /**
   * IANA identifier, e.g. `Asia/Colombo`. CAL-6 forbids storing a fixed UTC
   * offset — the instant is computed from wall-clock time plus this id every
   * time, so DST transitions are handled and a half-hour zone like +05:30
   * works without special-casing.
   */
  timezone: string
  subscribedHolidaySets: mongoose.Types.ObjectId[]
  overrides: IWorkingCalendarOverride[]
  createdAt: Date
  updatedAt: Date
}

const WorkingCalendarOverrideSchema = new Schema<IWorkingCalendarOverride>(
  {
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Override date must be an ISO date, YYYY-MM-DD']
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 100
    },
    effect: {
      type: String,
      enum: [...CALENDAR_OVERRIDE_EFFECTS],
      required: true
    },
    isPartialDay: {
      type: Boolean,
      default: false
    },
    minutesIfPartial: {
      type: Number,
      min: 0,
      required: function (this: { isPartialDay?: boolean }) {
        return this.isPartialDay === true
      },
      validate: {
        validator: Number.isInteger,
        message: 'minutesIfPartial must be a whole number of minutes'
      }
    },
    recurringAnnually: {
      type: Boolean,
      default: false
    },
    appliesToMemberIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
)

const WorkingCalendarSchema = new Schema<IWorkingCalendar>(
  {
    scope: {
      type: String,
      enum: ['organization', 'project'],
      required: true
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: function (this: { scope?: string }) {
        return this.scope === 'project'
      }
    },
    workingDaysOfWeek: {
      type: [Number],
      default: [1, 2, 3, 4, 5],
      validate: [
        {
          validator: (days: number[]) => days.length > 0,
          message: 'At least one working day of the week must be selected'
        },
        {
          validator: (days: number[]) => days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
          message: 'Working days must be integers between 0 (Sunday) and 6 (Saturday)'
        },
        {
          validator: (days: number[]) => new Set(days).size === days.length,
          message: 'Working days must not repeat'
        }
      ]
    },
    standardMinutesPerDay: {
      type: Number,
      default: 480,
      min: 30,
      max: 1440,
      validate: {
        validator: Number.isInteger,
        message: 'standardMinutesPerDay must be a whole number of minutes'
      }
    },
    timezone: {
      type: String,
      required: true,
      default: 'UTC'
    },
    subscribedHolidaySets: [
      {
        type: Schema.Types.ObjectId,
        ref: 'HolidaySet'
      }
    ],
    overrides: {
      type: [WorkingCalendarOverrideSchema],
      default: []
    }
  },
  { timestamps: true }
)

// One calendar per project, and one per organisation.
WorkingCalendarSchema.index({ project: 1 }, { unique: true, sparse: true })
WorkingCalendarSchema.index({ organization: 1, scope: 1 })
WorkingCalendarSchema.index({ 'overrides.date': 1 })

export const WorkingCalendar =
  mongoose.models.WorkingCalendar ||
  mongoose.model<IWorkingCalendar>('WorkingCalendar', WorkingCalendarSchema)
