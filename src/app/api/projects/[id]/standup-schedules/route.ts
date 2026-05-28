import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import '@/models/registry'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
import { StandupSchedule } from '@/models/StandupSchedule'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'

type IncomingAssignment = {
  member?: unknown
  memberId?: unknown
  task?: unknown
  taskId?: unknown
  taskTitle?: unknown
  taskStatus?: unknown
  status?: unknown
  durationMinutes?: unknown
  notes?: unknown
}

type IncomingComment = {
  author?: unknown
  authorId?: unknown
  authorName?: unknown
  member?: unknown
  memberId?: unknown
  reason?: unknown
  createdAt?: unknown
}

const isValidObjectIdString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0 && mongoose.Types.ObjectId.isValid(value.trim())
}

const buildScheduledDateTime = (scheduledDate?: Date | string, time?: string) => {
  if (!scheduledDate) return null
  const base = new Date(scheduledDate)
  if (Number.isNaN(base.getTime())) return null

  if (typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    const [hours, minutes] = time.split(':').map((v) => Number(v))
    base.setHours(hours, minutes, 0, 0)
  } else {
    // default to start of day
    base.setHours(0, 0, 0, 0)
  }

  return base
}

const markOverdueSchedulesCompleted = async (projectId: string, organizationId: string) => {
  const now = new Date()

  const candidates = await StandupSchedule.find({
    project: projectId,
    organization: organizationId,
    archived: false,
    status: { $in: ['scheduled', 'in_progress'] }
  })

  for (const sched of candidates) {
    const scheduledDateTime = buildScheduledDateTime(sched.scheduledDate, sched.time)
    if (scheduledDateTime && scheduledDateTime < now) {
      sched.status = 'completed'
      await sched.save()
    }
  }
}

const normalizeObjectIdList = (input: unknown): string[] => {
  if (!Array.isArray(input)) {
    return []
  }

  const ids = input
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => isValidObjectIdString(value))

  return Array.from(new Set(ids))
}

const normalizeAssignments = (
  input: unknown,
  tasksById: Map<string, { _id: string; title: string; status?: string }>,
  participantIds: Set<string>
) => {
  if (!Array.isArray(input)) {
    return { assignments: [], missingTaskIds: [] as string[] }
  }

  const missingTaskIds = new Set<string>()
  const assignments = input.reduce<Array<{
    member: mongoose.Types.ObjectId
    task: mongoose.Types.ObjectId
    taskTitle: string
    taskStatus?: string
    durationMinutes?: number
    notes?: string
  }>>((result, item: IncomingAssignment) => {
    const memberId = typeof item.memberId === 'string'
      ? item.memberId.trim()
      : typeof item.member === 'string'
        ? item.member.trim()
        : ''

    const taskId = typeof item.taskId === 'string'
      ? item.taskId.trim()
      : typeof item.task === 'string'
        ? item.task.trim()
        : ''

    if (!isValidObjectIdString(memberId) || !participantIds.has(memberId)) {
      return result
    }

    if (!isValidObjectIdString(taskId)) {
      return result
    }

    const task = tasksById.get(taskId)
    if (!task) {
      missingTaskIds.add(taskId)
      return result
    }

    const numericDuration = typeof item.durationMinutes === 'number'
      ? item.durationMinutes
      : typeof item.durationMinutes === 'string'
        ? Number(item.durationMinutes)
        : undefined

    const taskTitle = typeof item.taskTitle === 'string' && item.taskTitle.trim().length > 0
      ? item.taskTitle.trim()
      : task.title

    const taskStatus = typeof item.taskStatus === 'string' && item.taskStatus.trim().length > 0
      ? item.taskStatus.trim()
      : typeof item.status === 'string' && item.status.trim().length > 0
        ? item.status.trim()
        : task.status

    const notes = typeof item.notes === 'string' && item.notes.trim().length > 0
      ? item.notes.trim()
      : undefined

    result.push({
      member: new mongoose.Types.ObjectId(memberId),
      task: new mongoose.Types.ObjectId(taskId),
      taskTitle,
      taskStatus,
      durationMinutes: Number.isFinite(numericDuration as number) ? Number(numericDuration) : undefined,
      notes
    })

    return result
  }, [])

  return {
    assignments,
    missingTaskIds: Array.from(missingTaskIds)
  }
}

