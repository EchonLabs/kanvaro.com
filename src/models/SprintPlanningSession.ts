import mongoose, { Schema, Document } from 'mongoose'

/**
 * A sprint planning session (spec §8.2, PLN-4/5/8).
 *
 * "A planning session is a first class entity, not a flag. It records who was
 * there, what was decided and when it was completed." That matters because the
 * planning gate has to be able to answer *why* it is closed, and because a
 * sprint may be replanned (E20) — which needs history, not an overwritten
 * boolean.
 */

export const PLANNING_SESSION_STATUSES = ['open', 'completed', 'abandoned'] as const
export type PlanningSessionStatus = typeof PLANNING_SESSION_STATUSES[number]

/** One evaluated checklist item, frozen at completion (PLN-8). */
export interface IChecklistResult {
  checkId: string
  /** `mandatory` blocks completion; `advisory` only warns (PLN-6 vs PLN-7). */
  kind: 'mandatory' | 'advisory'
  passed: boolean
  message?: string
  /** Ids of the tasks or members that made this check fail (UI-5). */
  offendingIds?: mongoose.Types.ObjectId[]
  /** Advisory items only: who ticked the acknowledgement, and when. */
  acknowledgedBy?: mongoose.Types.ObjectId
  acknowledgedAt?: Date
}

export interface ISprintPlanningSession extends Document {
  organization: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  sprint: mongoose.Types.ObjectId
  status: PlanningSessionStatus

  sprintGoal?: string
  participants: mongoose.Types.ObjectId[]
  facilitator: mongoose.Types.ObjectId
  notes?: string

  scheduledAt?: Date
  startedAt?: Date
  completedAt?: Date

  /**
   * Team capacity at the moment of completion (PLN-5).
   *
   * A snapshot, not a live computation: the sprint report has to show what the
   * team believed when it committed, and member capacity is dated (DAT-1) so
   * recomputing later gives a different — and misleading — answer.
   */
  capacitySnapshot?: {
    workingDayCount: number
    totalCapacityMinutes: number
    leaveMinutes: number
    netCapacityMinutes: number
    perMember: Array<{
      member: mongoose.Types.ObjectId
      dailyCapacityMinutes: number
      sprintCapacityMinutes: number
    }>
  }

  /** Scope at the moment of completion (PLN-5). */
  scopeSnapshot?: {
    taskCount: number
    estimatedTaskCount: number
    totalEstimatedMinutes: number
    countByType: Record<string, number>
  }

  checklistResults: IChecklistResult[]

  createdBy: mongoose.Types.ObjectId
  completedBy?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const ChecklistResultSchema = new Schema<IChecklistResult>(
  {
    checkId: { type: String, required: true },
    kind: { type: String, enum: ['mandatory', 'advisory'], required: true },
    passed: { type: Boolean, required: true },
    message: String,
    offendingIds: [{ type: Schema.Types.ObjectId }],
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: Date
  },
  { _id: false }
)

const SprintPlanningSessionSchema = new Schema<ISprintPlanningSession>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    sprint: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },

    status: {
      type: String,
      enum: [...PLANNING_SESSION_STATUSES],
      default: 'open'
    },

    sprintGoal: {
      type: String,
      trim: true,
      // PLN-5: 10 to 500 characters. Not `required` here because a session is
      // created before the goal is written; PC-1 enforces it at completion.
      maxlength: 500
    },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    facilitator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, maxlength: 20000 },

    scheduledAt: Date,
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,

    capacitySnapshot: {
      type: new Schema(
        {
          workingDayCount: Number,
          totalCapacityMinutes: Number,
          leaveMinutes: Number,
          netCapacityMinutes: Number,
          perMember: [
            new Schema(
              {
                member: { type: Schema.Types.ObjectId, ref: 'User' },
                dailyCapacityMinutes: Number,
                sprintCapacityMinutes: Number
              },
              { _id: false }
            )
          ]
        },
        { _id: false }
      ),
      required: false
    },

    scopeSnapshot: {
      type: new Schema(
        {
          taskCount: Number,
          estimatedTaskCount: Number,
          totalEstimatedMinutes: Number,
          countByType: { type: Schema.Types.Mixed, default: {} }
        },
        { _id: false }
      ),
      required: false
    },

    checklistResults: { type: [ChecklistResultSchema], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    completedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
)

SprintPlanningSessionSchema.index({ sprint: 1, createdAt: -1 })
SprintPlanningSessionSchema.index({ project: 1, status: 1 })

/**
 * PLN-4 — at most one Open session per sprint.
 *
 * A partial unique index rather than a validator: two concurrent "start
 * planning" clicks are a genuine race, and only the database can settle it.
 */
SprintPlanningSessionSchema.index(
  { sprint: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
)

export const SprintPlanningSession =
  mongoose.models.SprintPlanningSession ||
  mongoose.model<ISprintPlanningSession>('SprintPlanningSession', SprintPlanningSessionSchema)
