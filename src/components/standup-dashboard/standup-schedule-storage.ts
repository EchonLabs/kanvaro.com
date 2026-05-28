import type {
  StandupMember,
  StandupMeeting,
  StandupScheduleComment,
  StandupTaskAssignment
} from './standup-dashboard-types'

type StandupMemberRef = StandupMember | { _id?: string; firstName?: string; lastName?: string; email?: string; avatar?: string; role?: string; customRole?: { name?: string } } | string | null | undefined

type StandupTaskRef = {
  _id?: string
  title?: string
  status?: string
  displayId?: string
  priority?: string
}

type StandupScheduleApiComment = {
  _id?: string
  author?: StandupMemberRef
  authorName?: string
  member?: StandupMemberRef
  reason?: string
  createdAt?: string
}

export type StandupScheduleApiItem = {
  _id: string
  title?: string
  scheduledDate?: string
  actualDate?: string
  time?: string
  durationMinutes?: number
  status?: StandupMeeting['status'] | 'cancelled'
  participants?: StandupMemberRef[]
  facilitator?: StandupMemberRef
  createdBy?: StandupMemberRef
  notes?: string
  summary?: string
  location?: string
  meetingLink?: string
  assignments?: Array<{
    member?: StandupMemberRef
    task?: StandupTaskRef | string
    taskTitle?: string
    taskStatus?: string
    durationMinutes?: number
    notes?: string
  }>
  comments?: StandupScheduleApiComment[]
}

const isObjectLike = (value: unknown): value is Record<string, any> => typeof value === 'object' && value !== null

const buildScheduledDateTime = (scheduledDate?: string, time?: string) => {
  if (!scheduledDate) return null
  const base = new Date(scheduledDate)
  if (Number.isNaN(base.getTime())) return null

  if (typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    const [hours, minutes] = time.split(':').map((value) => Number(value))
    base.setHours(hours, minutes, 0, 0)
  } else {
    base.setHours(0, 0, 0, 0)
  }

  return base
}

const normalizeMember = (member: StandupMemberRef): StandupMember | null => {
  if (!member) return null

  const source = (isObjectLike(member) ? member : {}) as Record<string, any>
  const id = typeof member === 'string' ? member : String(source._id || '')

  if (!id) return null

  const role = source.customRole?.name || source.role || 'Team Member'

  return {
    _id: id,
    firstName: source.firstName || 'Unknown',
    lastName: source.lastName || '',
    email: source.email || '',
    role,
    avatar: source.avatar
  }
}

const normalizeComment = (comment: StandupScheduleApiComment): StandupScheduleComment | null => {
  const reason = typeof comment.reason === 'string' ? comment.reason.trim() : ''
  if (!reason) return null

  const author = normalizeMember(comment.author) || normalizeMember(comment.member) || {
    _id: 'unknown',
    firstName: 'Unknown',
    lastName: 'Member',
    email: '',
    role: 'Team Member'
  }

  return {
    _id: comment._id || `comment-${Date.now()}`,
    authorName: typeof comment.authorName === 'string' && comment.authorName.trim() ? comment.authorName.trim() : `${author.firstName} ${author.lastName}`.trim(),
    memberId: normalizeMember(comment.member)?._id,
    reason,
    createdAt: comment.createdAt || new Date().toISOString()
  }
}

const normalizeAssignment = (assignment: NonNullable<StandupScheduleApiItem['assignments']>[number]): StandupTaskAssignment | null => {
  const member = normalizeMember(assignment.member)
  if (!member) return null

  const task = isObjectLike(assignment.task) ? assignment.task : undefined
  const taskId = task?._id || (typeof assignment.task === 'string' ? assignment.task : '')
  const taskTitle = typeof assignment.taskTitle === 'string' && assignment.taskTitle.trim()
    ? assignment.taskTitle.trim()
    : task?.title || 'Untitled task'

  if (!taskId) return null

  return {
    memberId: member._id,
    memberName: `${member.firstName} ${member.lastName}`.trim(),
    taskId,
    taskTitle,
    status: assignment.taskStatus || task?.status,
    durationMinutes: assignment.durationMinutes
  }
}

