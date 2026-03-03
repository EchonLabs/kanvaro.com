import mongoose, { Schema, Document } from 'mongoose'

export interface IBudgetEntry extends Document {
  project: mongoose.Types.ObjectId
  amount: number
  currency: string
  category:  'materials' | 'overhead' | 'external' | 'other'
  description: string
  billingReference?: string // Quotation number, invoice number, etc.
  addedBy: mongoose.Types.ObjectId
  addedAt: Date
  isRecurring: boolean
  recurringFrequency?: 'monthly' | 'quarterly' | 'yearly'
  nextRecurringDate?: Date
  status: 'active' | 'cancelled' | 'completed'
  approvedBy?: mongoose.Types.ObjectId
  approvedAt?: Date
  notes?: string
  createdAt: Date
  updatedAt: Date
}

const BudgetEntrySchema = new Schema<IBudgetEntry>({
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'USD'
  },
  category: {
    type: String,
    enum: [ 'materials', 'overhead', 'external', 'other'],
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  billingReference: {
    type: String,
    trim: true,
    maxlength: 100
  },
  addedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringFrequency: {
    type: String,
    enum: ['monthly', 'quarterly', 'yearly']
  },
  nextRecurringDate: Date,
  status: {
    type: String,
    enum: ['active', 'cancelled', 'completed'],
    default: 'active'
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  notes: {
    type: String,
    maxlength: 1000
  }
}, {
  timestamps: true
})

// Indexes
BudgetEntrySchema.index({ project: 1, status: 1 })
BudgetEntrySchema.index({ addedBy: 1 })
BudgetEntrySchema.index({ addedAt: 1 })
BudgetEntrySchema.index({ category: 1 })
BudgetEntrySchema.index({ billingReference: 1 })

export const BudgetEntry = mongoose.models.BudgetEntry || mongoose.model<IBudgetEntry>('BudgetEntry', BudgetEntrySchema)
