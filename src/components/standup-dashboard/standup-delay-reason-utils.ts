import type { StandupTimelogItem } from './standup-dashboard-types'

export type StandupPreviewTask = {
  _id: string
  title: string
  status?: string
  displayId?: string
  estimatedHours?: number
  dueDate?: string
  completedAt?: string
  actualHours?: number
}

export type DelayedTaskPreview = StandupPreviewTask & {
  loggedHours: number
  estimateHours: number
  overdueReasonLabel: string
}

const roundHours = (minutes: number) => Math.round((Math.max(0, minutes) / 60) * 10) / 10

export const getLoggedMinutesByTask = (timelogs: StandupTimelogItem[]) => {
  const minutesByTask = new Map<string, number>()

  timelogs.forEach((log) => {
    if (!log.taskId) return
    minutesByTask.set(log.taskId, (minutesByTask.get(log.taskId) || 0) + (log.duration || 0))
  })

  return minutesByTask
}

export const getDelayedTasks = (tasks: StandupPreviewTask[], timelogs: StandupTimelogItem[]): DelayedTaskPreview[] => {
  const minutesByTask = getLoggedMinutesByTask(timelogs)

  return tasks
    .map((task) => {
      const estimateHours = typeof task.estimatedHours === 'number' && task.estimatedHours > 0 ? task.estimatedHours : 0
      const loggedHours = roundHours(minutesByTask.get(task._id) || 0)

      if (!estimateHours || loggedHours <= estimateHours) {
        return null
      }

      return {
        ...task,
        estimateHours,
        loggedHours,
        overdueReasonLabel: 'overdue'
      }
    })
    .filter((task): task is DelayedTaskPreview => Boolean(task))
}