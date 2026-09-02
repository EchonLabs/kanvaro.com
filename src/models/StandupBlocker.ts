import mongoose, { Schema, type Document, type Types } from 'mongoose'

export const BLOCKER_TYPES = [
  'dependency', 'external_party', 'technical', 'resource',
  'decision_needed', 'environment', 'other'
] as const
export type BlockerType = (typeof BLOCKER_TYPES)[number]

export const BLOCKER_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
export type BlockerSeverity = (typeof BLOCKER_SEVERITIES)[number]

export const BLOCKER_STATUSES = ['open', 'in_progress', 'resolved', 'wont_resolve'] as const
export type BlockerStatus = (typeof BLOCKER_STATUSES)[number]

export interface IStandupBlocker extends Document {
  standup: Types.ObjectId
  sprint: Types.ObjectId
  project: Types.ObjectId
  organization: Types.ObjectId
  task?: Types.ObjectId
  raisedBy: Types.ObjectId
  raisedAt: Date
  description: string
  blockerType: BlockerType
  owner?: Types.ObjectId
  targetResolutionDate?: Date
  severity: BlockerSeverity
  status: BlockerStatus
  resolutionNote?: string
  linkedAllocation?: Types.ObjectId
  linkedCarryForwardId?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const StandupBlockerSchema = new Schema<IStandupBlocker>(
  {
    standup: { type: Schema.Types.ObjectId, ref: 'Standup', required: true, index: true },
    sprint: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task' },
    raisedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    raisedAt: { type: Date, required: true, default: () => new Date() },
    description: {
      type: String,
      required: true,
      minlength: [10, 'A blocker description needs at least 10 characters.']
    },
    blockerType: { type: String, enum: BLOCKER_TYPES, required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User' },
    targetResolutionDate: { type: Date },
    severity: { type: String, enum: BLOCKER_SEVERITIES, required: true },
    status: { type: String, enum: BLOCKER_STATUSES, required: true, default: 'open' },
    resolutionNote: {
      type: String,
      validate: {
        validator(this: IStandupBlocker, value: string | undefined) {
          if (this.status !== 'resolved' && this.status !== 'wont_resolve') return true
          return typeof value === 'string' && value.trim().length >= 10
        },
        message: 'A resolution note needs at least 10 characters when resolving a blocker.'
      }
    },
    linkedAllocation: { type: Schema.Types.ObjectId, ref: 'Allocation' },
    linkedCarryForwardId: { type: Schema.Types.ObjectId, ref: 'CarryForwardItem' }
  },
  { timestamps: true }
)

StandupBlockerSchema.index({ sprint: 1, status: 1 })
StandupBlockerSchema.index({ standup: 1 })

export const StandupBlocker =
  (mongoose.models.StandupBlocker as mongoose.Model<IStandupBlocker>) ||
  mongoose.model<IStandupBlocker>('StandupBlocker', StandupBlockerSchema)
