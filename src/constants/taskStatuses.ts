import { formatToTitleCase } from '@/lib/utils'

export const DEFAULT_TASK_STATUS_KEYS = [
  'backlog',
  'todo',
  'in_progress',
  'review',
  'testing',
  'done',
  'cancelled'
] as const

export type TaskStatusKey = typeof DEFAULT_TASK_STATUS_KEYS[number]

export interface TaskStatusOption {
  value: string
  label: string
  color?: string
}

export const DEFAULT_TASK_STATUS_LABELS: Record<string, string> = {
  backlog: 'backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'In Review',
  testing: 'Testing',
  done: 'Done',
  cancelled: 'Cancelled'
}

export const DEFAULT_TASK_STATUS_BADGE_MAP: Record<string, string> = {
  backlog: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
  todo: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  review: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  testing: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  blocked: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
}

export const DEFAULT_TASK_STATUS_OPTIONS: TaskStatusOption[] = DEFAULT_TASK_STATUS_KEYS.map((key) => ({
  value: key,
  label: DEFAULT_TASK_STATUS_LABELS[key] || formatToTitleCase(key),
  color: DEFAULT_TASK_STATUS_BADGE_MAP[key]
}))


