import mongoose, { Schema, Document } from 'mongoose'

export interface IEpic extends Document {
  title: string
  description: string
  project: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  assignedTo?: mongoose.Types.ObjectId
  status: 'backlog' | 'in_progress' | 'completed' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  storyPoints?: number
  estimatedHours?: number
  actualHours?: number
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

const EpicSchema = new Schema<IEpic>({
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
EpicSchema.index({ project: 1 })
EpicSchema.index({ createdBy: 1 })
EpicSchema.index({ assignedTo: 1 })
EpicSchema.index({ status: 1 })
EpicSchema.index({ priority: 1 })
EpicSchema.index({ project: 1, status: 1 })
EpicSchema.index({ archived: 1 })
EpicSchema.index({ project: 1, archived: 1 })

export const Epic = mongoose.models.Epic || mongoose.model<IEpic>('Epic', EpicSchema)
