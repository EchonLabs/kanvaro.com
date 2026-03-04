import mongoose, { Schema, Document } from 'mongoose'

export interface ITimeEntry extends Document {
  user: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  task?: mongoose.Types.ObjectId
  description: string
  startTime: Date
  endTime?: Date
  duration: number // in minutes
  isBillable: boolean
  hourlyRate?: number
  status: 'running' | 'paused' | 'completed' | 'cancelled'
  category?: string
  tags: string[]
  notes?: string
  approvedBy?: mongoose.Types.ObjectId
  approvedAt?: Date
  isApproved: boolean
  isReject: boolean
  createdAt: Date
  updatedAt: Date
}

const TimeEntrySchema = new Schema<ITimeEntry>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  task: {
    type: Schema.Types.ObjectId,
    ref: 'Task'
  },
  description: {
    type: String,
    required: true, 
    trim: true,
    maxlength: 500,
    default: ''
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: Date,
  duration: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  isBillable: {
    type: Boolean,
    default: true
  },
  hourlyRate: {
    type: Number,
    min: 0
  },
  status: {
    type: String,
    enum: ['running', 'paused', 'completed', 'cancelled'],
    default: 'running'
  },
  category: {
    type: String,
    trim: true,
    maxlength: 100
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  notes: {
    type: String,
    maxlength: 1000
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  isApproved: {
    type: Boolean,
    default: false
  },
  isReject: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
})

// Indexes for efficient queries
TimeEntrySchema.index({ user: 1, organization: 1 })
TimeEntrySchema.index({ project: 1, status: 1 })
TimeEntrySchema.index({ task: 1 })
TimeEntrySchema.index({ startTime: 1, endTime: 1 })
TimeEntrySchema.index({ user: 1, startTime: 1 })
TimeEntrySchema.index({ organization: 1, startTime: 1 })
TimeEntrySchema.index({ isBillable: 1, isApproved: 1 })
TimeEntrySchema.index({ status: 1, isApproved: 1 })

// Virtual for total cost
TimeEntrySchema.virtual('totalCost').get(function() {
  if (this.hourlyRate && this.duration) {
    return (this.hourlyRate * this.duration) / 60
  }
  return 0
})

// Pre-save middleware to calculate duration
TimeEntrySchema.pre('save', function(next) {
  if (this.endTime && this.startTime) {
    this.duration = Math.round((this.endTime.getTime() - this.startTime.getTime()) / (1000 * 60))
  }
  next()
})

export const TimeEntry = mongoose.models.TimeEntry || mongoose.model<ITimeEntry>('TimeEntry', TimeEntrySchema)
