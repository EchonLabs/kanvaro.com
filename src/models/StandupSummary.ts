import mongoose, { Schema, Document } from 'mongoose'

export interface IStandupSummary extends Document {
  standupScheduleId: mongoose.Types.ObjectId
  projectId: mongoose.Types.ObjectId
  generatedSummary: string
  generatedDate: Date
  createdAt: Date
  updatedAt: Date
}

const StandupSummarySchema = new Schema<IStandupSummary>({
  standupScheduleId: {
    type: Schema.Types.ObjectId,
    ref: 'StandupSchedule',
    required: true,
    unique: true
  },
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  generatedSummary: {
    type: String,
    required: true
  },
  generatedDate: {
    type: Date,
    default: Date.now,
    required: true
  }
}, {
  timestamps: true,
  collection: 'standupsummaries'
})

StandupSummarySchema.index({ standupScheduleId: 1 }, { unique: true })
StandupSummarySchema.index({ projectId: 1 })

export const StandupSummary = mongoose.models.StandupSummary || mongoose.model<IStandupSummary>('StandupSummary', StandupSummarySchema)
