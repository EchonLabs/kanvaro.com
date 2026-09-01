import mongoose, { Schema, Document } from 'mongoose'

/**
 * The carry-forward register (spec §13, CFW-1..11).
 *
 * "Anything that was open and did not close moves into it, and it will keep
 * appearing every single day until it is resolved. Nothing is allowed to
 * quietly disappear." (§13.1) This model is that memory. It is built only by
 * the engine in `src/lib/standup/carry-forward-service.ts` — CFW-6 forbids a
 * PM creating a row by hand, because every item must trace to a real event.
 * The one exception the spec carves out, a manual `override_followup`, is
 * Phase 10's (OVR-7): the type exists here so the register stays generic, but
 * nothing in this phase writes one.
 */
export const CARRY_FORWARD_ITEM_TYPES = [
  'unfinished_task',
  'unrevised_estimate',
  'open_blocker',
  'owner_absent',
  'unassigned_task',
  'missed_standup_rollup',
  'override_followup',
  'not_started_commitment',
  'cross_sprint'
] as const
export type CarryForwardItemType = typeof CARRY_FORWARD_ITEM_TYPES[number]

/** §13.4. `noted` means a note satisfying CFW-4 has been recorded for the current round. */
export const CARRY_FORWARD_STATUSES = [
  'open',
  'noted',
  'escalated',
  'resolved',
  'closed_descoped',
  'closed_reassigned',
  'closed_sprint_end'
] as const
export type CarryForwardStatus = typeof CARRY_FORWARD_STATUSES[number]

/** The resolutions CFW-7 lets a PM apply directly from the register row. */
export const CARRY_FORWARD_RESOLUTION_TYPES = [
  'done',
  'reassigned',
  'descoped',
  'sprint_end_moved',
  'sprint_end_descoped',
  'sprint_end_closed',
  'acknowledged',
  'other'
] as const
export type CarryForwardResolutionType = typeof CARRY_FORWARD_RESOLUTION_TYPES[number]

/** §13.4's `tags`. Not mutually exclusive with `type` — a tag records provenance, not kind. */
export const CARRY_FORWARD_TAGS = [
  'owner_absent',
  'chronic',
  'from_missed_standup',
  'cross_sprint'
] as const
export type CarryForwardTag = typeof CARRY_FORWARD_TAGS[number]

/** The statuses that mean an item is still live and must keep appearing (CFW-2, CFW-10). */
export const OPEN_CARRY_FORWARD_STATUSES: readonly CarryForwardStatus[] = [
  'open',
  'noted',
  'escalated'
]

export interface ICarryForwardNote {
  standup: mongoose.Types.ObjectId
  standupDate: string
  author: mongoose.Types.ObjectId
  text: string
  createdAt: Date
}

export interface ICarryForwardResolution {
  resolvedAt: Date
  /** Absent when the closing condition was detected automatically (CFW-8, §13.2's "closes when" column). */
  resolvedBy?: mongoose.Types.ObjectId
  resolutionType: CarryForwardResolutionType
  comment?: string
}

export interface ICarryForwardItem extends Document {
  sprint: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId

  type: CarryForwardItemType
  /** Absent for a general blocker (§13.4). */
  task?: mongoose.Types.ObjectId
  /** The owner (§13.4). */
  member?: mongoose.Types.ObjectId

  originStandup: mongoose.Types.ObjectId
  originDate: string
  /** The stand-up it is currently showing on. `null` once past the sprint's last day. */
  currentStandup: mongoose.Types.ObjectId | null

  /** CFW-2: incremented at every stand-up completion where the item was open and not closed. */
  ageInStandups: number

  status: CarryForwardStatus
  notes: ICarryForwardNote[]
  resolution?: ICarryForwardResolution

  linkedOverride?: mongoose.Types.ObjectId
  tags: CarryForwardTag[]

  createdAt: Date
  updatedAt: Date
}

const CarryForwardNoteSchema = new Schema<ICarryForwardNote>(
  {
    standup: { type: Schema.Types.ObjectId, ref: 'Standup', required: true },
    standupDate: { type: String, required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    createdAt: { type: Date, required: true, default: () => new Date() }
  },
  { _id: false }
)

const CarryForwardResolutionSchema = new Schema<ICarryForwardResolution>(
  {
    resolvedAt: { type: Date, required: true },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolutionType: { type: String, enum: CARRY_FORWARD_RESOLUTION_TYPES, required: true },
    comment: { type: String, trim: true, maxlength: 2000 }
  },
  { _id: false }
)

const CarryForwardItemSchema = new Schema<ICarryForwardItem>(
  {
    sprint: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },

    type: { type: String, enum: CARRY_FORWARD_ITEM_TYPES, required: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task' },
    member: { type: Schema.Types.ObjectId, ref: 'User' },

    originStandup: { type: Schema.Types.ObjectId, ref: 'Standup', required: true },
    originDate: { type: String, required: true },
    currentStandup: { type: Schema.Types.ObjectId, ref: 'Standup', default: null },

    ageInStandups: { type: Number, required: true, default: 1, min: 1 },

    status: { type: String, enum: CARRY_FORWARD_STATUSES, required: true, default: 'open' },
    notes: { type: [CarryForwardNoteSchema], default: [] },
    resolution: { type: CarryForwardResolutionSchema },

    linkedOverride: { type: Schema.Types.ObjectId, ref: 'StandupOverride' },
    tags: { type: [String], enum: CARRY_FORWARD_TAGS, default: [] }
  },
  { timestamps: true }
)

/** The register's own read: everything currently open, sorted oldest-first (CFW-10). */
CarryForwardItemSchema.index({ sprint: 1, status: 1, ageInStandups: -1 })

/** The board's read: what is showing on today's stand-up. */
CarryForwardItemSchema.index({ currentStandup: 1, status: 1 })

/** CFW-10's owner filter, and V-side lookups of "does this member have open items". */
CarryForwardItemSchema.index({ sprint: 1, member: 1, status: 1 })

/**
 * The builder's "does an open item already track this obligation" check
 * (CFW-6's idempotency). Not unique — a resolved item must not block a fresh
 * one on the same task from ever being created — so the engine filters on
 * `status` itself rather than leaning on the index for exclusivity.
 */
CarryForwardItemSchema.index({ sprint: 1, type: 1, task: 1, member: 1 })

export const CarryForwardItem =
  (mongoose.models.CarryForwardItem as mongoose.Model<ICarryForwardItem>) ||
  mongoose.model<ICarryForwardItem>('CarryForwardItem', CarryForwardItemSchema)
