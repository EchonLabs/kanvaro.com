import {
  StandupAssignmentPayload,
  StandupMember,
  StandupMemberProgress,
  StandupScheduleDetail,
  StandupScheduleMemberSummary,
  StandupMeeting,
  StandupMeetingStatus,
  StandupPriority,
  StandupTaskAssignment,
  StandupTimelogItem,
  StandupProjectSummary,
  StandupProjectStatus,
  StandupTimelineItem
} from './standup-dashboard-types'
import {
  fetchStandupProjectSchedules,
  fetchStandupSchedule,
  type StandupScheduleApiItem
} from './standup-schedule-storage'

type ProjectApiItem = {
  _id: string
  name?: string
  description?: string
  status?: string
  createdBy?: { _id?: string; firstName?: string; lastName?: string; email?: string; avatar?: string; role?: string; customRole?: { name?: string } }
  client?: { _id?: string; firstName?: string; lastName?: string; email?: string; avatar?: string; role?: string; customRole?: { name?: string } }
  teamMembers?: Array<{ memberId?: any; hourlyRate?: number }>
  progress?: { completionPercentage?: number; tasksCompleted?: number; totalTasks?: number }
  settings?: Record<string, any>
  updatedAt?: string
}

type TeamApiResponse = {
  teamMembers?: Array<any>
  projectRoles?: Array<any>
  createdBy?: any
  client?: any
  availableMembers?: Array<any>
  budget?: any
}

type SprintApiItem = {
  _id: string
  name?: string
  status?: string
  startDate?: string
  endDate?: string
  goal?: string
  description?: string
  capacity?: number
  velocity?: number
  project?: { _id?: string; name?: string } | string
}

type TaskApiItem = {
  _id: string
  title?: string
  status?: string
  priority?: string
  displayId?: string
  taskNumber?: number
  assignedTo?: Array<{
    user?: { _id?: string; firstName?: string; lastName?: string; email?: string; avatar?: string; role?: string; customRole?: { name?: string } }
    firstName?: string
    lastName?: string
    email?: string
    avatar?: string
    role?: string
    customRole?: { name?: string }
    hourlyRate?: number
    _id?: string
  }>
}

type TimeEntryApiItem = {
  _id: string
  description?: string
  startTime?: string
  endTime?: string
  duration?: number
  isBillable?: boolean
  status?: string
  project?: { _id?: string; name?: string } | null
  task?: { _id?: string; title?: string | null } | null
  user?: { _id?: string; firstName?: string; lastName?: string; email?: string } | string | null
}

type StandupLiveProjectDetail = {
  summary: StandupProjectSummary
  projectTasks: TaskApiItem[]
  sprint?: SprintApiItem
  projectRecord?: ProjectApiItem
  teamResponse?: TeamApiResponse
  schedules: StandupMeeting[]
}

const normalizeStatus = (status?: string): StandupProjectStatus => {
  if (status === 'on_hold' || status === 'planning' || status === 'completed' || status === 'active') {
    return status
  }
  return 'active'
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

const normalizeMember = (member: any): StandupMember | null => {
  const source = member?.memberId || member?.user || member
  if (!source) return null

  const id = String(source._id || source.id || member?._id || member?.user?._id || '')
  if (!id) return null

  return {
    _id: id,
    firstName: source.firstName || member?.firstName || 'Unknown',
    lastName: source.lastName || member?.lastName || '',
    email: source.email || member?.email || '',
    role: source.customRole?.name || source.role || member?.role || 'Team Member',
    avatar: source.avatar || member?.avatar
  }
}

const sanitizeString = (value?: string, fallback = '') => (typeof value === 'string' && value.trim() ? value : fallback)

const fetchJson = async <T,>(url: string, signal?: AbortSignal, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { signal, cache: 'no-store', ...init })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `Request failed with status ${response.status}`)
  }
  return await response.json() as T
}

