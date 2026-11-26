import mongoose, { Schema, Document } from 'mongoose'

/**
 * A member's live share of their capacity on one project, as a percentage.
 *
 * One row per organisation × member × project. A change to 0% deletes the row
 * rather than storing it, so "has a row" always means "is allocated". This is
 * the cross-project planning sheet — it is unrelated to the stand-up module's
 * `Allocation` (per-task, per-day minutes).
 */
export interface IResourceAllocation extends Document {
  organization: mongoose.Types.ObjectId
  member: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  percent: number
  updatedBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const ResourceAllocationSchema = new Schema<IResourceAllocation>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    percent: {
      type: Number,
      required: true,
      min: [1, 'Allocation must be a whole number between 1 and 100'],
      max: [100, 'Allocation must be a whole number between 1 and 100'],
      validate: {
        validator: Number.isInteger,
        message: 'Allocation must be a whole number between 1 and 100'
      }
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
)

ResourceAllocationSchema.index({ organization: 1, member: 1, project: 1 }, { unique: true })
ResourceAllocationSchema.index({ organization: 1, project: 1 })

export const ResourceAllocation =
  mongoose.models.ResourceAllocation ||
  mongoose.model<IResourceAllocation>('ResourceAllocation', ResourceAllocationSchema)
