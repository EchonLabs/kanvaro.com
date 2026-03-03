import mongoose, { Schema, Document } from 'mongoose'

export interface INotification extends Document {
  user: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId
  type: 'task' | 'project' | 'team' | 'system' | 'budget' | 'deadline' | 'reminder' | 'invitation' | 'time_tracking' | 'sprint_event'
  title: string
  message: string
  data?: {
    entityType?: 'task' | 'project' | 'epic' | 'sprint' | 'story' | 'user' | 'budget' | 'time_entry' | 'sprint_event'
    entityId?: mongoose.Types.ObjectId
    action?: 'created' | 'updated' | 'deleted' | 'assigned' | 'completed' | 'overdue' | 'reminder' | 'upcoming'
    priority?: 'low' | 'medium' | 'high' | 'critical'
    projectName?: string
    url?: string
    metadata?: Record<string, any>
  }
  isRead: boolean
  readAt?: Date
  sentVia: {
    inApp: boolean
    email: boolean
    push: boolean
  }
  emailSent?: boolean
  pushSent?: boolean
  createdAt: Date
  updatedAt: Date
}

const NotificationSchema = new Schema<INotification>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  type: { 
    type: String, 
    enum: ['task', 'project', 'team', 'system', 'budget', 'deadline', 'reminder', 'invitation', 'time_tracking', 'sprint_event'],
    required: true 
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  data: {
    entityType: { 
      type: String, 
      enum: ['task', 'project', 'epic', 'sprint', 'story', 'user', 'budget', 'time_entry', 'sprint_event']
    },
    entityId: { type: Schema.Types.ObjectId },
    action: { 
      type: String, 
      enum: ['created', 'updated', 'deleted', 'assigned', 'completed', 'overdue', 'reminder', 'upcoming']
    },
    priority: { 
      type: String, 
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    url: String,
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  isRead: { type: Boolean, default: false },
  readAt: Date,
  sentVia: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    push: { type: Boolean, default: false }
  },
  emailSent: { type: Boolean, default: false },
  pushSent: { type: Boolean, default: false }
}, {
  timestamps: true
})

// Indexes for efficient querying
NotificationSchema.index({ user: 1, isRead: 1, createdAt: -1 })
NotificationSchema.index({ organization: 1, type: 1 })
NotificationSchema.index({ 'data.entityId': 1, 'data.entityType': 1 })
NotificationSchema.index({ createdAt: -1 })

export const Notification = mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema)
