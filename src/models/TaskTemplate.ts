import mongoose, { Schema, Document } from 'mongoose'

export interface ITaskTemplate extends Document {
  name: string
  description: string
  organization: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  isPublic: boolean
  category: string
  tags: string[]
  template: {
    title: string
    description: string
    priority: 'low' | 'medium' | 'high' | 'critical'
    type: 'bug' | 'feature' | 'improvement' | 'task' | 'subtask'
    storyPoints?: number
    estimatedHours?: number
    labels: string[]
    acceptanceCriteria?: string[]
    dependencies?: string[] // Template dependency names
    subtasks?: Array<{
      title: string
      description: string
      priority: 'low' | 'medium' | 'high' | 'critical'
      type: 'bug' | 'feature' | 'improvement' | 'task' | 'subtask'
      storyPoints?: number
      estimatedHours?: number
      labels: string[]
    }>
  }
  usageCount: number
  createdAt: Date
  updatedAt: Date
}

const TaskTemplateSchema = new Schema<ITaskTemplate>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  category: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  template: {
    title: { type: String, required: true },
    description: String,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    type: {
      type: String,
      enum: ['bug', 'feature', 'improvement', 'task', 'subtask'],
      default: 'task'
    },
    storyPoints: Number,
    estimatedHours: Number,
    labels: [String],
    acceptanceCriteria: [String],
    dependencies: [String],
    subtasks: [{
      title: { type: String, required: true },
      description: String,
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
      },
      type: {
        type: String,
        enum: ['bug', 'feature', 'improvement', 'task', 'subtask'],
        default: 'task'
      },
      storyPoints: Number,
      estimatedHours: Number,
      labels: [String]
    }]
  },
  usageCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
})

// Indexes
TaskTemplateSchema.index({ organization: 1 })
TaskTemplateSchema.index({ createdBy: 1 })
TaskTemplateSchema.index({ isPublic: 1 })
TaskTemplateSchema.index({ category: 1 })
TaskTemplateSchema.index({ tags: 1 })
TaskTemplateSchema.index({ usageCount: -1 })

export const TaskTemplate = mongoose.models.TaskTemplate || mongoose.model<ITaskTemplate>('TaskTemplate', TaskTemplateSchema)
