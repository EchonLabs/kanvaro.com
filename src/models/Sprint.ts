import mongoose, { Schema, Document } from 'mongoose'

export interface ISprint extends Document {
  name: string
  description?: string
  organization: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  status: 'planning' | 'active' | 'completed' | 'cancelled'
  startDate: Date
  endDate: Date
  actualStartDate?: Date
  actualEndDate?: Date
  goal?: string
  velocity?: number
  plannedVelocity?: number
  actualVelocity?: number
  capacity: number // Total team capacity in hours
  actualCapacity?: number // Actual capacity used
  teamMembers: mongoose.Types.ObjectId[]
  stories: mongoose.Types.ObjectId[]
  tasks: mongoose.Types.ObjectId[]
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

const SprintSchema = new Schema<ISprint>({
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
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['planning', 'active', 'completed', 'cancelled'],
    default: 'planning'
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  actualStartDate: Date,
  actualEndDate: Date,
  goal: {
    type: String,
    maxlength: 500
  },
  velocity: {
    type: Number,
    min: 0
  },
  plannedVelocity: {
    type: Number,
    min: 0
  },
  actualVelocity: {
    type: Number,
    min: 0
  },
  capacity: {
    type: Number,
    required: true,
    min: 0
  },
  actualCapacity: {
    type: Number,
    min: 0
  },
  teamMembers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  stories: [{
    type: Schema.Types.ObjectId,
    ref: 'Story'
  }],
  tasks: [{
    type: Schema.Types.ObjectId,
    ref: 'Task'
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
SprintSchema.index({ organization: 1 })
SprintSchema.index({ project: 1 })
SprintSchema.index({ createdBy: 1 })
SprintSchema.index({ status: 1 })
SprintSchema.index({ startDate: 1 })
SprintSchema.index({ endDate: 1 })
SprintSchema.index({ project: 1, status: 1 })
SprintSchema.index({ archived: 1 })
SprintSchema.index({ project: 1, archived: 1 })

if (mongoose.models.Sprint) {
  const existingSchema = (mongoose.models.Sprint as mongoose.Model<ISprint>).schema
  if (!existingSchema.path('organization')) {
    existingSchema.add({
      organization: {
        type: Schema.Types.ObjectId,
        ref: 'Organization',
        required: true
      }
    })
  }
  if (!existingSchema.path('teamMembers')) {
    existingSchema.add({
      teamMembers: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
      }]
    })
  }
  if (!existingSchema.path('tasks')) {
    existingSchema.add({
      tasks: [{
        type: Schema.Types.ObjectId,
        ref: 'Task'
      }]
    })
  }
}

export const Sprint = mongoose.models.Sprint || mongoose.model<ISprint>('Sprint', SprintSchema)
