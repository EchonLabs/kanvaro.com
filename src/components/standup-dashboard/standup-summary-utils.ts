import type { StandupMember, StandupMeeting, StandupScheduleComment, StandupTimelogItem } from './standup-dashboard-types'
import { formatLoggedHours, roundLoggedHours } from './standup-timelog-utils'
import { getStandupDateKey } from './standup-date-utils'

type SummaryTask = {
  _id: string
  title: string
  status?: string
  displayId?: string
  dueDate?: string | Date
  estimatedHours?: number
  completedAt?: string | Date
  actualHours?: number
  comments?: Array<{
    content?: string
    createdAt?: string | Date
    author?: { firstName?: string; lastName?: string; email?: string }
  }>
}

type SummaryActivity = {
  taskId: string
  taskTitle: string
  oldValue?: string
  newValue?: string
  createdAt?: string | Date
  userName?: string
}

type BuildStandupSummaryParams = {
  meeting: StandupMeeting
  projectName: string
  sprintName?: string
  sprintStatus?: string
  sprintTasks: SummaryTask[]
  allTasks: SummaryTask[]
  participants: StandupMember[]
  timelogs: StandupTimelogItem[]
  taskActivities: SummaryActivity[]
  taskComments: SummaryTask[]
  standupComments: StandupScheduleComment[]
  delayReasons?: Record<string, string>
}

type CommentEntry = {
  authorName: string
  reason: string
  createdAt?: string | Date
  taskTitle?: string
  source: 'task' | 'standup' | 'note'
}

const normalizeText = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

const normalizeStatus = (value?: string) => (value || '').trim().toLowerCase()

