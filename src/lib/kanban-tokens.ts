export const PRIORITY_ACCENT: Record<string, string> = {
  low:      '#8E8E93',
  medium:   '#007AFF',
  high:     '#FF9500',
  critical: '#FF453A',
}

export const PRIORITY_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  low:      { bg: 'bg-gray-50 dark:bg-gray-900/40',      text: 'text-gray-500 dark:text-gray-400',     border: 'border-gray-200 dark:border-gray-700' },
  medium:   { bg: 'bg-blue-50 dark:bg-blue-950/30',      text: 'text-blue-600 dark:text-blue-400',     border: 'border-blue-200 dark:border-blue-800' },
  high:     { bg: 'bg-orange-50 dark:bg-orange-950/30',  text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800' },
  critical: { bg: 'bg-red-50 dark:bg-red-950/30',        text: 'text-red-600 dark:text-red-400',       border: 'border-red-200 dark:border-red-800' },
}

export const TYPE_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  bug:         { bg: 'bg-red-50 dark:bg-red-950/30',        text: 'text-red-600 dark:text-red-400',        border: 'border-red-200 dark:border-red-800' },
  feature:     { bg: 'bg-emerald-50 dark:bg-emerald-950/30',text: 'text-emerald-600 dark:text-emerald-400',border: 'border-emerald-200 dark:border-emerald-800' },
  improvement: { bg: 'bg-blue-50 dark:bg-blue-950/30',      text: 'text-blue-600 dark:text-blue-400',      border: 'border-blue-200 dark:border-blue-800' },
  task:        { bg: 'bg-gray-50 dark:bg-gray-900/40',       text: 'text-gray-500 dark:text-gray-400',      border: 'border-gray-200 dark:border-gray-700' },
  subtask:     { bg: 'bg-purple-50 dark:bg-purple-950/30',   text: 'text-purple-600 dark:text-purple-400',  border: 'border-purple-200 dark:border-purple-800' },
}

export const COLUMN_ACCENT: Record<string, string> = {
  backlog:     '#8E8E93',
  todo:        '#007AFF',
  in_progress: '#FF9500',
  review:      '#BF5AF2',
  testing:     '#30B0C7',
  done:        '#34C759',
  cancelled:   '#FF453A',
}

export function getPriorityBadgeColor(priority: string): { bg: string; text: string; border: string } {
  return PRIORITY_BADGE[priority] ?? PRIORITY_BADGE.medium
}

export function getTypeBadgeColor(type: string): { bg: string; text: string; border: string } {
  return TYPE_BADGE[type] ?? TYPE_BADGE.task
}

export function getPriorityAccentColor(priority: string): string {
  return PRIORITY_ACCENT[priority] ?? '#007AFF'
}

export function getColumnAccentColor(key: string): string {
  return COLUMN_ACCENT[key] ?? '#007AFF'
}

export const DEFAULT_KANBAN_COLUMNS = [
  { key: 'backlog',     title: 'Backlog',     color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-400' },
  { key: 'todo',        title: 'To Do',       color: 'bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400 text-blue-600' },
  { key: 'in_progress', title: 'In Progress', color: 'bg-orange-50 dark:bg-orange-950/30 dark:text-orange-400 text-orange-600' },
  { key: 'review',      title: 'Review',      color: 'bg-purple-50 dark:bg-purple-950/30 dark:text-purple-400 text-purple-600' },
  { key: 'testing',     title: 'Testing',     color: 'bg-cyan-50 dark:bg-cyan-950/30 dark:text-cyan-400 text-cyan-600' },
  { key: 'done',        title: 'Done',         color: 'bg-green-50 dark:bg-green-950/30 dark:text-green-400 text-green-600' },
]
