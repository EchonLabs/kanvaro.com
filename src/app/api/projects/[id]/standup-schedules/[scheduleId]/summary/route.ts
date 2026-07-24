import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import '@/models/registry'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
import { TaskActivity } from '@/models/TaskActivity'
import { StandupSchedule } from '@/models/StandupSchedule'
import { StandupSummary } from '@/models/StandupSummary'
import { TimeEntry } from '@/models/TimeEntry'
import { Sprint } from '@/models/Sprint'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { buildStandupSummaryMarkdown } from '@/components/standup-dashboard/standup-summary-utils'
import { filterStandupTimelogs } from '@/components/standup-dashboard/standup-timelog-utils'
import { getStandupDayBounds } from '@/components/standup-dashboard/standup-date-utils'

const isValidObjectIdString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0 && mongoose.Types.ObjectId.isValid(value.trim())
}

const buildProjectContext = async (projectId: string, userId: string, organizationId: string): Promise<
  | { project: any; teamMemberIds: Set<string> }
  | { error: string; status: 404 | 403 }
> => {
  const project = await Project.findById(projectId).select('organization teamMembers')
  if (!project) {
    return { error: 'Project not found', status: 404 as const }
  }

  if (project.organization?.toString() !== organizationId?.toString()) {
    return { error: 'Access denied to project', status: 403 as const }
  }

  const canAccessProject = await PermissionService.canAccessProject(userId, projectId)
  if (!canAccessProject) {
    return { error: 'Access denied to project', status: 403 as const }
  }

  const teamMemberIds = new Set<string>(
    (project.teamMembers || [])
      .map((member: any) => member?.memberId?.toString?.())
      .filter((value: string | undefined): value is string => typeof value === 'string' && value.length > 0)
  )

  return { project, teamMemberIds }
}

type StandupSummarySchedule = {
  _id: any
  title?: string
  scheduledDate: Date
  actualDate?: Date
  time?: string
  durationMinutes?: number
  status?: string
  facilitator?: any
  createdBy?: any
  participants?: any[]
  notes?: string
  comments?: any[]
  assignments?: any[]
}

