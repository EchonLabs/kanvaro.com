import mongoose, { Schema, Document } from 'mongoose'

import { SPRINT_STATES, type SprintState } from '@/lib/standup/sprint-states'

export interface ISprint extends Document {
  name: string
  description?: string
  organization: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  /**
   * Spec §8.1. `draft` and `planned` are additive; every pre-existing row is in
   * one of the original four and keeps its meaning.
   */
  status: SprintState
  startDate: Date
  endDate: Date
  actualStartDate?: Date
  actualEndDate?: Date
  goal?: string
  velocity?: number
  plannedVelocity?: number
  actualVelocity?: number
  capacity: number // Total team capacity in hours
  actualCapacity?: number // Actual capacity used
  teamMembers: mongoose.Types.ObjectId[]
  stories: mongoose.Types.ObjectId[]
  tasks: mongoose.Types.ObjectId[]
  attachments: {
    name: string
    url: string
    size: number
    type: string
    uploadedBy: mongoose.Types.ObjectId
    uploadedAt: Date
  }[]
  archived: boolean

  // --- Planning gate (spec §8, PLN-1/16/17/18) ------------------------------
  /** The session that most recently took this sprint into `planned`. */
  activePlanningSession?: mongoose.Types.ObjectId
  plannedAt?: Date
  /**
   * PLN-16/17 — an Org-Admin waiver letting stand-ups run despite a failing
   * mandatory check. Stored inline because a sprint has at most one, and it is
   * read on every stand-up start (PLN-18's persistent banner).
   */
  planningWaiver?: {
    waivedCheckIds: string[]
    justification: string
    issuedBy: mongoose.Types.ObjectId
    issuedAt: Date
    expiresAt: Date
    revokedAt?: Date
    revokedBy?: mongoose.Types.ObjectId
  }

  /**
   * CAL-12 / AC-4 — calendar changes that could not be applied because a
   * stand-up on the date was already Completed.
   *
   * Recorded on the sprint as well as on the stand-up because the sprint report
   * has to be able to explain why its working-day count and its stand-up count
   * disagree, without walking every stand-up to find out.
   */
  calendarAnomalies?: Array<{
    date: string
    reason: string
    recordedAt: Date
  }>

  /**
   * SCH-15 — sprint health warnings raised by the scheduler, e.g. three
   * consecutive missed stand-ups.
   *
   * Kept on the sprint rather than derived on read so the warning survives the
   * condition that raised it: three misses matter to the retrospective even if
   * the fourth stand-up went ahead.
   */
  healthWarnings?: Array<{
    code: string
    message: string
    raisedAt: Date
    context?: Record<string, unknown>
  }>

  createdAt: Date
  updatedAt: Date
}

const SprintSchema = new Schema<ISprint>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: [...SPRINT_STATES],
    // Still `planning`, not `draft`: sprints created through the existing UI
    // must land where they always have.
    default: 'planning'
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  actualStartDate: Date,
  actualEndDate: Date,
  goal: {
    type: String,
    maxlength: 500
  },
  velocity: {
    type: Number,
    min: 0
  },
  plannedVelocity: {
    type: Number,
    min: 0
  },
  actualVelocity: {
    type: Number,
    min: 0
  },
  capacity: {
    type: Number,
    required: true,
    min: 0
  },
  actualCapacity: {
    type: Number,
    min: 0
  },
  teamMembers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  stories: [{
    type: Schema.Types.ObjectId,
    ref: 'Story'
  }],
  tasks: [{
    type: Schema.Types.ObjectId,
    ref: 'Task'
  }],
  attachments: [{
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    type: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],
  archived: { type: Boolean, default: false },

  // --- Planning gate (spec §8) ---------------------------------------------
  activePlanningSession: {
    type: Schema.Types.ObjectId,
    ref: 'SprintPlanningSession'
  },
  plannedAt: Date,
  planningWaiver: {
    type: new Schema(
      {
        waivedCheckIds: {
          type: [String],
          required: true,
          validate: {
            validator: (ids: string[]) => ids.length > 0,
            message: 'A waiver must name at least one check'
          }
        },
        justification: {
          type: String,
          required: true,
          trim: true,
          // PLN-17: at least 30 characters, longer than the 20 an override
          // needs — waiving a mandatory gate deserves more explanation.
          minlength: 30,
          maxlength: 2000
        },
        issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        issuedAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true },
        revokedAt: Date,
        revokedBy: { type: Schema.Types.ObjectId, ref: 'User' }
      },
      { _id: false }
    ),
    required: false
  },

  // SCH-15. Raised once per condition; the job checks before pushing.
  healthWarnings: {
    type: [
      new Schema(
        {
          code: { type: String, required: true },
          message: { type: String, required: true, maxlength: 500 },
          raisedAt: { type: Date, default: Date.now },
          context: { type: Schema.Types.Mixed }
        },
        { _id: false }
      )
    ],
    default: []
  },

  // CAL-12 / AC-4. Append-only: a calendar change that was refused is history
  // in its own right, so entries are added and never edited away.
  calendarAnomalies: {
    type: [
      new Schema(
        {
          date: { type: String, required: true },
          reason: { type: String, required: true, maxlength: 500 },
          recordedAt: { type: Date, default: Date.now }
        },
        { _id: false }
      )
    ],
    default: []
  }
}, {
  timestamps: true
})

// Indexes
SprintSchema.index({ organization: 1 })
SprintSchema.index({ project: 1 })
SprintSchema.index({ createdBy: 1 })
SprintSchema.index({ status: 1 })
SprintSchema.index({ startDate: 1 })
SprintSchema.index({ endDate: 1 })
SprintSchema.index({ project: 1, status: 1 })
SprintSchema.index({ archived: 1 })
SprintSchema.index({ project: 1, archived: 1 })

if (mongoose.models.Sprint) {
  const existingSchema = (mongoose.models.Sprint as mongoose.Model<ISprint>).schema
  if (!existingSchema.path('organization')) {
    existingSchema.add({
      organization: {
        type: Schema.Types.ObjectId,
        ref: 'Organization',
        required: true
      }
    })
  }
  if (!existingSchema.path('teamMembers')) {
    existingSchema.add({
      teamMembers: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
      }]
    })
  }
  if (!existingSchema.path('healthWarnings')) {
    existingSchema.add({
      healthWarnings: {
        type: [
          new Schema(
            {
              code: { type: String, required: true },
              message: { type: String, required: true, maxlength: 500 },
              raisedAt: { type: Date, default: Date.now },
              context: { type: Schema.Types.Mixed }
            },
            { _id: false }
          )
        ],
        default: []
      }
    })
  }
  if (!existingSchema.path('calendarAnomalies')) {
    existingSchema.add({
      calendarAnomalies: {
        type: [
          new Schema(
            {
              date: { type: String, required: true },
              reason: { type: String, required: true, maxlength: 500 },
              recordedAt: { type: Date, default: Date.now }
            },
            { _id: false }
          )
        ],
        default: []
      }
    })
  }
  if (!existingSchema.path('tasks')) {
    existingSchema.add({
      tasks: [{
        type: Schema.Types.ObjectId,
        ref: 'Task'
      }]
    })
  }
}

export const Sprint = mongoose.models.Sprint || mongoose.model<ISprint>('Sprint', SprintSchema)
