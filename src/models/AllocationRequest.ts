import mongoose, { Schema, Document } from 'mongoose'

export const ALLOCATION_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const
export type AllocationRequestStatus = (typeof ALLOCATION_REQUEST_STATUSES)[number]

export interface IAllocationRequestLine {
  project: mongoose.Types.ObjectId
  previousPercent: number
  newPercent: number
}

/**
 * A project manager's proposed change to one member's allocations, awaiting
 * an Admin/HR decision.
 *
 * `lines` holds only the projects that change, with the value each had when
 * the request was submitted — so an approver can tell when the live sheet has
 * moved on since (a "stale" request). At most one request per member may be
 * pending; the partial unique index enforces that atomically.
 */
export interface IAllocationRequest extends Document {
  organization: mongoose.Types.ObjectId
  member: mongoose.Types.ObjectId
  requestedBy: mongoose.Types.ObjectId
  reason: string
  status: AllocationRequestStatus
  lines: IAllocationRequestLine[]
  totalBefore: number
  totalAfter: number
  decidedBy?: mongoose.Types.ObjectId
  decidedAt?: Date
  decisionNote?: string
  createdAt: Date
  updatedAt: Date
}

const percentField = {
  type: Number,
  required: true,
  min: 0,
  max: 100,
  validate: { validator: Number.isInteger, message: 'Allocation must be a whole number between 0 and 100' }
}

const LineSchema = new Schema<IAllocationRequestLine>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    previousPercent: percentField,
    newPercent: percentField
  },
  { _id: false }
)

const AllocationRequestSchema = new Schema<IAllocationRequest>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: {
      type: String,
      required: [true, 'A reason is required'],
      trim: true,
      maxlength: [500, 'The reason must be 500 characters or fewer']
    },
    status: { type: String, enum: ALLOCATION_REQUEST_STATUSES, default: 'pending' },
    lines: {
      type: [LineSchema],
      validate: {
        validator: (lines: unknown[]) => Array.isArray(lines) && lines.length > 0,
        message: 'A request must change at least one project'
      }
    },
    totalBefore: { type: Number, required: true, min: 0 },
    totalAfter: { type: Number, required: true, min: 0 },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    decisionNote: { type: String, trim: true, maxlength: 500 }
  },
  { timestamps: true }
)

AllocationRequestSchema.index({ organization: 1, status: 1, createdAt: -1 })
AllocationRequestSchema.index({ member: 1, status: 1 })
AllocationRequestSchema.index(
  { organization: 1, member: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_per_member' }
)

export const AllocationRequest =
  mongoose.models.AllocationRequest ||
  mongoose.model<IAllocationRequest>('AllocationRequest', AllocationRequestSchema)
