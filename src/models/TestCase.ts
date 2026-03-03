import mongoose, { Schema, Document } from 'mongoose'

export interface ITestCase extends Document {
  title: string
  description: string
  preconditions: string
  steps: Array<{
    step: string
    expectedResult: string
    testData?: string
  }>
  expectedResult: string
  testData: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  category: 'functional' | 'integration' | 'regression' | 'performance' | 'security' | 'usability' | 'compatibility'
  automationStatus: 'not_automated' | 'automated' | 'semi_automated' | 'deprecated'
  requirements: string[]
  estimatedExecutionTime: number // in minutes
  organization: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  testSuite: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  isActive: boolean
  tags: string[]
  customFields: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

const TestCaseSchema = new Schema<ITestCase>({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  preconditions: {
    type: String,
    maxlength: 1000
  },
  steps: [{
    step: {
      type: String,
      required: true,
      maxlength: 500
    },
    expectedResult: {
      type: String,
      required: true,
      maxlength: 500
    },
    testData: {
      type: String,
      maxlength: 200
    }
  }],
  expectedResult: {
    type: String,
    maxlength: 1000
  },
  testData: {
    type: String,
    maxlength: 1000
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['functional', 'integration', 'regression', 'performance', 'security', 'usability', 'compatibility'],
    default: 'functional'
  },
  automationStatus: {
    type: String,
    enum: ['not_automated', 'automated', 'semi_automated', 'deprecated'],
    default: 'not_automated'
  },
  requirements: [{
    type: String,
    trim: true,
    maxlength: 100
  }],
  estimatedExecutionTime: {
    type: Number,
    min: 0,
    default: 15
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
  testSuite: {
    type: Schema.Types.ObjectId,
    ref: 'TestSuite',
    required: true
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
TestCaseSchema.index({ organization: 1, project: 1 })
TestCaseSchema.index({ project: 1, testSuite: 1 })
TestCaseSchema.index({ organization: 1, isActive: 1 })
TestCaseSchema.index({ priority: 1, category: 1 })
TestCaseSchema.index({ automationStatus: 1 })
TestCaseSchema.index({ title: 'text', description: 'text' })

// In dev with HMR, ensure we don't keep stale schema versions (e.g., old fields like testSuiteId)
// Delete existing model so we can safely recompile with the current schema shape.
if (mongoose.models.TestCase) {
  delete mongoose.models.TestCase
}
export const TestCase = mongoose.model<ITestCase>('TestCase', TestCaseSchema)
