import mongoose, { Schema, Document } from 'mongoose'

export interface IProjectIncome extends Document {
  project: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId
  invoiceNumber: string
  category: 'invoice' | 'consulting' | 'other'
  subCategory?: 'amc' | 'cr'
  description: string
  utilizableBudget: number
  approvedDate?: Date
  actualStartDate?: Date
  attachments: {
    name: string
    url: string
    size: number
    type: string
    uploadedBy: mongoose.Types.ObjectId
    uploadedAt: Date
  }[]
  addedBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const ProjectIncomeSchema = new Schema<IProjectIncome>({
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  invoiceNumber: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  category: {
    type: String,
    enum: ['invoice', 'consulting', 'other'],
    required: true
  },
  subCategory: {
    type: String,
    enum: ['amc', 'cr']
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  utilizableBudget: {
    type: Number,
    required: true,
    min: 0
  },
  approvedDate: {
    type: Date
  },
  actualStartDate: {
    type: Date
  },
  attachments: [{
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    type: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],
  addedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
})

ProjectIncomeSchema.index({ project: 1, createdAt: -1 })
ProjectIncomeSchema.index({ organization: 1, invoiceNumber: 1 })
ProjectIncomeSchema.index({ organization: 1, category: 1 })

export const ProjectIncome = mongoose.models.ProjectIncome || mongoose.model<IProjectIncome>('ProjectIncome', ProjectIncomeSchema)