const normalizeTask = (task: TaskApiItem) => ({
  _id: task._id,
  title: task.title || 'Untitled task',
  status: task.status || 'todo',
  priority: task.priority || 'medium',
  displayId: task.displayId || (task.taskNumber ? `#${task.taskNumber}` : ''),
  assignedTo: Array.isArray(task.assignedTo)
    ? task.assignedTo.map((entry) => normalizeMember(entry)).filter(Boolean) as StandupMember[]
    : []
})

const normalizeMeeting = (schedule: StandupScheduleApiItem): StandupMeeting => {
  const scheduledDateTime = buildScheduledDateTime(schedule.actualDate || schedule.scheduledDate, schedule.time)
  const resolvedStatus = schedule.status === 'in_progress'
    ? 'in_progress'
    : schedule.status === 'completed'
      ? 'completed'
      : schedule.status === 'missed'
        ? 'missed'
        : scheduledDateTime && scheduledDateTime < new Date()
          ? 'completed'
          : 'scheduled'

  return {
    _id: schedule._id,
    title: schedule.title || 'Daily Standup',
    date: schedule.actualDate || schedule.scheduledDate || new Date().toISOString(),
    actualDate: schedule.actualDate,
    time: schedule.time || '09:00',
    durationMinutes: typeof schedule.durationMinutes === 'number' ? schedule.durationMinutes : 15,
    participants: Array.isArray(schedule.participants)
      ? schedule.participants.map(normalizeMember).filter(Boolean) as StandupMember[]
      : [],
    status: resolvedStatus as StandupMeetingStatus,
    notes: schedule.notes,
    facilitator: normalizeMember(schedule.facilitator) || undefined,
    createdBy: normalizeMember(schedule.createdBy) || undefined,
    location: schedule.location,
    meetingLink: schedule.meetingLink,
    assignments: Array.isArray(schedule.assignments)
      ? schedule.assignments.map((assignment) => {
        const member = normalizeMember(assignment.member)
        if (!member) return null
        const task = isObjectLike(assignment.task) ? assignment.task : undefined
        const taskId = task?._id || (typeof assignment.task === 'string' ? assignment.task : '')
        if (!taskId) return null

        return {
          memberId: member._id,
          memberName: `${member.firstName} ${member.lastName}`.trim(),
          taskId,
          taskTitle: assignment.taskTitle || task?.title || 'Untitled task',
          status: assignment.taskStatus || task?.status,
          durationMinutes: assignment.durationMinutes
        }
      }).filter(Boolean) as StandupTaskAssignment[]
      : [],
    comments: Array.isArray(schedule.comments)
      ? schedule.comments.map((comment) => {
        const author = normalizeMember(comment.author || comment.member) || {
          _id: 'unknown',
          firstName: 'Unknown',
          lastName: 'Member',
          email: '',
          role: 'Team Member'
        }

        return {
          _id: comment._id || `comment-${Date.now()}`,
          authorName: comment.authorName || `${author.firstName} ${author.lastName}`.trim(),
          memberId: normalizeMember(comment.member)?._id,
          reason: comment.reason || '',
          createdAt: comment.createdAt || new Date().toISOString()
        }
      }).filter((comment): comment is NonNullable<typeof comment> => Boolean(comment.reason))
      : [],
    summary: schedule.summary
  }
}

const buildMemberProgress = (members: StandupMember[], taskCards: ReturnType<typeof normalizeTask>[], overallProgress: number): StandupMemberProgress[] => {
  return members.map((member, index) => {
    const memberTasks = taskCards.filter((task) => task.assignedTo.some((assignedMember) => assignedMember._id === member._id))
    const assignedTasks = memberTasks.length
    const completedTasks = memberTasks.filter((task) => task.status === 'done' || task.status === 'completed').length
    const blockedTasks = memberTasks.filter((task) => ['blocked', 'in_progress', 'on_hold'].includes(task.status)).length
    const progressPercent = assignedTasks > 0
      ? Math.max(0, Math.min(100, Math.round((completedTasks / assignedTasks) * 100)))
      : Math.max(0, Math.min(100, overallProgress - index * 5))

    return {
      ...member,
      assignedTasks,
      completedTasks,
      blockedTasks,
      currentTask: memberTasks[0]?.title || 'Review standup updates',
      progressPercent,
      status: blockedTasks > 0 ? 'blocked' : completedTasks < assignedTasks ? 'needs_attention' : 'on_track'
    }
  })
}

