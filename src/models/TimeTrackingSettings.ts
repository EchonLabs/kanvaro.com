import mongoose, { Schema, Document } from 'mongoose'

export interface ITimeTrackingSettings extends Document {
  organization: mongoose.Types.ObjectId
  project?: mongoose.Types.ObjectId // If null, these are global settings
  allowTimeTracking: boolean
  allowManualTimeSubmission: boolean
  requireApproval: boolean
  allowBillableTime: boolean
  defaultHourlyRate?: number
  maxDailyHours: number
  maxWeeklyHours: number
  maxSessionHours: number // Auto-stop timer after this many hours
  allowOvertime: boolean
  requireDescription: boolean
  requireCategory: boolean
  allowFutureTime: boolean
  allowPastTime: boolean
  pastTimeLimitDays: number // How many days back can users log time
  disableTimeLogEditing: boolean // Whether time log editing is enabled
  timeLogEditMode?: 'days' | 'dayOfMonth' // Mode for time log editing restrictions
  timeLogEditDays?: number // Days after creation within which logs can be edited
  timeLogEditDayOfMonth?: number // Day of month up to which logs can be edited
  roundingRules: {
    enabled: boolean
    increment: number // in minutes (e.g., 15 for 15-minute increments)
    roundUp: boolean
  }
  notifications: {
    onTimerStart: boolean
    onTimerStop: boolean
    onOvertime: boolean
    onApprovalNeeded: boolean
    onTimeSubmitted: boolean
  }
  categories: string[]
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

const TimeTrackingSettingsSchema = new Schema<ITimeTrackingSettings>({
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project'
  },
  allowTimeTracking: {
    type: Boolean,
    default: true
  },
  allowManualTimeSubmission: {
    type: Boolean,
    default: true
  },
  requireApproval: {
    type: Boolean,
    default: false
  },
  allowBillableTime: {
    type: Boolean,
    default: true
  },
  defaultHourlyRate: {
    type: Number,
    min: 0
  },
  maxDailyHours: {
    type: Number,
    default: 12,
    min: 1,
    max: 24
  },
  maxWeeklyHours: {
    type: Number,
    default: 60,
    min: 1,
    max: 168
  },
  maxSessionHours: {
    type: Number,
    default: 8,
    min: 1,
    max: 24
  },
  allowOvertime: {
    type: Boolean,
    default: false
  },
  requireDescription: {
    type: Boolean,
    default: true
  },
  requireCategory: {
    type: Boolean,
    default: false
  },
  allowFutureTime: {
    type: Boolean,
    default: false
  },
  allowPastTime: {
    type: Boolean,
    default: true
  },
  pastTimeLimitDays: {
    type: Number,
    default: 30,
    min: 1,
    max: 365
  },
  disableTimeLogEditing: {
    type: Boolean,
    default: false
  },
  timeLogEditMode: {
    type: String,
    enum: ['days', 'dayOfMonth'],
    default: undefined
  },
  timeLogEditDays: {
    type: Number,
    default: 30,
    min: 1,
    max: 365
  },
  timeLogEditDayOfMonth: {
    type: Number,
    default: 15,
    min: 1,
    max: 31
  },
  roundingRules: {
    enabled: {
      type: Boolean,
      default: false
    },
    increment: {
      type: Number,
      default: 15,
      min: 1,
      max: 60
    },
    roundUp: {
      type: Boolean,
      default: true
    }
  },
  notifications: {
    onTimerStart: {
      type: Boolean,
      default: false
    },
    onTimerStop: {
      type: Boolean,
      default: true
    },
    onOvertime: {
      type: Boolean,
      default: true
    },
    onApprovalNeeded: {
      type: Boolean,
      default: true
    },
    onTimeSubmitted: {
      type: Boolean,
      default: true
    }
  },
  categories: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }]
}, {
  timestamps: true
})

// Indexes
TimeTrackingSettingsSchema.index({ organization: 1, project: 1 }, { unique: true, sparse: true })
TimeTrackingSettingsSchema.index({ organization: 1 })

export const TimeTrackingSettings = mongoose.models.TimeTrackingSettings || mongoose.model<ITimeTrackingSettings>('TimeTrackingSettings', TimeTrackingSettingsSchema)
