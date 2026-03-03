import mongoose, { Schema, Document } from 'mongoose'

export interface IProjectVersion extends Document {
  name: string
  description?: string
  version: string
  organization: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  releaseDate?: Date
  isReleased: boolean
  isActive: boolean
  tags: string[]
  customFields: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

const ProjectVersionSchema = new Schema<IProjectVersion>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 1000
  },
  version: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
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
  releaseDate: Date,
  isReleased: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  customFields: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
})

// Indexes
ProjectVersionSchema.index({ organization: 1, project: 1 })
ProjectVersionSchema.index({ project: 1, isActive: 1 })
ProjectVersionSchema.index({ project: 1, isReleased: 1 })
ProjectVersionSchema.index({ version: 1, project: 1 }, { unique: true })

export const ProjectVersion = mongoose.models.ProjectVersion || mongoose.model<IProjectVersion>('ProjectVersion', ProjectVersionSchema)
