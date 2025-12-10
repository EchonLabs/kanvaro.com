import mongoose, { Schema, Document } from 'mongoose'

export interface IBurnRate extends Document {
  project: mongoose.Types.ObjectId
  sprint?: mongoose.Types.ObjectId
  date: Date
  plannedBurn: number // Planned budget burn for this period
  actualBurn: number // Actual budget burn for this period
  velocity: number // Story points or tasks completed
  capacity: number // Team capacity for this period
  utilization: number // Actual capacity used (0-1)
  budgetRemaining: number // Remaining budget after this burn
  forecastedCompletion?: Date // Forecasted project completion based on current burn rate
  categories: {
   
    materials: {
      planned: number
      actual: number
    }
    overhead: {
      planned: number
      actual: number
    }
    external: {
      planned: number
      actual: number
    }
  }
  notes?: string
  createdAt: Date
  updatedAt: Date
}

const BurnRateSchema = new Schema<IBurnRate>({
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  sprint: {
    type: Schema.Types.ObjectId,
    ref: 'Sprint'
  },
  date: {
    type: Date,
    required: true
  },
  plannedBurn: {
    type: Number,
    required: true,
    min: 0
  },
  actualBurn: {
    type: Number,
    required: true,
    min: 0
  },
  velocity: {
    type: Number,
    required: true,
    min: 0
  },
  capacity: {
    type: Number,
    required: true,
    min: 0
  },
  utilization: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  budgetRemaining: {
    type: Number,
    required: true,
    min: 0
  },
  forecastedCompletion: Date,
  categories: {
   
    materials: {
      planned: { type: Number, default: 0 },
      actual: { type: Number, default: 0 }
    },
    overhead: {
      planned: { type: Number, default: 0 },
      actual: { type: Number, default: 0 }
    },
    external: {
      planned: { type: Number, default: 0 },
      actual: { type: Number, default: 0 }
    }
  },
  notes: {
    type: String,
    maxlength: 1000
  }
}, {
  timestamps: true
})

// Indexes
BurnRateSchema.index({ project: 1, date: 1 })
BurnRateSchema.index({ sprint: 1, date: 1 })
BurnRateSchema.index({ date: 1 })

export const BurnRate = mongoose.models.BurnRate || mongoose.model<IBurnRate>('BurnRate', BurnRateSchema)
