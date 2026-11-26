import mongoose, { Document, Schema } from 'mongoose'

export interface IOAuthRefreshToken extends Document {
  tokenHash: string
  userId: mongoose.Types.ObjectId
  clientId: string
  familyId: string
  resource: string
  scope: string
  expiresAt: Date
  rotatedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const OAuthRefreshTokenSchema = new Schema<IOAuthRefreshToken>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String, required: true },
    familyId: { type: String, required: true, index: true },
    resource: { type: String, required: true },
    scope: { type: String, required: true, default: 'kanvaro' },
    expiresAt: { type: Date, required: true },
    rotatedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

OAuthRefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const OAuthRefreshToken =
  mongoose.models.OAuthRefreshToken ||
  mongoose.model<IOAuthRefreshToken>('OAuthRefreshToken', OAuthRefreshTokenSchema)
