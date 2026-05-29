import { getStandupDateKey } from './standup-date-utils'
import type { StandupTimelogItem } from './standup-dashboard-types'

export const roundLoggedHours = (minutes: number): number => {
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, minutes) : 0
  return Math.round((safeMinutes / 60) * 10) / 10
}

export const formatLoggedHours = (minutes: number): string => {
  const roundedHours = roundLoggedHours(minutes)
  return `${Number.isInteger(roundedHours) ? roundedHours.toFixed(0) : roundedHours.toFixed(1)}h`
}

interface FilterStandupTimelogsParams {
  timelogs: StandupTimelogItem[]
  standupDate: string | Date
  memberIds?: string[]
  taskIds?: string[]
  requireTaskId?: boolean
}

export const filterStandupTimelogs = ({
  timelogs,
  standupDate,
  memberIds,
  taskIds,
  requireTaskId = true
}: FilterStandupTimelogsParams): StandupTimelogItem[] => {
  const standupDateKey = getStandupDateKey(standupDate)
  if (!standupDateKey) return []

  const allowedMembers = Array.isArray(memberIds) && memberIds.length > 0 ? new Set(memberIds) : null
  const allowedTasks = Array.isArray(taskIds) && taskIds.length > 0 ? new Set(taskIds) : null

  return timelogs.filter((log) => {
    if (!log.userId || !log.startTime) return false
    if (allowedMembers && !allowedMembers.has(log.userId)) return false
    if (requireTaskId && !log.taskId) return false
    if (allowedTasks && (!log.taskId || !allowedTasks.has(log.taskId))) return false

    return getStandupDateKey(log.startTime) === standupDateKey
  })
}
