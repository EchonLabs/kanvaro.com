import mongoose, { Schema, Document } from 'mongoose'

export type StandupSessionStatus = 'pending' | 'active' | 'completed'
export type StandupRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface IStandupBriefingGap {
  userId: mongoose.Types.ObjectId
  taskId: mongoose.Types.ObjectId
  taskTitle: string
  statusAtCommitment: string
  currentStatus: string
  daysOpen: number
}

export interface IStandupBriefingNoMovement {
  taskId: mongoose.Types.ObjectId
  taskTitle: string
  assignedUserId: mongoose.Types.ObjectId
  lastMovedAt: Date | null
}

export interface IStandupBriefingZeroTime {
  taskId: mongoose.Types.ObjectId
  taskTitle: string
  assignedUserId: mongoose.Types.ObjectId
}

export interface IStandupBriefingOpenNote {
  commitmentId: mongoose.Types.ObjectId
  taskId: mongoose.Types.ObjectId
  taskTitle: string
  userId: mongoose.Types.ObjectId
  noteContent: string
  noteCreatedAt: Date
  daysOpen: number
}

export interface IStandupBriefingSnapshot {
  generatedAt: Date
  gaps: IStandupBriefingGap[]
  noMovementTasks: IStandupBriefingNoMovement[]
  zeroTimeTasks: IStandupBriefingZeroTime[]
  openNotes: IStandupBriefingOpenNote[]
}

export interface IStandupNudge {
  userId: mongoose.Types.ObjectId
  taskId: mongoose.Types.ObjectId
  message: string
}

export interface IStandupAnalysis {
  riskScore: number
  riskLevel: StandupRiskLevel
  summary: string
  nudges: IStandupNudge[]
  trends: string[]
  prioritySuggestions: string[]
  generatedAt: Date
}

export interface IStandupSession extends Document {
  organization: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  sprint: mongoose.Types.ObjectId | null
  date: Date
  workingCircleStart: Date
  workingCircleEnd: Date
  status: StandupSessionStatus
  createdBy: mongoose.Types.ObjectId
  members: mongoose.Types.ObjectId[]
  briefingSnapshot: IStandupBriefingSnapshot | null
  analysis: IStandupAnalysis | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const BriefingGapSchema = new Schema<IStandupBriefingGap>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  taskTitle: { type: String, required: true, maxlength: 500 },
  statusAtCommitment: { type: String, required: true },
  currentStatus: { type: String, required: true },
  daysOpen: { type: Number, default: 1, min: 0 },
}, { _id: false })

const BriefingNoMovementSchema = new Schema<IStandupBriefingNoMovement>({
  taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  taskTitle: { type: String, required: true, maxlength: 500 },
  assignedUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  lastMovedAt: { type: Date, default: null },
}, { _id: false })

const BriefingZeroTimeSchema = new Schema<IStandupBriefingZeroTime>({
  taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  taskTitle: { type: String, required: true, maxlength: 500 },
  assignedUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { _id: false })

const BriefingOpenNoteSchema = new Schema<IStandupBriefingOpenNote>({
  commitmentId: { type: Schema.Types.ObjectId, ref: 'StandupCommitment', required: true },
  taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  taskTitle: { type: String, required: true, maxlength: 500 },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  noteContent: { type: String, required: true, maxlength: 2000 },
  noteCreatedAt: { type: Date, required: true },
  daysOpen: { type: Number, default: 1, min: 0 },
}, { _id: false })

const BriefingSnapshotSchema = new Schema<IStandupBriefingSnapshot>({
  generatedAt: { type: Date, required: true },
  gaps: { type: [BriefingGapSchema], default: [] },
  noMovementTasks: { type: [BriefingNoMovementSchema], default: [] },
  zeroTimeTasks: { type: [BriefingZeroTimeSchema], default: [] },
  openNotes: { type: [BriefingOpenNoteSchema], default: [] },
}, { _id: false })

const NudgeSchema = new Schema<IStandupNudge>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  message: { type: String, required: true, maxlength: 1000 },
}, { _id: false })

const AnalysisSchema = new Schema<IStandupAnalysis>({
  riskScore: { type: Number, required: true, min: 0, max: 100 },
  riskLevel: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
  },
  summary: { type: String, required: true, maxlength: 2000 },
  nudges: { type: [NudgeSchema], default: [] },
  trends: [{ type: String, maxlength: 500 }],
  prioritySuggestions: [{ type: String, maxlength: 500 }],
  generatedAt: { type: Date, required: true },
}, { _id: false })

const StandupSessionSchema = new Schema<IStandupSession>({
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
  },
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  sprint: {
    type: Schema.Types.ObjectId,
    ref: 'Sprint',
    default: null,
  },
  date: {
    type: Date,
    required: true,
  },
  workingCircleStart: {
    type: Date,
    required: true,
  },
  workingCircleEnd: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed'],
    default: 'pending',
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  members: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
  }],
  briefingSnapshot: {
    type: BriefingSnapshotSchema,
    default: null,
  },
  analysis: {
    type: AnalysisSchema,
    default: null,
  },
  completedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
})

// One session per project per day
StandupSessionSchema.index({ project: 1, date: 1 }, { unique: true })
StandupSessionSchema.index({ organization: 1, date: -1 })
StandupSessionSchema.index({ project: 1, status: 1 })
StandupSessionSchema.index({ organization: 1, project: 1, date: -1 })

export const StandupSession =
  mongoose.models.StandupSession ||
  mongoose.model<IStandupSession>('StandupSession', StandupSessionSchema)