const buildTimeline = (schedules: StandupMeeting[], members: StandupMember[]): StandupTimelineItem[] => {
  const fallbackAuthor = members[0] || { _id: 'standup-system', firstName: 'Standup', lastName: 'System', email: '', role: 'System' }

  return schedules
    .slice()
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 8)
    .flatMap((meeting, index) => {
      const author = meeting.facilitator || meeting.createdBy || fallbackAuthor
      const baseType: StandupTimelineItem['type'] = meeting.status === 'completed'
        ? 'update'
        : meeting.status === 'in_progress'
          ? 'progress'
          : meeting.status === 'missed'
            ? 'blocker'
            : 'note'

      const items: StandupTimelineItem[] = [
        {
          _id: `${meeting._id}-summary`,
          type: baseType,
          title: meeting.title,
          description: meeting.summary || meeting.notes || `${meeting.participants.length} participants scheduled`,
          createdAt: meeting.actualDate || meeting.date,
          author,
          projectTask: meeting.assignments?.[0]?.taskTitle
        }
      ]

      const firstComment = meeting.comments?.[0]
      if (firstComment) {
        items.push({
          _id: `${meeting._id}-comment-${index}`,
          type: 'note',
          title: 'Follow-up comment',
          description: firstComment.reason,
          createdAt: firstComment.createdAt,
          author,
          projectTask: meeting.assignments?.[0]?.taskTitle
        })
      }

      return items
    })
}

const mapProjectSummary = async (project: ProjectApiItem, signal?: AbortSignal): Promise<StandupProjectSummary> => {
  const schedules = await fetchStandupProjectSchedules(project._id, signal)
  const teamMembers = Array.isArray(project.teamMembers)
    ? project.teamMembers.map(normalizeMember).filter(Boolean) as StandupMember[]
    : []
  const progressPercent = project.progress?.completionPercentage ?? 0
  const latestSchedule = schedules[0]

  return {
    _id: project._id,
    name: sanitizeString(project.name, 'Untitled Project'),
    status: normalizeStatus(project.status),
    sprintName: project.settings?.currentSprintName || project.settings?.sprintName,
    teamMembers,
    progressPercent,
    lastStandupAt: latestSchedule?.date || project.updatedAt || new Date().toISOString(),
    summary: sanitizeString(project.description, schedules.length > 0 ? `${schedules.length} standup schedules recorded.` : 'No standup schedules recorded yet.'),
    meetings: schedules,
    memberProgress: buildMemberProgress(teamMembers, [], progressPercent),
    timeline: buildTimeline(schedules, teamMembers)
  }
}

export async function fetchStandupProjectSummaries(signal?: AbortSignal): Promise<StandupProjectSummary[]> {
  const live = await fetchJson<{ success?: boolean; data?: ProjectApiItem[]; projects?: ProjectApiItem[] }>('/api/projects?limit=1000&page=1', signal)
  const liveProjects = Array.isArray(live?.data) ? live.data : Array.isArray(live?.projects) ? live.projects : []

  const summaries = await Promise.all(liveProjects.map((project) => mapProjectSummary(project, signal)))
  return summaries.sort((left, right) => new Date(right.lastStandupAt).getTime() - new Date(left.lastStandupAt).getTime())
}

