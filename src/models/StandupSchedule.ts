import mongoose, { Schema, Document } from 'mongoose'

export interface IStandupScheduleComment {
  _id?: mongoose.Types.ObjectId
  author: mongoose.Types.ObjectId
  authorName?: string
  member?: mongoose.Types.ObjectId
  reason: string
  createdAt: Date
}

export interface IStandupScheduleAssignment {
  member: mongoose.Types.ObjectId
  task: mongoose.Types.ObjectId
  taskTitle: string
  taskStatus?: string
  durationMinutes?: number
  notes?: string
}

export interface IStandupSchedule extends Document {
  project: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId
  title: string
  scheduledDate: Date
  time: string
  durationMinutes: number
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'missed'
  facilitator: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  participants: mongoose.Types.ObjectId[]
  notes?: string
  summary?: string
  actualDate?: Date
  location?: string
  meetingLink?: string
  assignments: IStandupScheduleAssignment[]
  comments: IStandupScheduleComment[]
  archived: boolean
  createdAt: Date
  updatedAt: Date
}

const StandupScheduleSchema = new Schema<IStandupSchedule>({
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  scheduledDate: {
    type: Date,
    required: true
  },
  time: {
    type: String,
    required: true,
    trim: true,
    match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/
  },
  durationMinutes: {
    type: Number,
    required: true,
    min: 1,
    max: 1440
  },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'missed'],
    default: 'scheduled'
  },
  facilitator: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  notes: {
    type: String,
    maxlength: 5000
  },
  summary: {
    type: String,
    maxlength: 5000
  },
  actualDate: {
    type: Date
  },
  location: {
    type: String,
    trim: true,
    maxlength: 200
  },
  meetingLink: {
    type: String,
    trim: true,
    maxlength: 500
  },
  assignments: [{
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    taskTitle: { type: String, required: true, trim: true, maxlength: 200 },
    taskStatus: { type: String, trim: true, maxlength: 100 },
    durationMinutes: { type: Number, min: 0 },
    notes: { type: String, trim: true, maxlength: 1000 }
  }],
  comments: [{
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, trim: true, maxlength: 200 },
    member: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, required: true, trim: true, maxlength: 2000 },
    createdAt: { type: Date, default: Date.now }
  }],
  archived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  collection: 'standupschedules'
})

StandupScheduleSchema.index({ project: 1, scheduledDate: -1 })
StandupScheduleSchema.index({ organization: 1, scheduledDate: -1 })
StandupScheduleSchema.index({ project: 1, status: 1 })
StandupScheduleSchema.index({ facilitator: 1 })
StandupScheduleSchema.index({ createdBy: 1 })
StandupScheduleSchema.index({ archived: 1 })

export const StandupSchedule = mongoose.models.StandupSchedule || mongoose.model<IStandupSchedule>('StandupSchedule', StandupScheduleSchema)