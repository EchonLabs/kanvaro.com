import mongoose, { Schema, Document } from 'mongoose'

export interface IDocumentTemplate extends Document {
  name: string
  description?: string
  fileName: string
  fileId: mongoose.Types.ObjectId
  size?: number
  mimeType?: string
  organization: mongoose.Types.ObjectId
  uploadedBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const DocumentTemplateSchema = new Schema<IDocumentTemplate>({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  fileName: {
    type: String,
    required: true,
    trim: true,
  },
  fileId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  size: {
    type: Number,
    default: 0,
  },
  mimeType: {
    type: String,
    default: 'application/octet-stream',
  },
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
})

DocumentTemplateSchema.index({ organization: 1, createdAt: -1 })

export const DocumentTemplate = mongoose.models.DocumentTemplate || mongoose.model<IDocumentTemplate>('DocumentTemplate', DocumentTemplateSchema)
