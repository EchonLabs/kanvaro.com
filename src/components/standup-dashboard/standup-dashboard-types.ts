export type StandupProjectStatus = 'planning' | 'active' | 'completed' | 'on_hold'
export type StandupMeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'missed'
export type StandupMemberStatus = 'on_track' | 'needs_attention' | 'blocked'
export type StandupPriority = 'low' | 'medium' | 'high' | 'critical'

export interface StandupMember {
  _id: string
  firstName: string
  lastName: string
  email: string
  role: string
  avatar?: string
}

export interface StandupMeeting {
  _id: string
  title: string
  date: string
  time: string
  durationMinutes: number
  participants: StandupMember[]
  status: StandupMeetingStatus
  notes?: string
  facilitator?: StandupMember
  createdBy?: StandupMember
  actualDate?: string
  location?: string
  meetingLink?: string
  assignments?: StandupTaskAssignment[]
  comments?: StandupScheduleComment[]
  summary?: string
}

export interface StandupTaskAssignment {
  memberId: string
  memberName: string
  taskId: string
  taskTitle: string
  status?: string
  durationMinutes?: number
}

export interface StandupScheduleComment {
  _id: string
  authorName: string
  memberId?: string
  reason: string
  createdAt: string
}

export interface StandupTimelogItem {
  _id: string
  userId: string
  userName: string
  taskTitle?: string
  projectName: string
  startTime: string
  endTime?: string
  duration: number
  description: string
  isBillable: boolean
  status: string
}

export interface StandupScheduleMemberSummary extends StandupMember {
  assignedTasks: StandupTaskAssignment[]
  completedTasks: number
  blockedTasks: number
  timeLoggedMinutes: number
  notes: string[]
  currentTask: string
  progressPercent: number
  status: StandupMemberStatus
}

export interface StandupScheduleDetail {
  project: StandupProjectSummary
  meeting: StandupMeeting
  pastMeetings: StandupMeeting[]
  memberSummaries: StandupScheduleMemberSummary[]
  timelogs: StandupTimelogItem[]
  projectTasks: Array<{
    _id: string
    title: string
    status?: string
    priority?: string
    displayId?: string
    assignedTo?: Array<{
      _id?: string
      user?: { _id?: string }
    }>
  }>
}

export interface StandupMemberProgress extends StandupMember {
  assignedTasks: number
  completedTasks: number
  blockedTasks: number
  currentTask: string
  progressPercent: number
  status: StandupMemberStatus
}

export interface StandupTimelineItem {
  _id: string
  type: 'update' | 'assignment' | 'blocker' | 'progress' | 'note'
  title: string
  description: string
  createdAt: string
  author: StandupMember
  projectTask?: string
}

export interface StandupProjectSummary {
  _id: string
  name: string
  status: StandupProjectStatus
  sprintName?: string
  teamMembers: StandupMember[]
  progressPercent: number
  lastStandupAt: string
  summary: string
  meetings: StandupMeeting[]
  memberProgress: StandupMemberProgress[]
  timeline: StandupTimelineItem[]
}

export interface StandupAssignmentPayload {
  memberId: string
  taskTitle: string
  priority: StandupPriority
  dueDate: string
  notes: string
}