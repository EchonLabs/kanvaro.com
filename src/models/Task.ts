import mongoose, { Schema, Document } from 'mongoose'

export const TASK_STATUS_VALUES = ['backlog', 'todo', 'in_progress', 'review', 'testing', 'done', 'cancelled'] as const
export type TaskStatus = typeof TASK_STATUS_VALUES[number]

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
  assignedTo?: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  storyPoints?: number
  dueDate?: Date
  estimatedHours?: number
  actualHours?: number
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
    mentions?: mongoose.Types.ObjectId[]
    linkedIssues?: mongoose.Types.ObjectId[]
    createdAt: Date
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
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 2000
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
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
    mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    linkedIssues: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
    createdAt: { type: Date, default: Date.now }
  }],
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

export const Task = mongoose.models.Task || mongoose.model<ITask>('Task', TaskSchema)
