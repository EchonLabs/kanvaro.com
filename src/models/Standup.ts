import mongoose, { Schema, Document } from 'mongoose'

/**
 * The eight lifecycle states of spec §10.1.
 *
 * Order matters only for readability; the legal transitions live in
 * `src/lib/standup/lifecycle.ts`, deliberately outside the schema so the
 * machine can be exhaustively tested without a database.
 */
export const STANDUP_STATUSES = [
  'Scheduled',
  'Ready',
  'In_Progress',
  'Completed',
  'Reopened',
  'Missed',
  'Skipped_Holiday',
  'Cancelled'
] as const
export type StandupStatus = typeof STANDUP_STATUSES[number]

/**
 * The three stand-up shapes (spec §5.2, RUN-1).
 *
 * Derived from the sprint day number, never chosen by the PM. Stored because
 * every read of the schedule needs it and recomputing it per row would mean
 * loading the whole working-day set to render one line.
 */
export const STANDUP_SHAPES = ['day_one', 'mid_sprint', 'final_day'] as const
export type StandupShape = typeof STANDUP_SHAPES[number]

/** Attendance states (spec RUN-6). Everyone defaults to present. */
export const ATTENDANCE_STATES = [
  'present',
  'absent_planned',
  'absent_unplanned',
  'partial'
] as const
export type AttendanceState = typeof ATTENDANCE_STATES[number]

export interface IStandupAttendance {
  user: mongoose.Types.ObjectId
  state: AttendanceState
  note?: string
}

/**
 * A calendar change that could not be applied because the stand-up was already
 * Completed (CAL-12 Completed row, CAL-16, AC-4). The stand-up keeps its data;
 * this note records that the day it ran is no longer considered a working day.
 */
export interface ICalendarAnomaly {
  recordedAt: Date
  reason: string
}

export interface IStandup extends Document {
  project: mongoose.Types.ObjectId
  sprint: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId

  /**
   * Project-local calendar date, `YYYY-MM-DD` (CAL-5). **Never a Date.**
   * A `Date` here would be stored as a UTC instant, so changing the project
   * timezone — a supported operation (SCH-6) — could silently move a stand-up
   * onto the previous day.
   */
  standupDate: string
  /** UTC instant derived from `standupDate` + the project's local stand-up time. */
  scheduledStartAt: Date
  durationMinutes: number

  /** Ordinal among the sprint's **working** days. Recomputed on every reconcile (CAL-14). */
  sprintDayNumber: number
  totalSprintDays: number
  /**
   * CAL-14: what the day number said when this stand-up completed. Frozen at
   * completion so a later calendar change cannot rewrite what people saw.
   */
  displayedDayNumber?: number
  shape: StandupShape

  status: StandupStatus
  facilitator: mongoose.Types.ObjectId
  expectedAttendees: mongoose.Types.ObjectId[]
  attendance: IStandupAttendance[]
  meetingUrl?: string

  /** Optimistic concurrency (RUN-23). Bumped by every mutation; mismatch → 409. */
  version: number

  startedAt?: Date
  /** RUN-3: starting late is recorded, never blocked. */
  startedLateByMinutes?: number
  completedAt?: Date
  wasBackfilled: boolean
  backfilledAt?: Date
  missedAt?: Date
  /** Why the day stopped being a working day (UI-9 shows this verbatim). */
  skippedReason?: string
  cancelledReason?: string
  calendarAnomalies: ICalendarAnomaly[]

  /** SCH-9 pre-stand-up snapshot. Shape owned by `lib/standup/snapshot.ts`. */
  snapshot?: Record<string, unknown>
  snapshotBuiltAt?: Date

  /**
   * SCH-17's dedupe ledger, keyed by notification id (`N1`, `N2`, `N8`…).
   * A job that re-runs finds the key present and sends nothing.
   */
  notificationsSent: Record<string, Date>

  createdAt: Date
  updatedAt: Date
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const AttendanceSchema = new Schema<IStandupAttendance>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    state: { type: String, enum: ATTENDANCE_STATES, default: 'present' },
    note: { type: String, trim: true, maxlength: 1000 }
  },
  { _id: false }
)

const CalendarAnomalySchema = new Schema<ICalendarAnomaly>(
  {
    recordedAt: { type: Date, required: true },
    reason: { type: String, required: true, maxlength: 500 }
  },
  { _id: false }
)

const StandupSchema = new Schema<IStandup>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    sprint: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },

    standupDate: {
      type: String,
      required: true,
      validate: {
        validator: (value: string) => ISO_DATE.test(value),
        message: 'standupDate must be an ISO calendar date, YYYY-MM-DD'
      }
    },
    scheduledStartAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 1, max: 480 },

    sprintDayNumber: { type: Number, required: true, min: 1 },
    totalSprintDays: { type: Number, required: true, min: 1 },
    displayedDayNumber: { type: Number, min: 1 },
    shape: { type: String, enum: STANDUP_SHAPES, required: true },

    status: { type: String, enum: STANDUP_STATUSES, required: true, default: 'Scheduled' },
    facilitator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expectedAttendees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    attendance: { type: [AttendanceSchema], default: [] },
    meetingUrl: { type: String, trim: true },

    version: { type: Number, default: 0 },

    startedAt: { type: Date },
    startedLateByMinutes: { type: Number, min: 0 },
    completedAt: { type: Date },
    wasBackfilled: { type: Boolean, default: false },
    backfilledAt: { type: Date },
    missedAt: { type: Date },
    skippedReason: { type: String, maxlength: 500 },
    cancelledReason: { type: String, maxlength: 500 },
    calendarAnomalies: { type: [CalendarAnomalySchema], default: [] },

    snapshot: { type: Schema.Types.Mixed },
    snapshotBuiltAt: { type: Date },

    notificationsSent: { type: Schema.Types.Mixed, default: () => ({}) }
  },
  { timestamps: true }
)

/**
 * SCH-2's idempotence key. This index — not application logic — is what makes
 * two concurrent generators safe (E10): the loser gets E11000 and treats it as
 * a skip.
 */
StandupSchema.index({ sprint: 1, standupDate: 1 }, { unique: true })

/** The scan every scheduler job runs: due stand-ups for a project, by status. */
StandupSchema.index({ project: 1, status: 1, scheduledStartAt: 1 })

/** Schedule reads and renumbering both walk a sprint in day order. */
StandupSchema.index({ sprint: 1, sprintDayNumber: 1 })

export const Standup =
  (mongoose.models.Standup as mongoose.Model<IStandup>) ||
  mongoose.model<IStandup>('Standup', StandupSchema)
