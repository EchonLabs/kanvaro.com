import mongoose, { Schema, Document } from 'mongoose'

export interface IInvoice extends Document {
  invoiceNumber: string
  client: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  issueDate: Date
  dueDate: Date
  paidDate?: Date
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  currency: string
  lineItems: Array<{
    description: string
    quantity: number
    unitPrice: number
    total: number
  }>
  notes?: string
  terms?: string
  attachments: {
    name: string
    url: string
    size: number
    type: string
    uploadedBy: mongoose.Types.ObjectId
    uploadedAt: Date
  }[]
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

const InvoiceSchema = new Schema<IInvoice>({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  client: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
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
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
    default: 'draft'
  },
  issueDate: {
    type: Date,
    required: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  paidDate: Date,
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  taxRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  taxAmount: {
    type: Number,
    required: true,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'USD'
  },
  lineItems: [{
    description: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 }
  }],
  notes: {
    type: String,
    maxlength: 1000
  },
  terms: {
    type: String,
    maxlength: 1000
  },
  attachments: [{
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    type: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }]
}, {
  timestamps: true
})

// Indexes
InvoiceSchema.index({ organization: 1 })
InvoiceSchema.index({ project: 1 })
InvoiceSchema.index({ client: 1 })
InvoiceSchema.index({ createdBy: 1 })
InvoiceSchema.index({ status: 1 })
InvoiceSchema.index({ issueDate: 1 })
InvoiceSchema.index({ dueDate: 1 })
InvoiceSchema.index({ invoiceNumber: 1 })
InvoiceSchema.index({ organization: 1, status: 1 })
InvoiceSchema.index({ project: 1, status: 1 })

export const Invoice = mongoose.models.Invoice || mongoose.model<IInvoice>('Invoice', InvoiceSchema)
