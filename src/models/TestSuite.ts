import mongoose, { Schema, Document } from 'mongoose'

export interface ITestSuite extends Document {
  name: string
  description?: string
  organization: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  parentSuite?: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  isActive: boolean
  order: number
  tags: string[]
  customFields: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

const TestSuiteSchema = new Schema<ITestSuite>({
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
  parentSuite: {
    type: Schema.Types.ObjectId,
    ref: 'TestSuite'
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
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
TestSuiteSchema.index({ organization: 1, project: 1 })
TestSuiteSchema.index({ project: 1, parentSuite: 1 })
TestSuiteSchema.index({ organization: 1, isActive: 1 })
TestSuiteSchema.index({ name: 'text', description: 'text' })

export const TestSuite = mongoose.models.TestSuite || mongoose.model<ITestSuite>('TestSuite', TestSuiteSchema)
