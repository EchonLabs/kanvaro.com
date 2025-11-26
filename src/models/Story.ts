import mongoose, { Schema, Document } from 'mongoose'

export interface IStory extends Document {
  title: string
  description: string
  acceptanceCriteria: string[]
  project: mongoose.Types.ObjectId
  epic?: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  assignedTo?: mongoose.Types.ObjectId
  status: 'backlog' | 'in_progress' | 'completed' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  storyPoints?: number
  estimatedHours?: number
  actualHours?: number
  sprint?: mongoose.Types.ObjectId
  startDate?: Date
  dueDate?: Date
  completedAt?: Date
  tags: string[]
  attachments: {
    name: string
    url: string
    size: number
    type: string
    uploadedBy: mongoose.Types.ObjectId
    uploadedAt: Date
  }[]
  archived: boolean
  createdAt: Date
  updatedAt: Date
}

const StorySchema = new Schema<IStory>({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 2000
  },
  acceptanceCriteria: [{
    type: String,
    trim: true,
    maxlength: 500
  }],
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  epic: {
    type: Schema.Types.ObjectId,
    ref: 'Epic'
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['backlog', 'in_progress', 'completed', 'done', 'cancelled'],
    default: 'backlog'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  storyPoints: {
    type: Number,
    min: 0
  },
  estimatedHours: {
    type: Number,
    min: 0
  },
  actualHours: {
    type: Number,
    min: 0,
    default: 0
  },
  sprint: {
    type: Schema.Types.ObjectId,
    ref: 'Sprint'
  },
  startDate: Date,
  dueDate: Date,
  completedAt: Date,
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  attachments: [{
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    type: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],
  archived: { type: Boolean, default: false }
}, {
  timestamps: true
})

// Indexes
StorySchema.index({ project: 1 })
StorySchema.index({ epic: 1 })
StorySchema.index({ createdBy: 1 })
StorySchema.index({ assignedTo: 1 })
StorySchema.index({ sprint: 1 })
StorySchema.index({ status: 1 })
StorySchema.index({ priority: 1 })
StorySchema.index({ project: 1, status: 1 })
StorySchema.index({ sprint: 1, status: 1 })
StorySchema.index({ archived: 1 })
StorySchema.index({ project: 1, archived: 1 })

export const Story = mongoose.models.Story || mongoose.model<IStory>('Story', StorySchema)
