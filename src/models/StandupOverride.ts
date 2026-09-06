import mongoose, { Schema, type Document, type Types } from 'mongoose'

export const OVERRIDE_TYPES = [
  'under_allocation', 'over_allocation', 'skip_reestimate',
  'duplicate_allocation', 'complete_with_absent_facilitator_role'
] as const
export type OverrideType = (typeof OVERRIDE_TYPES)[number]

export interface IStandupOverride extends Document {
  standup: Types.ObjectId
  sprint: Types.ObjectId
  project: Types.ObjectId
  organization: Types.ObjectId
  type: OverrideType
  affectedMemberIds: Types.ObjectId[]
  affectedTaskIds: Types.ObjectId[]
  reasonCode: string
  justification: string
  gapMinutes: number
  memberAcknowledged: boolean
  linkedCarryForwardId?: Types.ObjectId
  issuedBy: Types.ObjectId
  issuedAt: Date
  createdAt: Date
  updatedAt: Date
}

const StandupOverrideSchema = new Schema<IStandupOverride>(
  {
    standup: { type: Schema.Types.ObjectId, ref: 'Standup', required: true, index: true },
    sprint: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    type: { type: String, enum: OVERRIDE_TYPES, required: true },
    affectedMemberIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    affectedTaskIds: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
    reasonCode: { type: String, required: true },
    justification: {
      type: String,
      required: true,
      minlength: [20, 'A justification needs at least 20 characters.']
    },
    gapMinutes: { type: Number, required: true, default: 0 },
    memberAcknowledged: { type: Boolean, required: true, default: false },
    linkedCarryForwardId: { type: Schema.Types.ObjectId, ref: 'CarryForwardItem' },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    issuedAt: { type: Date, required: true, default: () => new Date() }
  },
  { timestamps: true }
)

StandupOverrideSchema.index({ standup: 1 })
StandupOverrideSchema.index({ sprint: 1, type: 1 })

export const StandupOverride =
  (mongoose.models.StandupOverride as mongoose.Model<IStandupOverride>) ||
  mongoose.model<IStandupOverride>('StandupOverride', StandupOverrideSchema)
