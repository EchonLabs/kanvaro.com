import mongoose, { Schema, Document } from 'mongoose'

export interface IActiveTimer extends Document {
  user: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  task?: mongoose.Types.ObjectId
  description: string
  startTime: Date
  pausedAt?: Date
  totalPausedDuration: number // in minutes
  category?: string
  tags: string[]
  isBillable: boolean
  hourlyRate?: number
  maxSessionHours: number // Auto-stop after this many hours
  lastActivity: Date
  createdAt: Date
  updatedAt: Date
}

const ActiveTimerSchema = new Schema<IActiveTimer>({
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
    maxlength: 500
  },
  startTime: {
    type: Date,
    required: true
  },
  pausedAt: Date,
  totalPausedDuration: {
    type: Number,
    default: 0,
    min: 0
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
  isBillable: {
    type: Boolean,
    default: true
  },
  hourlyRate: {
    type: Number,
    min: 0
  },
  maxSessionHours: {
    type: Number,
    default: 8,
    min: 1,
    max: 24
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
})

// Indexes
ActiveTimerSchema.index({ user: 1, organization: 1 }, { unique: true })
ActiveTimerSchema.index({ user: 1 })
ActiveTimerSchema.index({ organization: 1 })
ActiveTimerSchema.index({ project: 1 })
ActiveTimerSchema.index({ task: 1 })
ActiveTimerSchema.index({ lastActivity: 1 })

// Virtual for current duration
ActiveTimerSchema.virtual('currentDuration').get(function() {
  const now = new Date()
  const baseDuration = (now.getTime() - this.startTime.getTime()) / (1000 * 60)
  return Math.max(0, baseDuration - this.totalPausedDuration)
})

// Virtual for current cost
ActiveTimerSchema.virtual('currentCost').get(function() {
  if (this.hourlyRate) {
    const now = new Date()
    const baseDuration = (now.getTime() - this.startTime.getTime()) / (1000 * 60)
    const currentDuration = Math.max(0, baseDuration - this.totalPausedDuration)
    return (this.hourlyRate * currentDuration) / 60
  }
  return 0
})

// Virtual for isPaused
ActiveTimerSchema.virtual('isPaused').get(function() {
  return !!this.pausedAt
})

// Pre-save middleware to update lastActivity
ActiveTimerSchema.pre('save', function(next) {
  this.lastActivity = new Date()
  next()
})

export const ActiveTimer = mongoose.models.ActiveTimer || mongoose.model<IActiveTimer>('ActiveTimer', ActiveTimerSchema)
