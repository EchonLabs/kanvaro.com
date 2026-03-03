import mongoose, { Schema, Document } from 'mongoose'

export interface ITestExecution extends Document {
  testCase: mongoose.Types.ObjectId
  testPlan?: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  executedBy: mongoose.Types.ObjectId
  status: 'passed' | 'failed' | 'blocked' | 'skipped' | 'not_executed'
  actualResult: string
  comments: string
  executionTime: number // in minutes
  environment: string
  version: string
  attachments: {
    name: string
    url: string
    size: number
    type: string
    uploadedBy: mongoose.Types.ObjectId
    uploadedAt: Date
  }[]
  bugs: mongoose.Types.ObjectId[]
  executedAt: Date
  createdAt: Date
  updatedAt: Date
}

const TestExecutionSchema = new Schema<ITestExecution>({
  testCase: {
    type: Schema.Types.ObjectId,
    ref: 'TestCase',
    required: true
  },
  testPlan: {
    type: Schema.Types.ObjectId,
    ref: 'TestPlan'
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
  executedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['passed', 'failed', 'blocked', 'skipped', 'not_executed'],
    required: true
  },
  actualResult: {
    type: String,
    maxlength: 2000
  },
  comments: {
    type: String,
    maxlength: 1000
  },
  executionTime: {
    type: Number,
    min: 0,
    default: 0
  },
  environment: {
    type: String,
    trim: true,
    maxlength: 100
  },
  version: {
    type: String,
    trim: true,
    maxlength: 50
  },
  attachments: [{
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    type: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],
  bugs: [{
    type: Schema.Types.ObjectId,
    ref: 'Task'
  }],
  executedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
})

// Indexes
TestExecutionSchema.index({ organization: 1, project: 1 })
TestExecutionSchema.index({ testCase: 1, executedAt: -1 })
TestExecutionSchema.index({ testPlan: 1, executedAt: -1 })
TestExecutionSchema.index({ executedBy: 1, executedAt: -1 })
TestExecutionSchema.index({ status: 1, executedAt: -1 })
TestExecutionSchema.index({ project: 1, version: 1 })

export const TestExecution = mongoose.models.TestExecution || mongoose.model<ITestExecution>('TestExecution', TestExecutionSchema)
