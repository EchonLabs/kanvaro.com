import mongoose, { Document, Schema } from 'mongoose'

export interface IOAuthAuthorizationCode extends Document {
  codeHash: string
  clientId: string
  userId: mongoose.Types.ObjectId
  redirectUri: string
  codeChallenge: string
  resource: string
  scope: string
  expiresAt: Date
  usedAt: Date | null
  familyId: string | null
  createdAt: Date
  updatedAt: Date
}

const OAuthAuthorizationCodeSchema = new Schema<IOAuthAuthorizationCode>(
  {
    codeHash: { type: String, required: true, unique: true },
    clientId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    redirectUri: { type: String, required: true },
    codeChallenge: { type: String, required: true },
    resource: { type: String, required: true },
    scope: { type: String, required: true, default: 'kanvaro' },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    familyId: { type: String, default: null },
  },
  { timestamps: true }
)

// Keep codes for 1 hour so replay detection can revoke the issued token family
// even after the 60s code lifetime; logic enforces expiresAt <= 60s.
OAuthAuthorizationCodeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 })

export const OAuthAuthorizationCode =
  mongoose.models.OAuthAuthorizationCode ||
  mongoose.model<IOAuthAuthorizationCode>(
    'OAuthAuthorizationCode',
    OAuthAuthorizationCodeSchema
  )
