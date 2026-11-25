import mongoose, { Schema, Document } from 'mongoose'

/**
 * One applied allocation change — the audit trail behind the History tab.
 *
 * Written only when a change actually reaches the sheet: `direct` for an
 * Admin/HR edit, `approved` when a request is approved (then `changedBy` is the
 * requester and `approvedBy` the approver). Rejected and cancelled requests
 * live on `AllocationRequest` and are not duplicated here. Rows are never
 * updated, so there is no `updatedAt`.
 */
export interface IAllocationHistory extends Document {
  organization: mongoose.Types.ObjectId
  member: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  changedBy: mongoose.Types.ObjectId
  approvedBy?: mongoose.Types.ObjectId
  request?: mongoose.Types.ObjectId
  previousPercent: number
  newPercent: number
  reason: string
  kind: 'direct' | 'approved'
  createdAt: Date
}

const AllocationHistorySchema = new Schema<IAllocationHistory>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    request: { type: Schema.Types.ObjectId, ref: 'AllocationRequest' },
    previousPercent: { type: Number, required: true, min: 0, max: 100 },
    newPercent: { type: Number, required: true, min: 0, max: 100 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    kind: { type: String, enum: ['direct', 'approved'], required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

AllocationHistorySchema.index({ organization: 1, createdAt: -1 })
AllocationHistorySchema.index({ organization: 1, member: 1, createdAt: -1 })

export const AllocationHistory =
  mongoose.models.AllocationHistory ||
  mongoose.model<IAllocationHistory>('AllocationHistory', AllocationHistorySchema)
