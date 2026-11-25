import mongoose, { Schema, Document } from 'mongoose'

export type LessonImpactLevel = 'low' | 'medium' | 'high' | 'critical'

export interface ILesson extends Document {
  project: mongoose.Types.ObjectId
  sprint?: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId
  lessonNumber?: number
  category: string
  impactLevel: LessonImpactLevel
  context: string
  rootCause: string
  actionRecommendation: string
  modifiedBy?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const LessonSchema = new Schema<ILesson>({
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  sprint: {
    type: Schema.Types.ObjectId,
    ref: 'Sprint'
  },
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  lessonNumber: {
    type: Number
  },
  category: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  impactLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    required: true
  },
  context: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  rootCause: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  actionRecommendation: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  modifiedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
})

// Indexes for fast lookup and filtering
LessonSchema.index({ project: 1, lessonNumber: 1, createdAt: 1 })
LessonSchema.index({ sprint: 1, createdAt: -1 })
LessonSchema.index({ organization: 1 })
LessonSchema.index({ category: 1 })
LessonSchema.index({ impactLevel: 1 })
LessonSchema.index({ modifiedBy: 1 })

export const Lesson = mongoose.models.Lesson || mongoose.model<ILesson>('Lesson', LessonSchema)
export default Lesson
