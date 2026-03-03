import mongoose, { Schema, Document } from 'mongoose'

export interface ICurrency extends Document {
  code: string
  name: string
  symbol: string
  country: string
  isActive: boolean
  isMajor: boolean
  createdAt: Date
  updatedAt: Date
}

const CurrencySchema = new Schema<ICurrency>({
  code: { 
    type: String, 
    required: true, 
    unique: true, 
    uppercase: true,
    trim: true 
  },
  name: { 
    type: String, 
    required: true, 
    trim: true 
  },
  symbol: { 
    type: String, 
    required: true, 
    trim: true 
  },
  country: { 
    type: String, 
    required: true, 
    trim: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  isMajor: { 
    type: Boolean, 
    default: false 
  }
}, {
  timestamps: true
})

// Indexes for better performance
// Note: code field already has unique: true which creates an index
CurrencySchema.index({ isActive: 1, isMajor: 1 })
CurrencySchema.index({ country: 1 })

export const Currency = mongoose.models.Currency || mongoose.model<ICurrency>('Currency', CurrencySchema)
