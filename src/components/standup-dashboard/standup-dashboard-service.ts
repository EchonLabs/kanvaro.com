import {
  StandupAssignmentPayload,
  StandupMember,
  StandupMemberProgress,
  StandupMeeting,
  StandupMeetingStatus,
  StandupPriority,
  StandupProjectSummary,
  StandupProjectStatus,
  StandupTimelineItem
} from './standup-dashboard-types'
import { getStandupProjectById, getStandupProjects } from './standup-dashboard-data'

type ProjectApiItem = {
  _id: string
  name?: string
  description?: string
  status?: string
  startDate?: string
  endDate?: string
  createdBy?: { _id?: string; firstName?: string; lastName?: string; email?: string }
  client?: { _id?: string; firstName?: string; lastName?: string; email?: string }
  teamMembers?: Array<{ memberId?: any }>
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
    user?: { _id?: string; firstName?: string; lastName?: string; email?: string; avatar?: string }
    firstName?: string
    lastName?: string
    email?: string
    hourlyRate?: number
  }>
}

type StandupLiveProjectDetail = {
  summary: StandupProjectSummary
  projectTasks: TaskApiItem[]
  sprint?: SprintApiItem
  projectRecord?: ProjectApiItem
  teamResponse?: TeamApiResponse
}

const normalizeStatus = (status?: string): StandupProjectStatus => {
  if (status === 'on_hold' || status === 'planning' || status === 'completed' || status === 'active') {
    return status
  }
  return 'active'
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

const buildMockFallbackSummary = (projectId: string) => {
  const mock = getStandupProjectById(projectId) || getStandupProjects()[0]
  return mock
}

const fetchJson = async <T,>(url: string, signal?: AbortSignal): Promise<T | null> => {
  try {
    const response = await fetch(url, { signal, cache: 'no-store' })
    if (!response.ok) return null
    return await response.json() as T
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    return null
  }
}

const mapProjectSummary = (project: ProjectApiItem): StandupProjectSummary => {
  const teamMembers = Array.isArray(project.teamMembers)
    ? project.teamMembers.map(normalizeMember).filter(Boolean) as StandupMember[]
    : []

  const progressPercent = project.progress?.completionPercentage ?? 0
  const totalTasks = project.progress?.totalTasks ?? 0
  const tasksCompleted = project.progress?.tasksCompleted ?? 0

  return {
    _id: project._id,
    name: sanitizeString(project.name, 'Untitled Project'),
    status: normalizeStatus(project.status),
    sprintName: project.settings?.currentSprintName || project.settings?.sprintName,
    teamMembers,
    progressPercent,
    lastStandupAt: project.updatedAt || new Date().toISOString(),
    summary: sanitizeString(project.description, `${totalTasks} tasks tracked, ${tasksCompleted} completed.`),
    meetings: [],
    memberProgress: [],
    timeline: []
  }
}

const mapSprint = (sprint: SprintApiItem): StandupMeeting => ({
  _id: sprint._id,
  title: sprint.name || 'Sprint',
  date: sprint.startDate || new Date().toISOString(),
  time: '09:00 AM',
  durationMinutes: 15,
  participants: [],
  status: (sprint.status === 'in_progress' ? 'in_progress' : sprint.status === 'completed' ? 'completed' : 'scheduled') as StandupMeetingStatus,
  notes: sprint.goal || sprint.description
})

const mapTask = (task: TaskApiItem) => ({
  _id: task._id,
  title: task.title || 'Untitled task',
  status: task.status || 'todo',
  priority: task.priority || 'medium',
  displayId: task.displayId || (task.taskNumber ? `#${task.taskNumber}` : ''),
  assignedTo: Array.isArray(task.assignedTo)
    ? task.assignedTo.map((entry) => normalizeMember(entry)).filter(Boolean) as StandupMember[]
    : []
})

export async function fetchStandupProjectSummaries(signal?: AbortSignal): Promise<StandupProjectSummary[]> {
  const live = await fetchJson<{ success?: boolean; data?: ProjectApiItem[]; projects?: ProjectApiItem[] }>('/api/projects?limit=1000&page=1', signal)
  const liveProjects = Array.isArray(live?.data) ? live!.data : Array.isArray(live?.projects) ? live!.projects : []

  const liveSummaries = liveProjects.map(mapProjectSummary)
  const mockProjects = getStandupProjects()
  const mockExtras = mockProjects.filter((mockProject) => !liveSummaries.some((liveProject) => liveProject._id === mockProject._id || liveProject.name === mockProject.name))

  if (liveSummaries.length === 0) {
    return mockProjects
  }

  return [...liveSummaries, ...mockExtras]
}

export async function fetchStandupProjectDetail(projectId: string, signal?: AbortSignal): Promise<StandupLiveProjectDetail> {
  const [projectResponse, teamResponse, tasksResponse, sprintsResponse] = await Promise.all([
    fetchJson<{ success?: boolean; data?: ProjectApiItem }>(`/api/projects/${projectId}`, signal),
    fetchJson<{ success?: boolean; data?: TeamApiResponse }>(`/api/projects/${projectId}/team`, signal),
    fetchJson<{ success?: boolean; data?: TaskApiItem[] }>(`/api/projects/${projectId}/tasks`, signal),
    fetchJson<{ success?: boolean; data?: SprintApiItem[] | SprintApiItem }>(`/api/sprints?project=${projectId}&limit=20`, signal)
  ])

  const projectRecord = projectResponse?.data
  const teamData = teamResponse?.data
  const tasksData = Array.isArray(tasksResponse?.data) ? tasksResponse!.data : []
  const sprintData = Array.isArray(sprintsResponse?.data)
    ? sprintsResponse!.data[0]
    : sprintsResponse?.data ?? undefined

  const mockFallback = buildMockFallbackSummary(projectId)
  const liveProject = projectRecord ? mapProjectSummary(projectRecord) : mockFallback
  const liveTeamMembers = Array.isArray(teamData?.teamMembers)
    ? teamData!.teamMembers.map(normalizeMember).filter(Boolean) as StandupMember[]
    : liveProject.teamMembers

  const taskCards = tasksData.map(mapTask)
  const totalTasks = taskCards.length
  const completedTasks = taskCards.filter((task) => task.status === 'done' || task.status === 'completed').length
  const completionPercent = projectRecord?.progress?.completionPercentage ?? liveProject.progressPercent

  const membersForProgress = liveTeamMembers.length > 0 ? liveTeamMembers : liveProject.teamMembers
  const fallbackProgress = mockFallback.memberProgress

  const memberProgress: StandupMemberProgress[] = membersForProgress.map((member, index) => {
    const fallback = fallbackProgress[index % Math.max(fallbackProgress.length, 1)]
    const assignedTasks = totalTasks > 0 ? Math.max(1, Math.round(totalTasks / Math.max(membersForProgress.length, 1))) : (fallback?.assignedTasks || 0)
    const completedEstimate = totalTasks > 0 ? Math.min(assignedTasks, Math.round(completedTasks / Math.max(membersForProgress.length, 1))) : (fallback?.completedTasks || 0)
    const blockedTasks = totalTasks > 0 && index === 0 && completedTasks < totalTasks ? 1 : (fallback?.blockedTasks || 0)

    return {
      ...member,
      assignedTasks,
      completedTasks: completedEstimate,
      blockedTasks,
      currentTask: taskCards[index % Math.max(taskCards.length, 1)]?.title || fallback?.currentTask || 'Review standup updates',
      progressPercent: Math.max(0, Math.min(100, completionPercent - index * 4)),
      status: blockedTasks > 0 ? 'blocked' : completionPercent < 50 && index === 0 ? 'needs_attention' : 'on_track'
    }
  })

  const liveSprint = sprintData ? mapSprint(sprintData) : mockFallback.meetings[0]
  const meetings: StandupMeeting[] = sprintData
    ? [
        {
          ...liveSprint,
          participants: membersForProgress.slice(0, Math.min(membersForProgress.length, 4))
        },
        ...mockFallback.meetings.slice(0, 2)
      ]
    : mockFallback.meetings

  const timeline: StandupTimelineItem[] = [
    ...mockFallback.timeline.slice(0, 2),
    ...(taskCards.slice(0, 3).map((task, index) => ({
      _id: `${projectId}-task-${index}`,
      type: index === 0 ? 'assignment' : 'progress',
      title: task.title,
      description: `${task.displayId || 'Task'} is ${task.status}`,
      createdAt: new Date(Date.now() - index * 1000 * 60 * 18).toISOString(),
      author: membersForProgress[index % Math.max(membersForProgress.length, 1)] || membersForProgress[0]
    })) as StandupTimelineItem[])
  ]

  return {
    summary: {
      ...liveProject,
      sprintName: liveProject.sprintName || sprintData?.name || mockFallback.sprintName,
      lastStandupAt: liveProject.lastStandupAt || mockFallback.lastStandupAt,
      summary: liveProject.summary || mockFallback.summary,
      meetings,
      memberProgress,
      timeline
    },
    projectTasks: taskCards,
    sprint: sprintData,
    projectRecord,
    teamResponse: teamData
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