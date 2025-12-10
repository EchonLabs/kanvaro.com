import mongoose, { Schema, Document } from 'mongoose'

export interface ISprintEvent extends Document {
  sprint: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  eventType: 'planning' | 'review' | 'retrospective' | 'daily_standup' | 'demo' | 'other'
  title: string
  description?: string
  scheduledDate: Date
  startTime?: string // Time in HH:mm format
  endTime?: string // Time in HH:mm format
  actualDate?: Date
  duration: number // Duration in minutes
  attendees: mongoose.Types.ObjectId[]
  facilitator: mongoose.Types.ObjectId
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  outcomes?: {
    decisions: string[]
    actionItems: {
      description: string
      assignedTo: mongoose.Types.ObjectId
      dueDate: Date
      status: 'pending' | 'in_progress' | 'completed'
    }[]
    notes: string
    velocity?: number
    capacity?: number
  }
  location?: string
  meetingLink?: string
  attachments?: {
    name: string
    url: string
    size: number
    type: string
    uploadedBy: mongoose.Types.ObjectId
    uploadedAt: Date
  }[]
  // Recurrence settings
  recurrence?: {
    type: 'none' | 'daily' | 'weekly' | 'monthly'
    interval: number // e.g., every 1 day, every 2 weeks
    endDate?: Date // When recurrence ends
    daysOfWeek?: number[] // 0 = Sunday, 1 = Monday, etc. (for weekly)
    dayOfMonth?: number // Day of month for monthly recurrence
    occurrences?: number // Maximum number of occurrences
  }
  // Parent event for recurring series
  parentEventId?: mongoose.Types.ObjectId
  // Flag to indicate if this is a recurring series parent
  isRecurringSeries?: boolean
  notificationSettings?: {
    enabled: boolean
    reminderTime?: 'none' | '10mins' | '30mins' | '1hour' | '24hours'
    emailReminder1Day?: boolean // Send email 1 day before at 8 AM
    notificationReminder1Hour?: boolean // Send notification 1 hour before
    notificationReminder15Min?: boolean // Send notification 15 minutes before
  }
  // Track which reminders have been sent
  remindersSent?: {
    email1Day?: boolean
    notification1Hour?: boolean
    notification5Min?: boolean
  }
  createdAt: Date
  updatedAt: Date
}

const SprintEventSchema = new Schema<ISprintEvent>({
  sprint: {
    type: Schema.Types.ObjectId,
    ref: 'Sprint',
    required: true
  },
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  eventType: {
    type: String,
    enum: ['planning', 'review', 'retrospective', 'daily_standup', 'demo', 'other'],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 1000
  },
  scheduledDate: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/ // HH:mm format
  },
  endTime: {
    type: String,
    match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/ // HH:mm format
  },
  actualDate: Date,
  duration: {
    type: Number,
    required: true,
    min: 15, // Minimum 15 minutes
    max: 480 // Maximum 8 hours
  },
  attendees: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  facilitator: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  outcomes: {
    decisions: [String],
    actionItems: [{
      description: { type: String, required: true },
      assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      dueDate: { type: Date, required: true },
      status: { 
        type: String, 
        enum: ['pending', 'in_progress', 'completed'],
        default: 'pending'
      }
    }],
    notes: String,
    velocity: Number,
    capacity: Number
  },
  location: {
    type: String,
    maxlength: 200
  },
  meetingLink: {
    type: String,
    maxlength: 500
  },
  attachments: [{
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    type: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],
  // Recurrence settings
  recurrence: {
    type: {
      type: String,
      enum: ['none', 'daily', 'weekly', 'monthly'],
      default: 'none'
    },
    interval: { type: Number, default: 1, min: 1 },
    endDate: { type: Date },
    daysOfWeek: [{ type: Number, min: 0, max: 6 }], // 0 = Sunday, 6 = Saturday
    dayOfMonth: { type: Number, min: 1, max: 31 },
    occurrences: { type: Number, min: 1 }
  },
  // Parent event for recurring series
  parentEventId: {
    type: Schema.Types.ObjectId,
    ref: 'SprintEvent'
  },
  // Flag to indicate if this is a recurring series parent
  isRecurringSeries: { type: Boolean, default: false },
  notificationSettings: {
    enabled: { type: Boolean, default: false },
    reminderTime: {
      type: String,
      enum: ['none', '10mins', '30mins', '1hour', '24hours'],
      default: 'none'
    },
    emailReminder1Day: { type: Boolean, default: true },
    notificationReminder1Hour: { type: Boolean, default: true },
    notificationReminder15Min: { type: Boolean, default: true }
  },
  // Track which reminders have been sent
  remindersSent: {
    email1Day: { type: Boolean, default: false },
    notification1Hour: { type: Boolean, default: false },
    notification15Min: { type: Boolean, default: false }
  }
}, {
  timestamps: true
})

// Indexes
SprintEventSchema.index({ sprint: 1, eventType: 1 })
SprintEventSchema.index({ project: 1, scheduledDate: 1 })
SprintEventSchema.index({ facilitator: 1 })
SprintEventSchema.index({ status: 1 })
SprintEventSchema.index({ scheduledDate: 1 })
SprintEventSchema.index({ parentEventId: 1 })
SprintEventSchema.index({ 'recurrence.type': 1 })
// Index for reminder processing - find events needing reminders
SprintEventSchema.index({ 
  scheduledDate: 1, 
  status: 1, 
  'remindersSent.email1Day': 1 
})
SprintEventSchema.index({ 
  scheduledDate: 1, 
  status: 1, 
  'remindersSent.notification1Hour': 1 
})

export const SprintEvent = mongoose.models.SprintEvent || mongoose.model<ISprintEvent>('SprintEvent', SprintEventSchema)
