import mongoose, { Schema, Document } from 'mongoose'

// Single source of truth: the schema enums below are derived from these arrays
// so the TypeScript union and the Mongoose validator can never drift apart.

export const ACTIVITY_ENTITY_TYPES = [
  'task',
  'project',
  'sprint',
  'time_entry',
  'timer',
  // Stand-up module entities. SEC-3 requires an audit entry for every mutation,
  // so each collection the module writes needs a name here.
  'standup',
  'allocation',
  'allocation_variance',
  'estimate_debt_entry',
  'carry_forward_item',
  'standup_override',
  'working_calendar',
  'member_capacity',
  'planning_session'
] as const

export const ACTIVITY_ACTIONS = [
  'timer_started',
  'timer_stopped',
  'timer_paused',
  'timer_resumed',
  'time_entry_saved',
  'time_entry_updated',
  'time_entry_deleted',
  'task_created',
  'task_updated',
  'task_assigned',
  'task_status_changed',
  'project_created',
  'project_updated',
  'project_member_added',
  'project_member_removed',
  'sprint_created',
  'sprint_updated',
  'sprint_started',
  'sprint_completed',
  'sprint_task_added',
  'sprint_task_removed',

  // --- Stand-up module ---
  // Schedule and lifecycle (SCH-*, RUN-1..5)
  'standup_generated',
  'standup_reconciled',
  'standup_started',
  'standup_completed',
  'standup_reopened',
  'standup_backfilled',
  'standup_missed',
  'standup_skipped',
  'standup_cancelled',
  'standup_attendance_set',
  // Allocation (ALO-*)
  'allocation_created',
  'allocation_updated',
  'allocation_removed',
  // Estimation and variance (PLN-*, VAR-*)
  'estimate_set',
  'estimate_revised',
  'variance_computed',
  'debt_entry_posted',
  'debt_written_off',
  // Carry forward (CFW-*)
  'carry_forward_created',
  'carry_forward_noted',
  'carry_forward_resolved',
  // Overrides and gate (OVR-*, PLN-16..19)
  'override_issued',
  'planning_session_started',
  'planning_session_completed',
  'planning_waiver_issued',
  // Configuration (CAL-*)
  'working_calendar_updated',
  'holiday_set_imported',
  'member_capacity_updated'
] as const

export type ActivityEntityType = typeof ACTIVITY_ENTITY_TYPES[number]

export type ActivityAction = typeof ACTIVITY_ACTIONS[number]

/**
 * Before/after payload for an audited mutation.
 *
 * SEC-3 requires every mutation to record the previous and new value. The
 * existing `details` field carries it under a reserved shape so audit entries
 * stay one collection and existing readers are unaffected.
 */
export interface ActivityChangeDetails {
  before?: Record<string, any> | null
  after?: Record<string, any> | null
  [key: string]: any
}

export interface IActivityLog extends Document {
  organization: mongoose.Types.ObjectId
  user: mongoose.Types.ObjectId
  action: ActivityAction
  entityType: ActivityEntityType
  entityId?: mongoose.Types.ObjectId
  entityName?: string
  project?: mongoose.Types.ObjectId
  projectName?: string
  details?: ActivityChangeDetails
  createdAt: Date
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    action: {
      type: String,
      required: true,
      enum: [...ACTIVITY_ACTIONS]
    },
    entityType: {
      type: String,
      required: true,
      enum: [...ACTIVITY_ENTITY_TYPES]
    },
    entityId: {
      type: Schema.Types.ObjectId
    },
    entityName: {
      type: String,
      maxlength: 500
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project'
    },
    projectName: {
      type: String,
      maxlength: 200
    },
    details: {
      type: Schema.Types.Mixed
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
)

// Indexes for efficient querying
ActivityLogSchema.index({ organization: 1, createdAt: -1 })
ActivityLogSchema.index({ organization: 1, user: 1, createdAt: -1 })
ActivityLogSchema.index({ organization: 1, entityType: 1, createdAt: -1 })
ActivityLogSchema.index({ organization: 1, project: 1, createdAt: -1 })

export const ActivityLog =
  mongoose.models.ActivityLog || mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema)
