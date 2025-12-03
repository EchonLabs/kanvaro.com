import mongoose, { Schema, Document } from 'mongoose'

export interface IUser extends Document {
  firstName: string
  lastName: string
  email: string
  password: string
  role: 'admin' | 'human_resource' | 'project_manager' | 'team_member' | 'client' | 'viewer' | 'account_manager' | 'qa_engineer' | 'tester'
  customRole?: mongoose.Types.ObjectId
  // Organization-level partners
  projectManager?: mongoose.Types.ObjectId
  humanResourcePartner?: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId
  isActive: boolean
  avatar?: string
  timezone: string
  language: string
  billingRate?: number
  currency: string
  lastLogin?: Date
  emailVerified: boolean
  twoFactorEnabled: boolean
  passwordResetOtp?: string
  passwordResetExpiry?: Date
  passwordResetToken?: string
  // Project-specific roles for fine-grained access control
  projectRoles: {
    project: mongoose.Types.ObjectId
    role: 'project_manager' | 'project_member' | 'project_viewer' | 'project_client' | 'project_account_manager' | 'project_qa_lead' | 'project_tester'
    assignedBy: mongoose.Types.ObjectId
    assignedAt: Date
  }[]
  preferences: {
    theme: 'light' | 'dark' | 'system'
    sidebarCollapsed: boolean
    dateFormat: string
    timeFormat: '12h' | '24h'
    notifications: {
      email: boolean
      inApp: boolean
      push: boolean
      taskReminders: boolean
      projectUpdates: boolean
      teamActivity: boolean
    }
  }
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['admin', 'human_resource', 'project_manager', 'team_member', 'client', 'viewer', 'account_manager', 'qa_engineer', 'tester'],
    default: 'team_member'
  },
  customRole: { type: Schema.Types.ObjectId, ref: 'CustomRole' },
  // Organization-level partners
  projectManager: { type: Schema.Types.ObjectId, ref: 'User' },
  humanResourcePartner: { type: Schema.Types.ObjectId, ref: 'User' },
  organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  isActive: { type: Boolean, default: true },
  avatar: String,
  timezone: { type: String, default: 'UTC' },
  language: { type: String, default: 'en' },
  billingRate: Number,
  currency: { type: String, default: 'USD' },
  lastLogin: Date,
  emailVerified: { type: Boolean, default: false },
  twoFactorEnabled: { type: Boolean, default: false },
  passwordResetOtp: String,
  passwordResetExpiry: Date,
  passwordResetToken: String,
  // Project-specific roles
  projectRoles: [{
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    role: { 
      type: String, 
      enum: ['project_manager', 'project_member', 'project_viewer', 'project_client', 'project_account_manager', 'project_qa_lead', 'project_tester'],
      required: true 
    },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedAt: { type: Date, default: Date.now }
  }],
  preferences: {
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    sidebarCollapsed: { type: Boolean, default: false },
    dateFormat: { type: String, default: 'MM/DD/YYYY' },
    timeFormat: { type: String, enum: ['12h', '24h'], default: '12h' },
    notifications: {
      email: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true },
      push: { type: Boolean, default: false },
      taskReminders: { type: Boolean, default: true },
      projectUpdates: { type: Boolean, default: true },
      teamActivity: { type: Boolean, default: false }
    }
  }
}, {
  timestamps: true
})

// Indexes
// Note: email field already has unique: true which creates an index
UserSchema.index({ organization: 1, role: 1 })
UserSchema.index({ isActive: 1 })

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema)
