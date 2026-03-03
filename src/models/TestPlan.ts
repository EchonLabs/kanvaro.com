import mongoose, { Schema, Document } from 'mongoose'

export interface ITestPlan extends Document {
  name: string
  description: string
  organization: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  version?: string
  createdBy: mongoose.Types.ObjectId
  assignedTo?: mongoose.Types.ObjectId
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  startDate?: Date
  endDate?: Date
  testCases: mongoose.Types.ObjectId[]
  isActive: boolean
  tags: string[]
  customFields: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

const TestPlanSchema = new Schema<ITestPlan>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 2000
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
  version: {
    type: String,
    trim: true,
    maxlength: 50
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
    enum: ['draft', 'active', 'completed', 'cancelled'],
    default: 'draft'
  },
  startDate: Date,
  endDate: Date,
  testCases: [{
    type: Schema.Types.ObjectId,
    ref: 'TestCase'
  }],
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
TestPlanSchema.index({ organization: 1, project: 1 })
TestPlanSchema.index({ project: 1, status: 1 })
TestPlanSchema.index({ organization: 1, isActive: 1 })
TestPlanSchema.index({ assignedTo: 1 })
TestPlanSchema.index({ name: 'text', description: 'text' })

export const TestPlan = mongoose.models.TestPlan || mongoose.model<ITestPlan>('TestPlan', TestPlanSchema)