const normalizeComments = (input: unknown, fallbackAuthorId: string) => {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item: IncomingComment) => {
      const reason = typeof item.reason === 'string' ? item.reason.trim() : ''
      if (!reason) {
        return null
      }

      const authorId = typeof item.authorId === 'string'
        ? item.authorId.trim()
        : typeof item.author === 'string'
          ? item.author.trim()
          : fallbackAuthorId

      if (!isValidObjectIdString(authorId)) {
        return null
      }

      const memberId = typeof item.memberId === 'string'
        ? item.memberId.trim()
        : typeof item.member === 'string'
          ? item.member.trim()
          : undefined

      const createdAt = item.createdAt ? new Date(item.createdAt as string | number | Date) : new Date()

      return {
        author: new mongoose.Types.ObjectId(authorId),
        authorName: typeof item.authorName === 'string' && item.authorName.trim().length > 0 ? item.authorName.trim() : undefined,
        member: isValidObjectIdString(memberId) ? new mongoose.Types.ObjectId(memberId) : undefined,
        reason,
        createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt
      }
    })
    .filter((comment): comment is NonNullable<typeof comment> => comment !== null)
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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user } = authResult
    const projectId = params.id
    const projectContext = await buildProjectContext(projectId, user.id, user.organization)

    if ('error' in projectContext) {
      return NextResponse.json({ error: projectContext.error }, { status: projectContext.status })
    }

    await markOverdueSchedulesCompleted(projectId, user.organization)

    const { searchParams } = new URL(request.url)
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100)
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''
    const participant = searchParams.get('participant') || ''
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const countOnly = searchParams.get('countOnly') === 'true'

    const filters: Record<string, any> = {
      project: projectId,
      organization: user.organization,
      archived: false
    }

    if (status) {
      const statuses = status.split(',').map((item) => item.trim()).filter(Boolean)
      filters.status = statuses.length > 1 ? { $in: statuses } : statuses[0]
    }

    if (search) {
      filters.$or = [
        { title: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { summary: { $regex: search, $options: 'i' } }
      ]
    }

    if (isValidObjectIdString(participant)) {
      filters.participants = new mongoose.Types.ObjectId(participant)
    }

    if (from || to) {
      filters.scheduledDate = {}
      if (from) {
        filters.scheduledDate.$gte = new Date(from)
      }
      if (to) {
        filters.scheduledDate.$lte = new Date(to)
      }
    }

    if (countOnly) {
      const total = await StandupSchedule.countDocuments(filters)
      return NextResponse.json({ success: true, count: total })
    }

    const skip = (page - 1) * limit
    const schedules = await StandupSchedule.find(filters)
      .populate('participants', 'firstName lastName email avatar role')
      .populate('facilitator', 'firstName lastName email avatar role')
      .populate('createdBy', 'firstName lastName email avatar role')
      .populate('assignments.member', 'firstName lastName email avatar role')
      .populate('assignments.task', 'title status displayId priority')
      .populate('comments.author', 'firstName lastName email avatar role')
      .sort({ scheduledDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const total = await StandupSchedule.countDocuments(filters)

    return NextResponse.json({
      success: true,
      data: schedules,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Get standup schedules error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user } = authResult
    const projectId = params.id
    const projectContext = await buildProjectContext(projectId, user.id, user.organization)

    if ('error' in projectContext) {
      return NextResponse.json({ error: projectContext.error }, { status: projectContext.status })
    }

    const { project, teamMemberIds } = projectContext
    const body = await request.json().catch(() => null)

    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const scheduledDateRaw = body?.scheduledDate || body?.date
    const time = typeof body?.time === 'string' ? body.time.trim() : ''
    const durationMinutesRaw = body?.durationMinutes
    const status = typeof body?.status === 'string' ? body.status.trim() : 'scheduled'
    const facilitatorId = typeof body?.facilitator === 'string'
      ? body.facilitator.trim()
      : typeof body?.facilitatorId === 'string'
        ? body.facilitatorId.trim()
        : user.id

    if (!title || !scheduledDateRaw || !time || durationMinutesRaw === undefined || durationMinutesRaw === null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['scheduled', 'in_progress', 'completed', 'cancelled', 'missed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const scheduledDate = new Date(scheduledDateRaw)
    if (Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: 'Scheduled date is invalid' }, { status: 400 })
    }

    const durationMinutes = typeof durationMinutesRaw === 'number' ? durationMinutesRaw : Number(durationMinutesRaw)
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return NextResponse.json({ error: 'Duration must be a positive number' }, { status: 400 })
    }

    if (!isValidObjectIdString(facilitatorId)) {
      return NextResponse.json({ error: 'Facilitator is invalid' }, { status: 400 })
    }

    const participants: string[] = normalizeObjectIdList(body?.participants || body?.participantIds)
    const participantIds: string[] = participants.length > 0
      ? participants.filter((memberId) => teamMemberIds.size === 0 || teamMemberIds.has(memberId))
      : Array.from(teamMemberIds)

    const taskIds = Array.from(new Set(
      Array.isArray(body?.assignments)
        ? body.assignments
            .map((item: IncomingAssignment) => {
              const value = typeof item.taskId === 'string'
                ? item.taskId.trim()
                : typeof item.task === 'string'
                  ? item.task.trim()
                  : ''
              return isValidObjectIdString(value) ? value : ''
            })
            .filter(Boolean)
        : []
    ))

    const projectTasks = taskIds.length > 0
      ? await Task.find({
        _id: { $in: taskIds },
        project: projectId,
        organization: user.organization,
        archived: false
      }).select('_id title status')
      : []

    const tasksById = new Map(projectTasks.map((task: any) => [task._id.toString(), {
      _id: task._id.toString(),
      title: task.title,
      status: task.status
    }]))

    const missingTaskIds = taskIds.filter((taskId) => !tasksById.has(taskId))
    if (missingTaskIds.length > 0) {
      return NextResponse.json({ error: 'One or more assigned tasks were not found in this project' }, { status: 400 })
    }

    const { assignments, missingTaskIds: unexpectedTaskIds } = normalizeAssignments(
      body?.assignments,
      tasksById,
      new Set<string>(participantIds)
    )

    if (unexpectedTaskIds.length > 0) {
      return NextResponse.json({ error: 'One or more assigned tasks were not found in this project' }, { status: 400 })
    }

    const comments = normalizeComments(body?.comments, user.id)

    const actualDate = body?.actualDate ? new Date(body.actualDate) : undefined
    if (actualDate && Number.isNaN(actualDate.getTime())) {
      return NextResponse.json({ error: 'Actual date is invalid' }, { status: 400 })
    }

    const standupSchedule = new StandupSchedule({
      project: projectId,
      organization: user.organization,
      title,
      scheduledDate,
      time,
      durationMinutes,
      status,
      facilitator: facilitatorId,
      createdBy: user.id,
      participants: participantIds.map((memberId: string) => new mongoose.Types.ObjectId(memberId)),
      notes: typeof body?.notes === 'string' ? body.notes.trim() : undefined,
      summary: typeof body?.summary === 'string' ? body.summary.trim() : undefined,
      actualDate,
      location: typeof body?.location === 'string' ? body.location.trim() : undefined,
      meetingLink: typeof body?.meetingLink === 'string' ? body.meetingLink.trim() : undefined,
      assignments,
      comments
    })

    await standupSchedule.save()

    const populatedSchedule = await StandupSchedule.findById(standupSchedule._id)
      .populate('participants', 'firstName lastName email avatar role')
      .populate('facilitator', 'firstName lastName email avatar role')
      .populate('createdBy', 'firstName lastName email avatar role')
      .populate('assignments.member', 'firstName lastName email avatar role')
      .populate('assignments.task', 'title status displayId priority')
      .populate('comments.author', 'firstName lastName email avatar role')

    return NextResponse.json({ success: true, data: populatedSchedule }, { status: 201 })
  } catch (error) {
    console.error('Create standup schedule error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}