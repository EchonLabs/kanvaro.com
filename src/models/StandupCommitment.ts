import mongoose, { Schema, Document } from 'mongoose'

export interface IStandupCommitmentTask {
  task: mongoose.Types.ObjectId
  taskTitle: string
  statusAtCommitment: string
  statusAtEndOfDay: string | null
  timeLoggedMinutes: number
  fulfilled: boolean
  noMovement: boolean
  zeroTime: boolean
}

export interface IStandupPMNote {
  content: string
  blocker: string | null
  targetResolution: Date | null
  resolved: boolean
  resolvedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface IStandupCommitment extends Document {
  standupSession: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  user: mongoose.Types.ObjectId
  date: Date
  tasks: IStandupCommitmentTask[]
  pmNote: IStandupPMNote | null
  carriedFromDate: Date | null
  daysOpen: number
  createdAt: Date
  updatedAt: Date
}

const CommitmentTaskSchema = new Schema<IStandupCommitmentTask>({
  task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  taskTitle: { type: String, required: true, maxlength: 500 },
  statusAtCommitment: { type: String, required: true },
  statusAtEndOfDay: { type: String, default: null },
  timeLoggedMinutes: { type: Number, default: 0, min: 0 },
  fulfilled: { type: Boolean, default: false },
  noMovement: { type: Boolean, default: false },
  zeroTime: { type: Boolean, default: false },
}, { _id: false })

const PMNoteSchema = new Schema<IStandupPMNote>({
  content: { type: String, required: true, maxlength: 2000 },
  blocker: { type: String, default: null, maxlength: 500 },
  targetResolution: { type: Date, default: null },
  resolved: { type: Boolean, default: false },
  resolvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false })

const StandupCommitmentSchema = new Schema<IStandupCommitment>({
  standupSession: {
    type: Schema.Types.ObjectId,
    ref: 'StandupSession',
    required: true,
  },
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
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  tasks: {
    type: [CommitmentTaskSchema],
    default: [],
  },
  pmNote: {
    type: PMNoteSchema,
    default: null,
  },
  carriedFromDate: {
    type: Date,
    default: null,
  },
  daysOpen: {
    type: Number,
    default: 0,
    min: 0,
  },
}, {
  timestamps: true,
})

// One commitment per user per session
StandupCommitmentSchema.index({ standupSession: 1, user: 1 }, { unique: true })
StandupCommitmentSchema.index({ project: 1, date: -1 })
StandupCommitmentSchema.index({ user: 1, date: -1 })
StandupCommitmentSchema.index({ organization: 1, date: -1 })
// For finding unresolved PM notes across sessions
StandupCommitmentSchema.index({ project: 1, 'pmNote.resolved': 1 })

export const StandupCommitment =
  mongoose.models.StandupCommitment ||
  mongoose.model<IStandupCommitment>('StandupCommitment', StandupCommitmentSchema)
