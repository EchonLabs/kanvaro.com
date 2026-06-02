import mongoose, { Schema, Document } from 'mongoose'

export interface IAIPersonalReport {
  memberId: string
  memberName: string
  memberEmail: string
  report: string
}

export interface IAIProjectReport extends Document {
  projectId: mongoose.Types.ObjectId
  organizationId: mongoose.Types.ObjectId
  generatedBy: mongoose.Types.ObjectId
  generatedByName: string
  generatedAt: Date
  standupDateRange: { from: Date; to: Date }
  standupCount: number
  projectName: string
  projectTrackingReport: string
  personalReports: IAIPersonalReport[]
  sentTo: string[]
  createdAt: Date
  updatedAt: Date
}

const AIProjectReportSchema = new Schema<IAIProjectReport>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    generatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    generatedByName: { type: String, required: true, trim: true },
    generatedAt: { type: Date, default: Date.now },
    standupDateRange: {
      from: { type: Date, required: true },
      to: { type: Date, required: true }
    },
    standupCount: { type: Number, default: 0 },
    projectName: { type: String, required: true, trim: true },
    projectTrackingReport: { type: String, required: true },
    personalReports: [
      {
        memberId: { type: String, required: true },
        memberName: { type: String, required: true },
        memberEmail: { type: String, required: true },
        report: { type: String, required: true }
      }
    ],
    sentTo: [{ type: String }]
  },
  {
    timestamps: true,
    collection: 'aiprojectreports'
  }
)

AIProjectReportSchema.index({ projectId: 1, generatedAt: -1 })
AIProjectReportSchema.index({ organizationId: 1, generatedAt: -1 })

export const AIProjectReport =
  mongoose.models.AIProjectReport ||
  mongoose.model<IAIProjectReport>('AIProjectReport', AIProjectReportSchema)