type StandupSummaryProject = {
  _id: any
  name?: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; scheduleId: string } }
) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user } = authResult
    const projectContext = await buildProjectContext(params.id, user.id, user.organization)
    if ('error' in projectContext) {
      return NextResponse.json({ error: projectContext.error }, { status: projectContext.status })
    }

    const summary = await StandupSummary.findOne({ standupScheduleId: params.scheduleId })

    return NextResponse.json({ success: true, data: summary })
  } catch (error) {
    console.error('Get standup summary error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; scheduleId: string } }
) {
  try {
    await connectDB()

    const body = await request.json().catch(() => ({} as any))

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user } = authResult
    const projectContext = await buildProjectContext(params.id, user.id, user.organization)
    if ('error' in projectContext) {
      return NextResponse.json({ error: projectContext.error }, { status: projectContext.status })
    }

    const schedule = await StandupSchedule.findOne({
      _id: params.scheduleId,
      project: params.id,
      organization: user.organization,
      archived: false
    })
      .populate('participants', 'firstName lastName email avatar role customRole')
      .populate('facilitator', 'firstName lastName email avatar role customRole')
      .populate('createdBy', 'firstName lastName email avatar role customRole')
      .lean<StandupSummarySchedule>()

    if (!schedule) {
      return NextResponse.json({ error: 'Standup schedule not found' }, { status: 404 })
    }

    const summaryDate = schedule.status === 'completed' || schedule.status === 'missed'
      ? (schedule.actualDate || schedule.scheduledDate)
      : schedule.scheduledDate || schedule.actualDate
    if (!summaryDate) {
      return NextResponse.json({ error: 'Standup schedule date is invalid' }, { status: 400 })
    }

    const dayBounds = getStandupDayBounds(summaryDate)
    if (!dayBounds) {
      return NextResponse.json({ error: 'Standup schedule date is invalid' }, { status: 400 })
    }

    const [projectRecord, projectTasks, timeEntries, taskActivities, sprintDocs] = await Promise.all([
      Project.findById(params.id).select('name').lean<StandupSummaryProject>(),
      Task.find({ project: params.id, organization: user.organization, archived: false })
        .populate('comments.author', 'firstName lastName email avatar role customRole')
        .select('_id title status priority displayId taskNumber assignedTo sprint completedAt dueDate estimatedHours actualHours comments')
        .lean(),
      TimeEntry.find({
        project: params.id,
        organization: user.organization,
        startTime: { $gte: dayBounds.start, $lte: dayBounds.end }
      }).populate('user', 'firstName lastName email avatar role').populate('task', 'title status displayId').lean(),
      TaskActivity.find({
        organization: user.organization,
        createdAt: { $gte: dayBounds.start, $lte: dayBounds.end }
      }).populate('user', 'firstName lastName email avatar role').lean(),
      Sprint.find({ project: params.id, organization: user.organization, archived: false }).select('_id name status startDate endDate tasks').lean()
    ])

    const participantIds = new Set((Array.isArray(schedule.participants) ? schedule.participants : []).map((member: any) => String(member._id || member)))
    const scopedMemberIds = new Set<string>([...Array.from(projectContext.teamMemberIds), ...Array.from(participantIds)])
    const currentSprint = sprintDocs.find((sprint: any) => sprint.status === 'active')
      || sprintDocs.find((sprint: any) => sprint.status === 'planning')
      || sprintDocs[0]

    const sprintTaskIds = new Set<string>(Array.isArray(currentSprint?.tasks) ? currentSprint.tasks.map((taskId: any) => String(taskId)) : [])

    const taskCards = (projectTasks || []).map((task: any) => ({
      _id: String(task._id),
      title: task.title || 'Untitled task',
      status: task.status,
      displayId: task.displayId,
      dueDate: task.dueDate,
      estimatedHours: task.estimatedHours,
      completedAt: task.completedAt,
      actualHours: task.actualHours,
      comments: Array.isArray(task.comments) ? task.comments.map((comment: any) => ({
        content: comment.content,
        createdAt: comment.createdAt,
        author: comment.author ? {
          firstName: comment.author.firstName,
          lastName: comment.author.lastName,
          email: comment.author.email
        } : undefined
      })) : [],
      assignedTo: Array.isArray(task.assignedTo) ? task.assignedTo : []
    }))

    const projectTaskIds = new Set<string>(taskCards.map((task) => task._id))
    const sprintTasks = currentSprint
      ? taskCards.filter((task) => sprintTaskIds.has(task._id))
      : taskCards

    const standupTimelogs = filterStandupTimelogs({
      timelogs: (timeEntries || []).map((entry: any) => ({
        _id: String(entry._id),
        userId: String(entry.user?._id || entry.user || ''),
        userName: typeof entry.user === 'object' && entry.user
          ? `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim() || entry.user.email || 'Unknown member'
          : 'Unknown member',
        taskId: String(entry.task?._id || entry.task || ''),
        taskTitle: typeof entry.task === 'object' && entry.task ? entry.task.title || undefined : undefined,
        taskStatus: undefined,
        projectName: projectRecord?.name || 'Project',
        startTime: entry.startTime,
        endTime: entry.endTime,
        duration: entry.duration || 0,
        description: entry.description || '',
        isBillable: !!entry.isBillable,
        status: entry.status || 'completed'
      })),
      standupDate: schedule.actualDate || schedule.scheduledDate,
      memberIds: Array.from(scopedMemberIds),
      requireTaskId: false
    })

    const timelogs = standupTimelogs.filter((entry) => entry.userId)

    const activities = (taskActivities || []).map((activity: any) => ({
      taskId: String(activity.task?._id || activity.task || ''),
      taskTitle: taskCards.find((task) => task._id === String(activity.task?._id || activity.task || ''))?.title || 'Untitled task',
      oldValue: activity.oldValue,
      newValue: activity.newValue,
      createdAt: activity.createdAt,
      userName: activity.user ? `${activity.user.firstName || ''} ${activity.user.lastName || ''}`.trim() || activity.user.email || 'Unknown member' : 'Unknown member'
    })).filter((activity: any) => activity.taskId && projectTaskIds.has(activity.taskId))

    const markdownSummary = buildStandupSummaryMarkdown({
      meeting: {
        _id: String(schedule._id),
        title: schedule.title || 'Daily Standup',
        date: summaryDate.toISOString(),
        time: schedule.time || '09:00',
        durationMinutes: schedule.durationMinutes || 15,
        participants: Array.isArray(schedule.participants) ? schedule.participants : [],
        status: (schedule.status as any) || 'scheduled',
        notes: schedule.notes,
        actualDate: schedule.status === 'completed' || schedule.status === 'missed'
          ? schedule.actualDate?.toISOString?.()
          : undefined,
        facilitator: schedule.facilitator,
        createdBy: schedule.createdBy,
        location: undefined,
        meetingLink: undefined,
        assignments: Array.isArray(schedule.assignments) ? schedule.assignments : [],
        comments: Array.isArray(schedule.comments) ? schedule.comments : [],
        summary: undefined
      },
      projectName: projectRecord?.name || 'Untitled Project',
      sprintName: currentSprint?.name,
      sprintStatus: currentSprint?.status,
      sprintTasks,
      allTasks: taskCards,
      participants: Array.isArray(schedule.participants) ? schedule.participants : [],
      timelogs,
      taskActivities: activities,
      taskComments: sprintTasks,
      standupComments: Array.isArray(schedule.comments) ? schedule.comments.map((comment: any) => ({
        _id: String(comment._id || ''),
        authorName: comment.authorName || 'Unknown member',
        memberId: comment.member?._id?.toString?.() || comment.member?.toString?.(),
        taskId: comment.task?._id?.toString?.() || comment.task?.toString?.(),
        taskTitle: comment.taskTitle || comment.task?.title,
        reason: comment.reason || '',
        createdAt: comment.createdAt || new Date().toISOString()
      })) : [],
      delayReasons: body?.delayReasons && typeof body.delayReasons === 'object'
        ? Object.fromEntries(Object.entries(body.delayReasons).map(([key, value]) => [key, typeof value === 'string' ? value : '']))
        : {}
    })

    // Database Restructuring Logic: Only ONE summary entry per standup schedule/day
    // Uses findOneAndUpdate with upsert to prevent race conditions or duplicates
    const savedSummary = await StandupSummary.findOneAndUpdate(
      { standupScheduleId: params.scheduleId },
      {
        projectId: params.id,
        generatedSummary: markdownSummary,
        delayReasons: body?.delayReasons && typeof body.delayReasons === 'object' ? body.delayReasons : {},
        generatedDate: new Date()
      },
      { new: true, upsert: true }
    )

    return NextResponse.json({ success: true, data: savedSummary })
  } catch (error) {
    console.error('Generate standup summary error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