export async function fetchStandupProjectDetail(projectId: string, signal?: AbortSignal): Promise<StandupLiveProjectDetail> {
  const [projectResponse, teamResponse, tasksResponse, sprintsResponse, schedules] = await Promise.all([
    fetchJson<{ success?: boolean; data?: ProjectApiItem }>(`/api/projects/${projectId}`, signal),
    fetchJson<{ success?: boolean; data?: TeamApiResponse }>(`/api/projects/${projectId}/team`, signal),
    fetchJson<{ success?: boolean; data?: TaskApiItem[] }>(`/api/projects/${projectId}/tasks`, signal),
    fetchJson<{ success?: boolean; data?: SprintApiItem[] | SprintApiItem }>(`/api/sprints?project=${projectId}&limit=20`, signal),
    fetchStandupProjectSchedules(projectId, signal)
  ])

  const projectRecord = projectResponse.data
  if (!projectRecord) {
    throw new Error('Project not found')
  }

  const teamData = teamResponse.data
  const tasksData = Array.isArray(tasksResponse.data) ? tasksResponse.data : []
  const sprintData = Array.isArray(sprintsResponse.data)
    ? sprintsResponse.data[0]
    : sprintsResponse.data ?? undefined

  const teamMembers = Array.isArray(teamData?.teamMembers)
    ? teamData.teamMembers.map(normalizeMember).filter(Boolean) as StandupMember[]
    : Array.isArray(projectRecord.teamMembers)
      ? projectRecord.teamMembers.map(normalizeMember).filter(Boolean) as StandupMember[]
      : []

  const projectTasks = tasksData.map(normalizeTask)
  const completionPercent = projectRecord.progress?.completionPercentage ?? 0
  const memberProgress = buildMemberProgress(teamMembers, projectTasks, completionPercent)
  const timeline = buildTimeline(schedules, teamMembers)
  const meetings = schedules.length > 0 ? schedules : []

  return {
    summary: {
      _id: projectRecord._id,
      name: sanitizeString(projectRecord.name, 'Untitled Project'),
      status: normalizeStatus(projectRecord.status),
      sprintName: sprintData?.name || projectRecord.settings?.currentSprintName || projectRecord.settings?.sprintName,
      teamMembers,
      progressPercent: completionPercent,
      lastStandupAt: meetings[0]?.date || projectRecord.updatedAt || new Date().toISOString(),
      summary: sanitizeString(projectRecord.description, meetings.length > 0 ? `${meetings.length} standup schedules recorded.` : 'No standup schedules recorded yet.'),
      meetings,
      memberProgress,
      timeline
    },
    projectTasks,
    sprint: sprintData,
    projectRecord,
    teamResponse: teamData,
    schedules: meetings
  }
}

