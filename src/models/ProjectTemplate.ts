import mongoose, { Schema, Document } from 'mongoose'

export interface IProjectTemplate extends Document {
  name: string
  description: string
  organization: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  isPublic: boolean
  category: string
  tags: string[]
  template: {
    name: string
    description: string
    status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
    startDate: Date
    endDate?: Date
    budget?: {
      total: number
      currency: string
      categories: {
        materials: number
        overhead: number
        external: number
      }
    }
    settings: {
      allowTimeTracking: boolean
      allowManualTimeSubmission: boolean
      allowExpenseTracking: boolean
      requireApproval: boolean
      notifications: {
        taskUpdates: boolean
        budgetAlerts: boolean
        deadlineReminders: boolean
      }
    }
    customFields: Record<string, any>
    teamMembers: Array<{
      role: 'project_manager' | 'project_member' | 'project_viewer' | 'project_client' | 'project_account_manager'
      placeholder: string
    }>
    epics: Array<{
      title: string
      description: string
      priority: 'low' | 'medium' | 'high' | 'critical'
      storyPoints?: number
      estimatedHours?: number
      tags: string[]
    }>
    sprints: Array<{
      name: string
      description?: string
      startDate: Date
      endDate: Date
      goal?: string
      capacity: number
    }>
    stories: Array<{
      title: string
      description: string
      acceptanceCriteria: string[]
      priority: 'low' | 'medium' | 'high' | 'critical'
      storyPoints?: number
      estimatedHours?: number
      tags: string[]
    }>
    tasks: Array<{
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

const ProjectTemplateSchema = new Schema<IProjectTemplate>({
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
    name: { type: String, required: true },
    description: String,
    status: {
      type: String,
      enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'],
      default: 'planning'
    },
    startDate: { type: Date, required: true },
    endDate: Date,
    budget: {
      total: Number,
      currency: { type: String, default: 'USD' },
      categories: {
        materials: { type: Number, default: 0 },
        overhead: { type: Number, default: 0 },
        external: { type: Number, default: 0 }
      }
    },
    settings: {
      allowTimeTracking: { type: Boolean, default: true },
      allowManualTimeSubmission: { type: Boolean, default: true },
      allowExpenseTracking: { type: Boolean, default: true },
      requireApproval: { type: Boolean, default: false },
      notifications: {
        taskUpdates: { type: Boolean, default: true },
        budgetAlerts: { type: Boolean, default: true },
        deadlineReminders: { type: Boolean, default: true }
      }
    },
    customFields: { type: Schema.Types.Mixed, default: {} },
    teamMembers: [{
      role: {
        type: String,
        enum: ['project_manager', 'project_member', 'project_viewer', 'project_client', 'project_account_manager'],
        required: true
      },
      placeholder: { type: String, required: true }
    }],
    epics: [{
      title: { type: String, required: true },
      description: String,
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
      },
      storyPoints: Number,
      estimatedHours: Number,
      tags: [String]
    }],
    sprints: [{
      name: { type: String, required: true },
      description: String,
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      goal: String,
      capacity: { type: Number, required: true }
    }],
    stories: [{
      title: { type: String, required: true },
      description: String,
      acceptanceCriteria: [String],
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
      },
      storyPoints: Number,
      estimatedHours: Number,
      tags: [String]
    }],
    tasks: [{
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
ProjectTemplateSchema.index({ organization: 1 })
ProjectTemplateSchema.index({ createdBy: 1 })
ProjectTemplateSchema.index({ isPublic: 1 })
ProjectTemplateSchema.index({ category: 1 })
ProjectTemplateSchema.index({ tags: 1 })
ProjectTemplateSchema.index({ usageCount: -1 })

export const ProjectTemplate = mongoose.models.ProjectTemplate || mongoose.model<IProjectTemplate>('ProjectTemplate', ProjectTemplateSchema)