const normalizeMeeting = (schedule: StandupScheduleApiItem): StandupMeeting => {
  const scheduledDateTime = buildScheduledDateTime(schedule.actualDate || schedule.scheduledDate, schedule.time)
  const now = new Date()
  const resolvedStatus = schedule.status === 'in_progress'
    ? 'in_progress'
    : schedule.status === 'completed'
      ? 'completed'
      : schedule.status === 'missed'
        ? 'missed'
        : scheduledDateTime && scheduledDateTime < now
          ? 'completed'
          : 'scheduled'

  const participants = Array.isArray(schedule.participants)
    ? schedule.participants.map(normalizeMember).filter(Boolean) as StandupMember[]
    : []

  return {
    _id: schedule._id,
    title: schedule.title || 'Daily Standup',
    date: schedule.actualDate || schedule.scheduledDate || new Date().toISOString(),
    actualDate: schedule.actualDate,
    time: schedule.time || '09:00',
    durationMinutes: typeof schedule.durationMinutes === 'number' ? schedule.durationMinutes : 15,
    participants,
    status: resolvedStatus,
    notes: schedule.notes,
    facilitator: normalizeMember(schedule.facilitator) || undefined,
    createdBy: normalizeMember(schedule.createdBy) || undefined,
    location: schedule.location,
    meetingLink: schedule.meetingLink,
    assignments: Array.isArray(schedule.assignments)
      ? schedule.assignments.map(normalizeAssignment).filter(Boolean) as StandupTaskAssignment[]
      : [],
    comments: Array.isArray(schedule.comments)
      ? schedule.comments.map(normalizeComment).filter(Boolean) as StandupScheduleComment[]
      : [],
    summary: schedule.summary
  }
}

const fetchJson = async <T,>(url: string, signal?: AbortSignal, init?: RequestInit): Promise<T | null> => {
  try {
    const response = await fetch(url, { signal, cache: 'no-store', ...init })
    if (!response.ok) {
      return null
    }
    return await response.json() as T
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    return null
  }
}

export async function fetchStandupProjectSchedules(projectId: string, signal?: AbortSignal): Promise<StandupMeeting[]> {
  const response = await fetchJson<{ success?: boolean; data?: StandupScheduleApiItem[] }>(`/api/projects/${projectId}/standup-schedules?limit=100&page=1`, signal)
  const schedules = Array.isArray(response?.data) ? response!.data : []
  return schedules.map(normalizeMeeting)
}

export async function fetchStandupSchedule(projectId: string, scheduleId: string, signal?: AbortSignal): Promise<StandupMeeting | null> {
  const response = await fetchJson<{ success?: boolean; data?: StandupScheduleApiItem }>(`/api/projects/${projectId}/standup-schedules/${scheduleId}`, signal)
  return response?.data ? normalizeMeeting(response.data) : null
}

export async function createStandupSchedule(projectId: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<StandupScheduleApiItem> {
  const response = await fetchJson<{ success?: boolean; data?: StandupScheduleApiItem }>(`/api/projects/${projectId}/standup-schedules`, signal, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!response?.data) {
    throw new Error('Unable to create standup schedule')
  }

  return response.data
}

export async function updateStandupSchedule(projectId: string, scheduleId: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<StandupMeeting> {
  const response = await fetchJson<{ success?: boolean; data?: StandupScheduleApiItem }>(`/api/projects/${projectId}/standup-schedules/${scheduleId}`, signal, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!response?.data) {
    throw new Error('Unable to update standup schedule')
  }

  return normalizeMeeting(response.data)
}

export async function updateStandupScheduleComments(projectId: string, scheduleId: string, comments: StandupScheduleComment[], signal?: AbortSignal): Promise<StandupMeeting> {
  return updateStandupSchedule(projectId, scheduleId, { comments }, signal)
}

export async function deleteStandupSchedule(projectId: string, scheduleId: string, signal?: AbortSignal): Promise<void> {
  const response = await fetchJson<{ success?: boolean }>(`/api/projects/${projectId}/standup-schedules/${scheduleId}`, signal, {
    method: 'DELETE'
  })

  if (!response) {
    throw new Error('Unable to delete standup schedule')
  }
}

export function createStandupParticipantList(members: StandupMember[], memberIds: string[]) {
  return members.filter((member) => memberIds.includes(member._id))
}
