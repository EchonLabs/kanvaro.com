import mongoose, { Schema, Document } from 'mongoose'

export type CronJobType = 'ai_tracker' | 'summary_generator'
export type CronFrequency = 'daily' | 'weekdays' | 'weekly'
export type CronJobStatus = 'idle' | 'running' | 'success' | 'failed'

export interface IStandupCronJob extends Document {
  projectId: mongoose.Types.ObjectId
  organizationId: mongoose.Types.ObjectId
  jobType: CronJobType
  enabled: boolean
  frequency: CronFrequency
  timeHHMM: string
  timezone: string
  bullJobKey?: string
  lastRunAt?: Date
  lastRunStatus: CronJobStatus
  lastRunError?: string
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const StandupCronJobSchema = new Schema<IStandupCronJob>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    jobType: { type: String, enum: ['ai_tracker', 'summary_generator'], required: true },
    enabled: { type: Boolean, default: false },
    frequency: { type: String, enum: ['daily', 'weekdays', 'weekly'], default: 'daily' },
    timeHHMM: { type: String, required: true, trim: true, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: '09:00' },
    timezone: { type: String, default: 'UTC', trim: true },
    bullJobKey: { type: String },
    lastRunAt: { type: Date },
    lastRunStatus: { type: String, enum: ['idle', 'running', 'success', 'failed'], default: 'idle' },
    lastRunError: { type: String, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true, collection: 'standupcronjobs' }
)

StandupCronJobSchema.index({ projectId: 1, jobType: 1 }, { unique: true })
StandupCronJobSchema.index({ organizationId: 1 })

export const StandupCronJob =
  mongoose.models.StandupCronJob ||
  mongoose.model<IStandupCronJob>('StandupCronJob', StandupCronJobSchema)
