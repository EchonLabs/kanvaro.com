import type { StandupMember, StandupTaskAssignment } from './standup-dashboard-types'

export interface StoredStandupComment {
  _id: string
  authorName: string
  memberId?: string
  reason: string
  createdAt: string
}

export interface StoredStandupSchedule {
  _id: string
  title: string
  date: string
  time: string
  durationMinutes: number
  status: 'scheduled' | 'in_progress' | 'completed' | 'missed'
  participants: StandupMember[]
  notes?: string
  assignments: StandupTaskAssignment[]
  comments: StoredStandupComment[]
}

const getSchedulesKey = (projectId: string) => `kanvaro_standup_schedules_${projectId}`
const getCommentsKey = (projectId: string, scheduleId: string) => `kanvaro_standup_comments_${projectId}_${scheduleId}`

export function loadStoredStandupSchedules(projectId: string): StoredStandupSchedule[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(getSchedulesKey(projectId))
    return raw ? JSON.parse(raw) as StoredStandupSchedule[] : []
  } catch {
    return []
  }
}

export function saveStoredStandupSchedule(projectId: string, schedule: StoredStandupSchedule) {
  if (typeof window === 'undefined') return
  const schedules = loadStoredStandupSchedules(projectId)
  const next = [schedule, ...schedules.filter((item) => item._id !== schedule._id)]
  window.localStorage.setItem(getSchedulesKey(projectId), JSON.stringify(next))
}

export function loadStoredStandupComments(projectId: string, scheduleId: string): StoredStandupComment[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(getCommentsKey(projectId, scheduleId))
    return raw ? JSON.parse(raw) as StoredStandupComment[] : []
  } catch {
    return []
  }
}

export function saveStoredStandupComment(projectId: string, scheduleId: string, comment: StoredStandupComment) {
  if (typeof window === 'undefined') return
  const comments = loadStoredStandupComments(projectId, scheduleId)
  const next = [comment, ...comments]
  window.localStorage.setItem(getCommentsKey(projectId, scheduleId), JSON.stringify(next))
}

export function createStandupParticipantList(members: StandupMember[], memberIds: string[]) {
  return members.filter((member) => memberIds.includes(member._id))
}
