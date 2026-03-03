import mongoose, { Schema, Document } from 'mongoose'

export interface IExpense extends Document {
  project: mongoose.Types.ObjectId
  name: string
  description?: string
  unitPrice: number
  quantity: number
  fullAmount: number
  expenseDate: Date
  category: 'materials' | 'overhead' | 'external' | 'other'
  isBillable: boolean
  paidStatus: 'paid' | 'unpaid'
  paidBy?: mongoose.Types.ObjectId
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

const ExpenseSchema = new Schema<IExpense>({
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  fullAmount: {
    type: Number,
    required: true,
    min: 0
  },
  expenseDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  category: {
    type: String,
    enum: [ 'materials', 'overhead', 'external', 'other'],
    required: true
  },
  isBillable: {
    type: Boolean,
    default: false
  },
  paidStatus: {
    type: String,
    enum: ['paid', 'unpaid'],
    required: true,
    default: 'unpaid'
  },
  paidBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
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

// Indexes
ExpenseSchema.index({ project: 1, expenseDate: -1 })
ExpenseSchema.index({ project: 1, paidStatus: 1 })
ExpenseSchema.index({ project: 1, category: 1 })
ExpenseSchema.index({ addedBy: 1 })

export const Expense = mongoose.models.Expense || mongoose.model<IExpense>('Expense', ExpenseSchema)
