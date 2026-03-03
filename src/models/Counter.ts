import mongoose, { Schema, Document } from 'mongoose'

export interface ICounter extends Document {
  scope: 'project' | 'task'
  organization?: mongoose.Types.ObjectId
  project?: mongoose.Types.ObjectId
  seq: number
  updatedAt: Date
}

const CounterSchema = new Schema<ICounter>({
  scope: { type: String, enum: ['project', 'task'], required: true },
  organization: { type: Schema.Types.ObjectId, ref: 'Organization' },
  project: { type: Schema.Types.ObjectId, ref: 'Project' },
  seq: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
})

// Unique keys per scope
CounterSchema.index({ scope: 1, organization: 1 }, { unique: true, partialFilterExpression: { scope: 'project' } })
CounterSchema.index({ scope: 1, project: 1 }, { unique: true, partialFilterExpression: { scope: 'task' } })

export const Counter = mongoose.models.Counter || mongoose.model<ICounter>('Counter', CounterSchema)