const formatHourValue = (value: number) => {
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}h`
}

const formatTaskLabel = (task: SummaryTask) => `${task.displayId ? `${task.displayId} · ` : ''}${task.title}`

const formatStatusLabel = (value?: string) => {
  const normalized = (value || '').trim().replace(/_/g, ' ')
  if (!normalized) return 'unknown'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

const allowedTaskStatuses = new Set(['backlog', 'todo', 'to do', 'inprogress', 'in progress', 'inreview', 'in review', 'testing', 'done'])

const normalizeTaskStatus = (value?: string) => {
  const normalized = (value || '').trim().toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ')
  if (normalized === 'to do') return 'todo'
  if (normalized === 'in progress') return 'inprogress'
  if (normalized === 'in review') return 'inreview'
  return normalized
}

const formatTaskStatusLabel = (value: string) => {
  switch (value) {
    case 'backlog':
      return 'Backlog'
    case 'todo':
      return 'ToDo'
    case 'inprogress':
      return 'InProgress'
    case 'inreview':
      return 'InReview'
    case 'testing':
      return 'Testing'
    case 'done':
      return 'Done'
    default:
      return value
  }
}

const formatGmt530Time = (value?: string | Date) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const offsetMinutes = 330
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000)
  const hours = shifted.getUTCHours()
  const minutes = shifted.getUTCMinutes()
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  const minuteLabel = String(minutes).padStart(2, '0')

  return `${hour12}:${minuteLabel} ${period} GMT +5:30`
}

const formatDateKeyLabel = (value?: string | Date) => {
  const dateKey = getStandupDateKey(value)
  if (!dateKey) return 'an unknown date'
  return dateKey
}

const formatDayDifference = (days: number) => {
  const absoluteDays = Math.abs(days)
  if (absoluteDays === 0) return 'today'
  if (absoluteDays === 1) return days > 0 ? 'tomorrow' : '1 day ago'
  return days > 0 ? `in ${absoluteDays} days` : `${absoluteDays} days ago`
}

const buildCommentEntries = (params: BuildStandupSummaryParams): CommentEntry[] => {
  const entries: CommentEntry[] = []

  params.taskComments.forEach((task) => {
    const sortedComments = Array.isArray(task.comments)
      ? [...task.comments].sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime())
      : []

    sortedComments.forEach((comment) => {
      if (!comment.content || !comment.content.trim()) return
      const authorName = comment.author
        ? `${comment.author.firstName || ''} ${comment.author.lastName || ''}`.trim() || comment.author.email || 'Unknown member'
        : 'Unknown member'

      entries.push({
        authorName,
        reason: comment.content.trim(),
        createdAt: comment.createdAt,
        taskTitle: formatTaskLabel(task),
        source: 'task'
      })
    })
  })

  params.standupComments.forEach((comment) => {
    if (!comment.reason || !comment.reason.trim()) return

    entries.push({
      authorName: comment.authorName,
      reason: comment.reason.trim(),
      createdAt: comment.createdAt,
      taskTitle: comment.taskTitle,
      source: comment.taskTitle ? 'standup' : 'note'
    })
  })

  if (params.meeting.notes && params.meeting.notes.trim()) {
    entries.push({
      authorName: params.meeting.facilitator ? `${params.meeting.facilitator.firstName} ${params.meeting.facilitator.lastName}`.trim() : 'Standup notes',
      reason: params.meeting.notes.trim(),
      createdAt: params.meeting.date,
      source: 'note'
    })
  }

  const seen = new Set<string>()
  return entries
    .filter((entry) => {
      const fingerprint = normalizeText(`${entry.authorName}|${entry.taskTitle || ''}|${entry.reason}`)
      if (seen.has(fingerprint)) return false
      seen.add(fingerprint)
      return true
    })
    .sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime())
}

const groupByTheme = (entries: CommentEntry[]) => {
  const buckets = {
    blockers: [] as CommentEntry[],
    progress: [] as CommentEntry[],
    implementation: [] as CommentEntry[],
    coordination: [] as CommentEntry[],
    clarification: [] as CommentEntry[],
    general: [] as CommentEntry[]
  }

  entries.forEach((entry) => {
    const text = normalizeText(entry.reason)
    if (/\b(blocked?|blocker|stuck|waiting|dependency|issue|problem|hold|cannot|can't)\b/.test(text)) {
      buckets.blockers.push(entry)
      return
    }
    if (/\b(progress|started|continue|continuing|worked|done|completed|finished|implemented|shipped|updated|moved)\b/.test(text)) {
      buckets.progress.push(entry)
      return
    }
    if (/\b(implement|implementation|refactor|api|backend|frontend|bug|fix|patch|test|migration|deploy)\b/.test(text)) {
      buckets.implementation.push(entry)
      return
    }
    if (/\b(sync|coordination|handoff|align|follow[- ]?up|review|discuss|meet|confirm|timeline)\b/.test(text)) {
      buckets.coordination.push(entry)
      return
    }
    if (/\b(clarify|clarification|question|unclear|verify|why|how|should we)\b/.test(text)) {
      buckets.clarification.push(entry)
      return
    }
    buckets.general.push(entry)
  })

  return buckets
}

const buildTaskTransitionLines = (tasks: SummaryTask[], activities: SummaryActivity[], timelogs: StandupTimelogItem[]) => {
  const lines: string[] = []

  const activitiesByTask = activities.reduce((acc, activity) => {
    const list = acc.get(activity.taskId) || []
    list.push(activity)
    acc.set(activity.taskId, list)
    return acc
  }, new Map<string, SummaryActivity[]>())

  tasks.forEach((task) => {
    const taskActivities = (activitiesByTask.get(task._id) || [])
      .filter((activity) => activity.oldValue || activity.newValue)
      .sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime())

    if (taskActivities.length > 0) {
      taskActivities.forEach((activity) => {
        const fromStatus = normalizeTaskStatus(activity.oldValue)
        const toStatus = normalizeTaskStatus(activity.newValue)
        if (!allowedTaskStatuses.has(fromStatus) || !allowedTaskStatuses.has(toStatus) || fromStatus === toStatus) {
          return
        }

        const timeLabel = formatGmt530Time(activity.createdAt)
        if (!timeLabel) return

        const actorLabel = activity.userName ? ` by ${activity.userName}` : ''
        const taskLabel = formatTaskLabel(task)
        lines.push(`${timeLabel} · ${taskLabel} · ${formatTaskStatusLabel(fromStatus)} → ${formatTaskStatusLabel(toStatus)}${actorLabel}`)
      })
      return
    }
  })

  if (lines.length === 0) {
    lines.push('No task status changes were recorded for this standup day.')
  }

  return lines
}

const buildSprintHealthLines = (tasks: SummaryTask[], sprintName?: string, sprintStatus?: string) => {
  const completed = tasks.filter((task) => ['done', 'completed'].includes(normalizeStatus(task.status))).length
  const inProgress = tasks.filter((task) => normalizeStatus(task.status) === 'in_progress').length
  const review = tasks.filter((task) => normalizeStatus(task.status) === 'review').length
  const remaining = Math.max(0, tasks.length - completed - inProgress - review)

  const lines = [
    `This sprint currently contains ${tasks.length} tasks.`,
    `Completed: ${completed}. In progress: ${inProgress}. Review: ${review}. Remaining: ${remaining}.`
  ]

  if (sprintName) {
    lines.unshift(`Current sprint: ${sprintName}${sprintStatus ? ` (${formatStatusLabel(sprintStatus)})` : ''}.`)
  }

  return lines
}

const buildLoggedHourMaps = (timelogs: StandupTimelogItem[]) => {
  const minutesByMember = new Map<string, number>()
  const minutesByTask = new Map<string, number>()

  timelogs.forEach((log) => {
    if (log.userId) {
      minutesByMember.set(log.userId, (minutesByMember.get(log.userId) || 0) + log.duration)
    }

    if (log.taskId) {
      minutesByTask.set(log.taskId, (minutesByTask.get(log.taskId) || 0) + log.duration)
    }
  })

  return { minutesByMember, minutesByTask }
}

const buildMemberHourLines = (participants: StandupMember[], minutesByMember: Map<string, number>) => {
  return participants.map((member) => {
    const memberName = `${member.firstName} ${member.lastName}`.trim()
    return `${memberName} logged ${formatLoggedHours(minutesByMember.get(member._id) || 0)} during this standup day.`
  })
}

const buildEstimationAnalysisLines = (tasks: SummaryTask[], minutesByTask: Map<string, number>, delayReasons?: Record<string, string>) => {
  const lines: string[] = []

  tasks.forEach((task) => {
    const estimatedHours = typeof task.estimatedHours === 'number' && task.estimatedHours > 0 ? task.estimatedHours : null
    const loggedMinutes = minutesByTask.get(task._id) || 0
    const loggedHours = roundLoggedHours(loggedMinutes)
    const delayReason = typeof delayReasons?.[task._id] === 'string' ? delayReasons[task._id].trim() : ''

    if (estimatedHours === null) {
      if (loggedHours > 0) {
        lines.push(`${formatTaskLabel(task)} has ${formatHourValue(loggedHours)} logged but no estimate yet. Add an estimate so scope drift can be tracked.`)
      } else {
        lines.push(`${formatTaskLabel(task)} has no estimate yet. Add one before more work continues so progress can be compared against a target.`)
      }
      return
    }

    if (loggedHours <= 0) {
      lines.push(`${formatTaskLabel(task)} has a ${formatHourValue(estimatedHours)} estimate and no time logged on this standup day.`)
      return
    }

    const effortRatio = loggedHours / estimatedHours

    if (effortRatio >= 1.5) {
      lines.push(`${formatTaskLabel(task)} is overdue. Logged ${formatHourValue(loggedHours)} against a ${formatHourValue(estimatedHours)} estimate. It is far above estimate and should be reviewed.`)
      if (delayReason) {
        lines.push(`Reason for delay: ${delayReason}`)
      }
      return
    }

    if (effortRatio > 1) {
      lines.push(`${formatTaskLabel(task)} is overdue. Logged ${formatHourValue(loggedHours)} against a ${formatHourValue(estimatedHours)} estimate. It is above estimate and may need attention.`)
      if (delayReason) {
        lines.push(`Reason for delay: ${delayReason}`)
      }
      return
    }

    if (effortRatio >= 0.85) {
      lines.push(`${formatTaskLabel(task)} is approaching its ${formatHourValue(estimatedHours)} estimate with ${formatHourValue(loggedHours)} already logged.`)
      return
    }

    lines.push(`${formatTaskLabel(task)} is progressing within its ${formatHourValue(estimatedHours)} estimate with ${formatHourValue(loggedHours)} logged so far.`)
  })

  if (lines.length === 0) {
    lines.push('No task estimates were available for analysis on this standup day.')
  }

  return lines
}

const buildDueDateAnalysisLines = (tasks: SummaryTask[], standupDate: string | Date) => {
  const dateKey = getStandupDateKey(standupDate)
  if (!dateKey) {
    return ['No valid standup date was available for due date analysis.']
  }

  const standupTime = Date.parse(`${dateKey}T00:00:00.000Z`)
  const lines: string[] = []

  tasks.forEach((task) => {
    if (!task.dueDate) {
      lines.push(`${formatTaskLabel(task)} does not have a due date yet. Add one so delivery risk can be tracked.`)
      return
    }

    const dueKey = getStandupDateKey(task.dueDate)
    if (!dueKey) return

    const dueTime = Date.parse(`${dueKey}T00:00:00.000Z`)
    const completedKey = task.completedAt ? getStandupDateKey(task.completedAt) : null
    const completedTime = completedKey ? Date.parse(`${completedKey}T00:00:00.000Z`) : null
    const status = normalizeStatus(task.status)

    if (completedTime !== null && completedTime < dueTime) {
      lines.push(`${formatTaskLabel(task)} was completed before its due date.`)
      return
    }

    if (dueTime < standupTime && status !== 'done' && status !== 'completed') {
      const statusLabel = formatStatusLabel(status)
      const overdueDays = Math.max(1, Math.round((standupTime - dueTime) / (1000 * 60 * 60 * 24)))
      lines.push(`${formatTaskLabel(task)} is overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'} and still ${statusLabel.toLowerCase()}.`)
      return
    }

    const daysUntilDue = Math.round((dueTime - standupTime) / (1000 * 60 * 60 * 24))
    if (daysUntilDue === 0) {
      lines.push(`${formatTaskLabel(task)} is due today.`)
      return
    }

    if (daysUntilDue === 1) {
      lines.push(`${formatTaskLabel(task)} is due tomorrow.`)
      return
    }

    if (daysUntilDue > 1 && daysUntilDue <= 3) {
      lines.push(`${formatTaskLabel(task)} is due in ${daysUntilDue} days.`)
    }
  })

  if (lines.length === 0) {
    lines.push('No overdue or near-term due date signals were recorded for this standup day.')
  }

  return lines
}

