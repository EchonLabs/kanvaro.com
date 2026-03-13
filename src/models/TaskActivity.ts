import mongoose, { Schema, Document } from 'mongoose'

export type TaskActivityAction =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'priority_changed'
  | 'assigned'
  | 'unassigned'
  | 'comment_added'
  | 'comment_updated'
  | 'comment_deleted'
  | 'attachment_added'
  | 'attachment_removed'
  | 'due_date_changed'
  | 'sprint_changed'
  | 'story_changed'
  | 'epic_changed'
  | 'labels_changed'
  | 'type_changed'
  | 'title_changed'
  | 'description_changed'
  | 'story_points_changed'
  | 'estimated_hours_changed'
  | 'subtask_added'
  | 'subtask_removed'
  | 'subtask_updated'

export interface ITaskActivity extends Document {
  task: mongoose.Types.ObjectId
  organization: mongoose.Types.ObjectId
  user: mongoose.Types.ObjectId
  action: TaskActivityAction
  field?: string
  oldValue?: string
  newValue?: string
  metadata?: Record<string, any>
  createdAt: Date
}

const TaskActivitySchema = new Schema<ITaskActivity>(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      required: true,
      enum: [
        'created', 'updated', 'status_changed', 'priority_changed',
        'assigned', 'unassigned', 'comment_added', 'comment_updated',
        'comment_deleted', 'attachment_added', 'attachment_removed',
        'due_date_changed', 'sprint_changed', 'story_changed', 'epic_changed',
        'labels_changed', 'type_changed', 'title_changed', 'description_changed',
        'story_points_changed', 'estimated_hours_changed',
        'subtask_added', 'subtask_removed', 'subtask_updated'
      ]
    },
    field: { type: String },
    oldValue: { type: String },
    newValue: { type: String },
    metadata: { type: Schema.Types.Mixed }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
)

TaskActivitySchema.index({ task: 1, createdAt: -1 })

export const TaskActivity =
  mongoose.models.TaskActivity || mongoose.model<ITaskActivity>('TaskActivity', TaskActivitySchema)
