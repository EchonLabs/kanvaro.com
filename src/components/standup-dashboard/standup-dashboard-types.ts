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