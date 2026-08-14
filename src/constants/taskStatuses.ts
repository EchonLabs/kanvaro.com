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
  backlog: 'Backlog',
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

/**
 * What a status *means*, independent of what a project calls it.
 *
 * Projects may rename statuses and invent their own (Project.settings
 * .kanbanStatuses), so no feature can rely on the literal key "done". The
 * stand-up module needs the three sets the spec calls the "done set", the "in
 * progress set" and the "blocked set" (RUN-9 bucketing, CFW-1 closure
 * conditions, ALO-13 pool membership), and this is where a status key is
 * mapped onto them.
 *
 * `cancelled` is kept separate from `done` on purpose: a cancelled task is
 * closed, so it must leave the pool and stop ageing carry-forward items, but it
 * was never delivered and must not appear in "Completed since last stand-up".
 * Use {@link isClosedStatusCategory} for the former and
 * {@link isDoneStatusCategory} for the latter.
 */
export const TASK_STATUS_CATEGORIES = [
  'todo',
  'in_progress',
  'done',
  'blocked',
  'cancelled'
] as const

export type TaskStatusCategory = typeof TASK_STATUS_CATEGORIES[number]

/**
 * Category applied to each built-in status when a project has not configured
 * one. Existing projects therefore get correct behaviour with no migration and
 * no action from their PM.
 */
export const DEFAULT_TASK_STATUS_CATEGORIES: Record<string, TaskStatusCategory> = {
  backlog: 'todo',
  todo: 'todo',
  in_progress: 'in_progress',
  review: 'in_progress',
  testing: 'in_progress',
  done: 'done',
  cancelled: 'cancelled',
  blocked: 'blocked'
}

/**
 * Fallback for a custom status nobody has categorised yet.
 *
 * Deliberately biased toward "still open work". Guessing `done` would silently
 * close carry-forward items and drop tasks out of the pool, which is exactly
 * the invisible-loss failure the module exists to prevent (INV-8).
 */
export const FALLBACK_TASK_STATUS_CATEGORY: TaskStatusCategory = 'in_progress'

/**
 * Resolves a status key to its category, preferring the project's own
 * configuration and falling back to the built-in map.
 */
export function resolveTaskStatusCategory(
  statusKey: string,
  configuredStatuses?: Array<{ key: string; category?: TaskStatusCategory }>
): TaskStatusCategory {
  const configured = configuredStatuses?.find((status) => status.key === statusKey)
  if (configured?.category) return configured.category

  return DEFAULT_TASK_STATUS_CATEGORIES[statusKey] ?? FALLBACK_TASK_STATUS_CATEGORY
}

/** True when the task counts as delivered — the spec's "done set". */
export function isDoneStatusCategory(category: TaskStatusCategory): boolean {
  return category === 'done'
}

/** True when the task is no longer open work, whether delivered or cancelled. */
export function isClosedStatusCategory(category: TaskStatusCategory): boolean {
  return category === 'done' || category === 'cancelled'
}