export const buildStandupSummaryMarkdown = (params: BuildStandupSummaryParams) => {
  const dateKey = getStandupDateKey(params.meeting.actualDate || params.meeting.date) || 'Unknown date'
  const { minutesByMember, minutesByTask } = buildLoggedHourMaps(params.timelogs)
  const totalLoggedMinutes = params.timelogs.reduce((sum, log) => sum + log.duration, 0)
  const sprintTasks = params.sprintTasks.length > 0 ? params.sprintTasks : params.allTasks
  const analysisTasks = sprintTasks.length > 0 ? sprintTasks : params.allTasks
  const commentEntries = groupByTheme(buildCommentEntries(params))

  const overviewLines = [
    `Date: ${dateKey}`,
    `Project: ${params.projectName}`,
    `Participants: ${params.participants.length}`,
    `Tracked time: ${formatLoggedHours(totalLoggedMinutes)}`,
    params.sprintName ? `Sprint: ${params.sprintName}${params.sprintStatus ? ` (${formatStatusLabel(params.sprintStatus)})` : ''}` : ''
  ].filter(Boolean)

  const discussionSections = [
    ['Blockers Discussed', commentEntries.blockers],
    ['Progress Updates', commentEntries.progress],
    ['Implementation Notes', commentEntries.implementation],
    ['Coordination Discussions', commentEntries.coordination],
    ['Technical Clarifications', commentEntries.clarification],
    ['Additional Context', commentEntries.general]
  ]

  const discussionLines = discussionSections.flatMap(([title, entries]) => {
    const rows = entries as CommentEntry[]
    if (rows.length === 0) return []

    return [title as string, ...rows.slice(0, 5).map((entry) => {
      const timeLabel = formatGmt530Time(entry.createdAt)
      const taskLabel = entry.taskTitle ? ` on ${entry.taskTitle}` : ''
      const prefix = entry.source === 'note' ? 'Standup notes' : entry.authorName
      return `${timeLabel ? `${timeLabel} ` : ''}${prefix}${taskLabel}: ${entry.reason}`
    })]
  })

  if (discussionLines.length === 0) {
    discussionLines.push('No task comments, standup comments, or notes were recorded for this standup day.')
  }

  return [
    `Standup Summary: ${params.meeting.title}`,
    ...overviewLines,
    '',
    'Sprint Health',
    ...buildSprintHealthLines(sprintTasks, params.sprintName, params.sprintStatus),
    '',
    'Team Time',
    ...buildMemberHourLines(params.participants, minutesByMember),
    '',
    'Task Changes',
    ...buildTaskTransitionLines(analysisTasks, params.taskActivities, params.timelogs),
    '',
    'Estimation Check',
    ...buildEstimationAnalysisLines(analysisTasks, minutesByTask, params.delayReasons),
    '',
    'Due Date Watch',
    ...buildDueDateAnalysisLines(analysisTasks, params.meeting.actualDate || params.meeting.date),
    '',
    'Discussion Notes',
    ...discussionLines,
    '',
    'This report is compiled from real standup notes, task comments, task transitions, and same-day time logs only.'
  ].join('\n\n')
}