const mapTimeLog = (entry: TimeEntryApiItem): StandupTimelogItem => {
  const userId = typeof entry.user === 'string'
    ? entry.user
    : entry.user?._id || ''
  const userName = typeof entry.user === 'object' && entry.user
    ? `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim() || entry.user.email || 'Unknown member'
    : 'Unknown member'

  return {
    _id: entry._id,
    userId,
    userName,
    taskTitle: entry.task && typeof entry.task === 'object' ? (entry.task.title || undefined) : undefined,
    projectName: entry.project && typeof entry.project === 'object' ? (entry.project.name || 'Project') : 'Project',
    startTime: entry.startTime || new Date().toISOString(),
    endTime: entry.endTime,
    duration: entry.duration || 0,
    description: entry.description || '',
    isBillable: !!entry.isBillable,
    status: entry.status || 'completed'
  }
}

export async function fetchStandupScheduleDetail(projectId: string, meetingId: string, organizationId: string, signal?: AbortSignal): Promise<StandupScheduleDetail> {
  const projectDetail = await fetchStandupProjectDetail(projectId, signal)
  const meeting = await fetchStandupSchedule(projectId, meetingId, signal)

  if (!meeting) {
    throw new Error('Standup schedule not found')
  }

  const [logResponse, taskResponse] = await Promise.all([
    fetchJson<{ success?: boolean; timeEntries?: TimeEntryApiItem[]; data?: TimeEntryApiItem[] }>(`/api/time-tracking/entries?organizationId=${encodeURIComponent(organizationId)}&projectId=${encodeURIComponent(projectId)}&startDate=${encodeURIComponent(meeting.date.slice(0, 10))}&endDate=${encodeURIComponent(meeting.date.slice(0, 10))}&limit=200`, signal),
    fetchJson<{ success?: boolean; data?: TaskApiItem[] }>(`/api/projects/${projectId}/tasks`, signal)
  ])

  const timelogs = Array.isArray(logResponse.timeEntries)
    ? logResponse.timeEntries.map(mapTimeLog)
    : Array.isArray(logResponse.data)
      ? logResponse.data.map(mapTimeLog)
      : []

  const taskCards = Array.isArray(taskResponse.data) ? taskResponse.data.map(normalizeTask) : projectDetail.projectTasks.map(normalizeTask)
  const normalizedTaskCards = taskCards.map((task) => ({
    _id: task._id,
    title: task.title || 'Untitled task',
    status: task.status,
    priority: task.priority,
    displayId: task.displayId,
    assignedTo: Array.isArray(task.assignedTo) ? task.assignedTo : []
  }))

  const memberSummaries: StandupScheduleMemberSummary[] = projectDetail.summary.teamMembers.map((member, index) => {
    const memberTimelogs = timelogs.filter((log) => log.userId === member._id)
    const memberAssignments = meeting.assignments?.filter((assignment) => assignment.memberId === member._id) || []
    const memberTasks = normalizedTaskCards.filter((task) => task.assignedTo?.some((assignedMember) => {
      const assignedId = assignedMember._id
      return assignedId === member._id
    }))

    const assignedTasks: StandupTaskAssignment[] = memberAssignments.length > 0
      ? memberAssignments
      : memberTasks.map((task) => ({
        memberId: member._id,
        memberName: `${member.firstName} ${member.lastName}`.trim(),
        taskId: task._id,
        taskTitle: task.title || 'Untitled task',
        status: task.status,
        durationMinutes: memberTimelogs.reduce((sum, log) => sum + log.duration, 0)
      }))

    const completedTasks = memberTasks.filter((task) => task.status === 'done' || task.status === 'completed').length
    const blockedTasks = memberTasks.filter((task) => ['blocked', 'in_progress', 'on_hold'].includes(task.status)).length
    const timeLoggedMinutes = memberTimelogs.reduce((sum, log) => sum + log.duration, 0)
    const commentNotes = meeting.comments
      ?.filter((comment) => comment.memberId === member._id)
      .map((comment) => comment.reason)
      .filter(Boolean) || []

    return {
      ...member,
      assignedTasks,
      completedTasks,
      blockedTasks,
      timeLoggedMinutes,
      notes: [...commentNotes, ...memberTimelogs.map((log) => log.description).filter(Boolean)],
      currentTask: assignedTasks[0]?.taskTitle || projectDetail.summary.memberProgress[index % Math.max(projectDetail.summary.memberProgress.length, 1)]?.currentTask || 'Review standup updates',
      progressPercent: Math.max(0, Math.min(100, projectDetail.summary.progressPercent - index * 5)),
      status: blockedTasks > 0 ? 'blocked' : timeLoggedMinutes > 0 ? 'on_track' : 'needs_attention'
    }
  })

  const pastMeetings = projectDetail.schedules.filter((item) => item._id !== meeting._id && (item.status === 'completed' || item.status === 'missed' || new Date(item.date).getTime() < new Date(meeting.date).getTime()))

  return {
    project: projectDetail.summary,
    meeting,
    pastMeetings,
    memberSummaries,
    timelogs,
    projectTasks: normalizedTaskCards
  }
}

export function createStandupAssignmentDraft(members: StandupMember[]): StandupAssignmentPayload {
  return {
    memberId: members[0]?._id ?? '',
    taskTitle: '',
    priority: 'medium' as StandupPriority,
    dueDate: new Date().toISOString(),
    notes: ''
  }
}