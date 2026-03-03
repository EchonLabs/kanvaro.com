import mongoose, { Document, Schema } from 'mongoose'

export interface ICustomRole extends Document {
  name: string
  description: string
  permissions: string[]
  organization: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const CustomRoleSchema = new Schema<ICustomRole>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  permissions: [{
    type: String,
    required: true
  }],
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
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
})

// Indexes for better performance
CustomRoleSchema.index({ organization: 1, name: 1 }, { unique: true })
CustomRoleSchema.index({ organization: 1, isActive: 1 })
CustomRoleSchema.index({ createdBy: 1 })

// Ensure unique role names per organization (only for active roles)
CustomRoleSchema.pre('save', async function(next) {
  if (this.isModified('name') || this.isNew) {
    // Only check for active roles - inactive (deleted) roles can be reused
    const existingActiveRole = await (this.constructor as any).findOne({
      name: this.name,
      organization: this.organization,
      isActive: true,
      _id: { $ne: this._id }
    })
    
    if (existingActiveRole) {
      const error = new Error('Role name already exists in this organization')
      return next(error)
    }
  }
  next()
})

export const CustomRole = mongoose.models.CustomRole || mongoose.model<ICustomRole>('CustomRole', CustomRoleSchema)
