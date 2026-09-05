import mongoose, { Schema, Document } from 'mongoose'

import {
  ESTIMATE_METHODS,
  ESTIMATE_UNITS,
  type EstimateMethod,
  type EstimateUnit,
  type RevisionReason
} from '@/lib/standup/estimates'

export const TASK_STATUS_VALUES = ['backlog', 'todo', 'in_progress', 'review', 'testing', 'done', 'cancelled'] as const
export type TaskStatus = typeof TASK_STATUS_VALUES[number]

/** CC-8 / §15.8.11. The four dispositions a still-open task may receive on the final day. */
export const SPRINT_CLOSE_DISPOSITION_TYPES = [
  'finish_today',
  'descope',
  'move_to_next_sprint',
  'split_and_move_remainder'
] as const
export type SprintCloseDispositionType = typeof SPRINT_CLOSE_DISPOSITION_TYPES[number]

export interface ITaskSubtask {
  _id?: mongoose.Types.ObjectId
  title: string
  description?: string
  status: TaskStatus
  isCompleted: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface ITask extends Document {
  title: string
  description: string
  status: TaskStatus
  priority: 'low' | 'medium' | 'high' | 'critical'
  isBillable?: boolean
  type: 'bug' | 'feature' | 'improvement' | 'task' | 'subtask'
  organization: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  taskNumber: number
  displayId: string
  story?: mongoose.Types.ObjectId
  epic?: mongoose.Types.ObjectId
  parentTask?: mongoose.Types.ObjectId
  assignedTo?: Array<{
    user: mongoose.Types.ObjectId
    firstName?: string
    lastName?: string
    email?: string
    hourlyRate?: number
  }>
  // assignees?: mongoose.Types.ObjectId[] // Removed in favor of assignedTo array
  createdBy: mongoose.Types.ObjectId
  assignedBy?: mongoose.Types.ObjectId
  storyPoints?: number
  dueDate?: Date
  /** Legacy hours field. Derived from `originalEstimateMinutes` when that is set. */
  estimatedHours?: number
  actualHours?: number

  // --- Stand-up module estimate fields (spec §16.2) ------------------------
  /** Agreed at planning. Immutable once `estimateLockedAt` is set (DAT-6). */
  originalEstimateMinutes?: number
  /** What the PM believes is left. Changes only via a recorded revision (DAT-7). */
  remainingEstimateMinutes?: number
  estimateUnit?: EstimateUnit
  estimateValue?: number
  estimateMethod?: EstimateMethod
  pokerSession?: mongoose.Types.ObjectId
  consensusReached?: boolean
  estimatedAt?: Date
  estimatedBy?: mongoose.Types.ObjectId
  estimateLockedAt?: Date
  estimateRevisions?: Array<{
    previousRemainingMinutes: number
    newRemainingMinutes: number
    reason: RevisionReason | string
    detail?: string
    revisedBy?: mongoose.Types.ObjectId
    revisedAt?: Date
    standup?: mongoose.Types.ObjectId
  }>
  totalLoggedMinutes?: number
  /**
   * D-D. The member whose allocation carries this task's *task-scope*
   * variance and its ledger accrual. Everybody who works the task owns their
   * own day variance; only the owner owns the task's overrun, or a shared task
   * accrues its estimate debt twice. Unset until somebody chooses, at which
   * point `resolveStandupOwner()` falls back to `assignedTo[0]`.
   */
  standupOwner?: mongoose.Types.ObjectId
  /**
   * CC-8 / §15.8.11. Set only from the final-day Sprint-close-readiness panel.
   * Unlike `standupOwner`, this has no fallback resolver — an unset value is
   * exactly "not yet dispositioned," which is what blocks completion.
   */
  sprintCloseDisposition?: {
    type: SprintCloseDispositionType
    setAt: Date
    setBy: mongoose.Types.ObjectId
    note?: string
  }
  standupSpillCount?: number
  lastAllocatedStandup?: mongoose.Types.ObjectId
  descopedAt?: Date
  descopedBy?: mongoose.Types.ObjectId
  descopeReason?: string
  sprint?: mongoose.Types.ObjectId
  movedFromSprint?: mongoose.Types.ObjectId
  startDate?: Date
  completedAt?: Date
  labels: string[]
  dependencies: mongoose.Types.ObjectId[]
  attachments: {
    name: string
    url: string
    size: number
    type: string
    uploadedBy: mongoose.Types.ObjectId
    uploadedAt: Date
  }[]

  subtasks: ITaskSubtask[]
  archived: boolean
  position: number
  comments?: Array<{
    _id?: mongoose.Types.ObjectId
    content: string
    author: mongoose.Types.ObjectId
    parentCommentId?: mongoose.Types.ObjectId | null
    mentions?: mongoose.Types.ObjectId[]
    linkedIssues?: mongoose.Types.ObjectId[]
    createdAt: Date
    updatedAt?: Date
    attachments?: Array<{
      name: string
      url: string
      size?: number
      type?: string
      uploadedBy?: mongoose.Types.ObjectId
      uploadedAt?: Date
    }>
  }>
  linkedTestCase?: mongoose.Types.ObjectId
  foundInVersion?: string
  testExecutionId?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const SubtaskSchema = new Schema<ITaskSubtask>({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  status: {
    type: String,
    default: 'todo',
    trim: true
    // Note: No enum restriction to allow custom kanban statuses per project
    // Status validation should be done at the application level based on project settings
  },
  isCompleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true })

const TaskSchema = new Schema<ITask>({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    maxlength: 200000
  },
  status: {
    type: String,
    default: 'backlog',
    trim: true
    // Note: No enum restriction to allow custom kanban statuses per project
    // Status validation should be done at the application level based on project settings
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  isBillable: {
    type: Boolean,
    default: true
  },
  type: {
    type: String,
    enum: ['bug', 'feature', 'improvement', 'task', 'subtask'],
    default: 'task'
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
  taskNumber: {
    type: Number,
    required: true
  },
  displayId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  story: {
    type: Schema.Types.ObjectId,
    ref: 'Story'
  },
  epic: {
    type: Schema.Types.ObjectId,
    ref: 'Epic'
  },
  parentTask: {
    type: Schema.Types.ObjectId,
    ref: 'Task'
  },
  assignedTo: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    hourlyRate: {
      type: Number,
      min: 0
    }
  }],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  storyPoints: {
    type: Number,
    min: 0
  },
  dueDate: Date,
  estimatedHours: {
    type: Number,
    min: 0
  },
  actualHours: {
    type: Number,
    min: 0,
    default: 0
  },
  position: {
    type: Number,
    default: 0
  },
  sprint: {
    type: Schema.Types.ObjectId,
    ref: 'Sprint'
  },
  movedFromSprint: {
    type: Schema.Types.ObjectId,
    ref: 'Sprint'
  },
  startDate: Date,
  completedAt: Date,
  labels: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  dependencies: [{
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
  subtasks: {
    type: [SubtaskSchema],
    default: []
  },
  archived: { type: Boolean, default: false },
  comments: [{
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    parentCommentId: { type: Schema.Types.ObjectId, ref: 'Task.comments._id', default: null },
    mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    linkedIssues: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
    attachments: [{
      name: { type: String, required: true },
      url: { type: String, required: true },
      size: { type: Number },
      type: { type: String },
      uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      uploadedAt: { type: Date, default: Date.now }
    }]
  }],
  // --- Stand-up module estimate fields (spec §16.2 Task extensions) --------
  // Minutes, not hours: ALO-2/DAT-2 mandate integer-minute arithmetic. The
  // legacy `estimatedHours` above is kept as a derived mirror (see the pre-save
  // hook below) because 40 files still read it.
  originalEstimateMinutes: {
    type: Number,
    min: 0,
    validate: {
      validator: (value: number) => value === undefined || value === null || Number.isInteger(value),
      message: 'originalEstimateMinutes must be a whole number of minutes'
    }
  },
  remainingEstimateMinutes: {
    type: Number,
    min: 0,
    validate: {
      validator: (value: number) => value === undefined || value === null || Number.isInteger(value),
      message: 'remainingEstimateMinutes must be a whole number of minutes'
    }
  },
  estimateUnit: {
    type: String,
    enum: [...ESTIMATE_UNITS]
  },
  /** The raw agreed value — the poker card, or hours typed directly. */
  estimateValue: {
    type: Number,
    min: 0
  },
  estimateMethod: {
    type: String,
    enum: [...ESTIMATE_METHODS]
  },
  pokerSession: {
    type: Schema.Types.ObjectId,
    ref: 'PokerSession'
  },
  consensusReached: Boolean,
  estimatedAt: Date,
  estimatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  /**
   * Stamped when the sprint leaves Planning (DAT-6). Its presence — not the
   * sprint's current status — is what freezes `originalEstimateMinutes`, so a
   * task that later moves sprints stays frozen.
   */
  estimateLockedAt: Date,
  estimateRevisions: [{
    previousRemainingMinutes: { type: Number, required: true },
    newRemainingMinutes: { type: Number, required: true },
    reason: { type: String, required: true },
    detail: String,
    revisedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    revisedAt: { type: Date, default: Date.now },
    standup: { type: Schema.Types.ObjectId, ref: 'Standup' }
  }],
  /** Maintained by the time-logging module; mirrors `actualHours` in minutes. */
  totalLoggedMinutes: {
    type: Number,
    default: 0,
    min: 0
  },
  /**
   * D-D. Whose allocation carries this task's task-scope variance.
   *
   * Deliberately without a schema default. A default would have to read
   * `assignedTo` at creation, which silently picks a winner out of an array
   * whose order nothing promises — and would leave every task written before
   * this field existed with no owner anyway. `resolveStandupOwner()` in
   * `lib/standup/task-ownership.ts` decides at read time instead, and this
   * field records a real choice when somebody makes one.
   */
  standupOwner: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  sprintCloseDisposition: {
    type: {
      type: String,
      enum: SPRINT_CLOSE_DISPOSITION_TYPES
    },
    setAt: { type: Date },
    setBy: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, maxlength: 1000 }
  },
  /** How many stand-ups this task has carried across (VAR-14 chronic spill). */
  standupSpillCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastAllocatedStandup: {
    type: Schema.Types.ObjectId,
    ref: 'Standup'
  },
  descopedAt: Date,
  descopedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  descopeReason: String,

  linkedTestCase: {
    type: Schema.Types.ObjectId,
    ref: 'TestCase'
  },
  foundInVersion: {
    type: String,
    trim: true,
    maxlength: 50
  },
  testExecutionId: {
    type: Schema.Types.ObjectId,
    ref: 'TestExecution'
  }
}, {
  timestamps: true
})

// Indexes
TaskSchema.index({ organization: 1 })
TaskSchema.index({ project: 1 })
TaskSchema.index({ project: 1, taskNumber: 1 }, { unique: true })
TaskSchema.index({ story: 1 })
TaskSchema.index({ parentTask: 1 })
TaskSchema.index({ createdBy: 1 })
TaskSchema.index({ assignedTo: 1 })
TaskSchema.index({ sprint: 1 })
TaskSchema.index({ status: 1 })
TaskSchema.index({ priority: 1 })
TaskSchema.index({ type: 1 })
TaskSchema.index({ organization: 1, status: 1 })
TaskSchema.index({ project: 1, status: 1 })
TaskSchema.index({ sprint: 1, status: 1 })
TaskSchema.index({ assignedTo: 1, status: 1 })
TaskSchema.index({ organization: 1, assignedTo: 1 })
TaskSchema.index({ organization: 1, createdBy: 1 })
TaskSchema.index({ archived: 1 })
TaskSchema.index({ organization: 1, archived: 1 })
TaskSchema.index({ project: 1, archived: 1 })
TaskSchema.index({ project: 1, status: 1, position: 1 })
TaskSchema.index({ organization: 1, createdAt: -1 })
TaskSchema.index({ project: 1, status: 1, createdAt: -1 })
TaskSchema.index({ title: 'text', description: 'text' })

// ---------------------------------------------------------------------------
// DAT-6 / DAT-7 — estimate immutability, enforced at the model layer.
//
// DAT-6 is explicit that this must not live only at the API layer: "Any attempt
// to write it must be rejected at the model layer, not only at the API layer."
// A guard on the route is bypassed by a script, a migration, or the next
// endpoint someone writes. These hooks are the backstop.
//
// Mongoose fires `pre('save')` only for document saves, so the query-level
// operations get their own hook below. Between them they cover every path that
// can reach the field.
// ---------------------------------------------------------------------------

/** Thrown so callers can map to the §17.2 `ESTIMATE_IMMUTABLE` / 422. */
class TaskEstimateImmutableError extends Error {
  readonly code = 'ESTIMATE_IMMUTABLE'
  constructor(message: string) {
    super(message)
    this.name = 'TaskEstimateImmutableError'
    Object.setPrototypeOf(this, TaskEstimateImmutableError.prototype)
  }
}

class TaskEstimateRevisionRequiredError extends Error {
  readonly code = 'VALIDATION_FAILED'
  constructor(message: string) {
    super(message)
    this.name = 'TaskEstimateRevisionRequiredError'
    Object.setPrototypeOf(this, TaskEstimateRevisionRequiredError.prototype)
  }
}

const ORIGINAL_IMMUTABLE_MESSAGE =
  'The original estimate cannot be changed after planning. Revise the remaining estimate instead.'

const REVISION_REQUIRED_MESSAGE =
  'The remaining estimate can only be changed through a recorded revision. ' +
  'Append to estimateRevisions in the same write.'

TaskSchema.pre('save', function (next) {
  const task = this as unknown as ITask & {
    isModified: (path: string) => boolean
    isNew: boolean
  }

  const locked = !!task.estimateLockedAt

  // DAT-6 — the original is frozen once the sprint has left Planning. Setting
  // the lock itself in the same write is fine; that is planning completing.
  if (
    locked &&
    !task.isNew &&
    task.isModified('originalEstimateMinutes') &&
    !task.isModified('estimateLockedAt')
  ) {
    return next(new TaskEstimateImmutableError(ORIGINAL_IMMUTABLE_MESSAGE))
  }

  // DAT-7 — "A direct set with no revision entry is a defect." Only enforced
  // once locked, because during planning the remaining estimate legitimately
  // tracks the original as the team re-votes.
  if (
    locked &&
    !task.isNew &&
    task.isModified('remainingEstimateMinutes') &&
    !task.isModified('estimateRevisions') &&
    !task.isModified('estimateLockedAt')
  ) {
    return next(new TaskEstimateRevisionRequiredError(REVISION_REQUIRED_MESSAGE))
  }

  // Keep the legacy hours field in step so sprint progress, the Gantt chart,
  // burn-rate and SprintReport keep working untouched. Derived and read-only:
  // minutes are the contract.
  if (task.isModified('originalEstimateMinutes') && task.originalEstimateMinutes != null) {
    task.estimatedHours = Math.round((task.originalEstimateMinutes / 60) * 100) / 100
  }

  next()
})

/**
 * The same two rules for query-level writes.
 *
 * `findOneAndUpdate`, `updateOne` and `updateMany` bypass `pre('save')`
 * entirely, and they are how most of the existing API routes write tasks — so
 * without this hook DAT-6 would be enforced on a path almost nothing uses.
 */
function guardEstimateUpdate(this: mongoose.Query<any, any>, next: (error?: Error) => void) {
  const update = (this.getUpdate() ?? {}) as Record<string, any>
  const setters = { ...(update.$set ?? {}), ...update }

  // A key present but explicitly `undefined` is not a write. Existing routes
  // spread request bodies into updates, so `{ ...body }` routinely carries
  // undefined keys — treating those as writes would reject ordinary task edits
  // that never intended to touch an estimate.
  const writes = (field: string) => field in setters && setters[field] !== undefined

  const touchesOriginal = writes('originalEstimateMinutes')
  const touchesRemaining = writes('remainingEstimateMinutes')
  if (!touchesOriginal && !touchesRemaining) return next()

  // Stamping the lock is planning completing — allow that write through.
  if (writes('estimateLockedAt')) return next()

  const appendsRevision =
    'estimateRevisions' in (update.$push ?? {}) ||
    'estimateRevisions' in (update.$addToSet ?? {}) ||
    writes('estimateRevisions')

  // Ask whether *any* task matching this filter is locked, rather than fetching
  // one and inspecting it. That matters for `updateMany`: a bulk write touching
  // a hundred tasks must be refused if even one of them is frozen.
  this.model
    .findOne({ ...this.getFilter(), estimateLockedAt: { $ne: null } })
    .select('_id')
    .lean()
    .then((locked: any) => {
      if (!locked) return next()

      if (touchesOriginal) {
        return next(new TaskEstimateImmutableError(ORIGINAL_IMMUTABLE_MESSAGE))
      }
      if (touchesRemaining && !appendsRevision) {
        return next(new TaskEstimateRevisionRequiredError(REVISION_REQUIRED_MESSAGE))
      }
      return next()
    })
    .catch(next)
}

TaskSchema.pre('findOneAndUpdate', guardEstimateUpdate)
TaskSchema.pre('updateOne', guardEstimateUpdate)
TaskSchema.pre('updateMany', guardEstimateUpdate)

export { TaskEstimateImmutableError, TaskEstimateRevisionRequiredError }

export const Task = mongoose.models.Task || mongoose.model<ITask>('Task', TaskSchema)
