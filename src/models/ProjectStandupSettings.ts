import mongoose, { Schema, Document } from 'mongoose'

/**
 * How an estimate overrun affects the following day's capacity (spec VAR-4).
 *
 * - `absorb`  — capacity stays nominal and the overrun shows as estimate debt
 *   the member is expected to make up. The estimate is the commitment.
 * - `reduce`  — tomorrow's allocatable capacity drops by the overrun, so the
 *   plan reflects reality. A settlement ledger entry is posted at completion so
 *   the debt is consumed exactly once.
 *
 * Both must ship in release one. Changing the setting affects only stand-ups
 * that have not been completed.
 */
export const OVERRUN_POLICIES = ['absorb', 'reduce'] as const
export type OverrunPolicy = typeof OVERRUN_POLICIES[number]

/**
 * Per-project stand-up configuration (spec §16.2 `projectStandupSettings`,
 * surfaced on the §15.3 Stand-up Configuration screen).
 *
 * Hour-valued fields from the spec are stored as **minutes** here. The spec's
 * own ALO-2/DAT-2 mandate integer-minute arithmetic while its illustrative
 * schema still shows hours; minutes win, so tolerances and capacities never
 * round-trip through a float.
 */
export interface IProjectStandupSettings extends Document {
  project: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId

  /**
   * Master switch. The module is opt-in per project: generation only applies to
   * sprints that reach Planned after this is turned on, so sprints already
   * running when the module ships are untouched.
   */
  enabled: boolean

  /** Local wall-clock time, `HH:mm`. Combined with the calendar timezone per CAL-6. */
  standupLocalTime: string
  durationMinutes: number
  /** Lead time before the start at which the stand-up becomes Ready (SCH-8). */
  readyLeadMinutes: number
  /** Lead time for the N1 reminder. 0 disables it. */
  reminderLeadMinutes: number
  meetingUrl?: string
  defaultFacilitator?: mongoose.Types.ObjectId

  overrunPolicy: OverrunPolicy
  /** Allocation-status tolerances (ALO-3). Default 15 minutes = 0.25h. */
  underToleranceMinutes: number
  overToleranceMinutes: number

  /** Age in stand-ups at which a carry-forward note becomes mandatory (CFW-3). */
  carryForwardNoteThreshold: number
  carryForwardEscalationThreshold: number

  reopenWindowHours: number
  backfillWindowWorkingDays: number

  allowSelfSelect: boolean
  allowMemberPreEdit: boolean
  carryDebtBetweenSprints: boolean
  crossSprintCarryForward: boolean
  blockedTasksConsumeCapacity: boolean
  requireOverAllocationAck: boolean

  /** Story-point conversion factor (PLN-13). */
  pointsToHours: number

  /** Per-project notification switches keyed N1..N12; user prefs take precedence. */
  notificationSwitches: Record<string, boolean>

  createdAt: Date
  updatedAt: Date
  updatedBy?: mongoose.Types.ObjectId
}

/** All twelve notification types default on except N3 (stand-up started). */
const defaultNotificationSwitches = (): Record<string, boolean> => ({
  N1: true,
  N2: true,
  N3: false,
  N4: true,
  N5: true,
  N6: true,
  N7: true,
  N8: true,
  N9: true,
  N10: true,
  N11: true,
  N12: true
})

const ProjectStandupSettingsSchema = new Schema<IProjectStandupSettings>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },

    enabled: { type: Boolean, default: false },

    standupLocalTime: {
      type: String,
      default: '09:15',
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'standupLocalTime must be HH:mm']
    },
    durationMinutes: { type: Number, default: 15, min: 5, max: 60 },
    readyLeadMinutes: { type: Number, default: 15, min: 5, max: 120 },
    reminderLeadMinutes: { type: Number, default: 60, min: 0, max: 1440 },
    meetingUrl: { type: String, trim: true, maxlength: 500 },
    defaultFacilitator: { type: Schema.Types.ObjectId, ref: 'User' },

    overrunPolicy: {
      type: String,
      enum: [...OVERRUN_POLICIES],
      default: 'absorb'
    },
    underToleranceMinutes: { type: Number, default: 15, min: 0, max: 120 },
    overToleranceMinutes: { type: Number, default: 15, min: 0, max: 120 },

    carryForwardNoteThreshold: { type: Number, default: 3, min: 1, max: 10 },
    carryForwardEscalationThreshold: {
      type: Number,
      default: 5,
      min: 1,
      max: 20,
      validate: {
        validator: function (this: IProjectStandupSettings, value: number) {
          return value > this.carryForwardNoteThreshold
        },
        message: 'Escalation threshold must exceed the note threshold'
      }
    },

    reopenWindowHours: { type: Number, default: 24, min: 0, max: 120 },
    backfillWindowWorkingDays: { type: Number, default: 2, min: 0, max: 5 },

    allowSelfSelect: { type: Boolean, default: false },
    allowMemberPreEdit: { type: Boolean, default: true },
    carryDebtBetweenSprints: { type: Boolean, default: false },
    crossSprintCarryForward: { type: Boolean, default: false },
    blockedTasksConsumeCapacity: { type: Boolean, default: false },
    requireOverAllocationAck: { type: Boolean, default: true },

    pointsToHours: { type: Number, default: 4, min: 0.5, max: 40 },

    notificationSwitches: {
      type: Schema.Types.Mixed,
      default: defaultNotificationSwitches
    },

    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
)

ProjectStandupSettingsSchema.index({ project: 1 }, { unique: true })

export const ProjectStandupSettings =
  mongoose.models.ProjectStandupSettings ||
  mongoose.model<IProjectStandupSettings>('ProjectStandupSettings', ProjectStandupSettingsSchema)
