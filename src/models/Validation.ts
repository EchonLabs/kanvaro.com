import mongoose, { Document, Schema } from 'mongoose'

export interface IValidation extends Document {
  key: string
  value: Record<string, any>
  setupCompleted: boolean
  organizationId?: string
  database?: {
    host?: string
    port?: number
    database?: string
    username?: string
    password?: string
    authSource?: string
    ssl?: boolean
    uri?: string
  } | null
  createdAt: Date
  updatedAt: Date
}

const ValidationSchema = new Schema<IValidation>({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, default: {} },
  setupCompleted: { type: Boolean, default: false },
  organizationId: { type: String, default: '' },
  database: {
    host: { type: String },
    port: { type: Number },
    database: { type: String },
    username: { type: String },
    password: { type: String },
    authSource: { type: String },
    ssl: { type: Boolean },
    uri: { type: String }
  }
}, {
  timestamps: true,
  collection: 'validations'
})

ValidationSchema.index({ key: 1 }, { unique: true })

export const Validation = mongoose.models.Validation || mongoose.model<IValidation>('Validation', ValidationSchema)
export { ValidationSchema }

