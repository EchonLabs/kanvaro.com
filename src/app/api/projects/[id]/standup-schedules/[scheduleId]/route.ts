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

    const standupSchedule = await StandupSchedule.findOne({
      _id: params.scheduleId,
      project: params.id,
      organization: user.organization,
      archived: false
    })
      .populate('participants', 'firstName lastName email avatar role')
      .populate('facilitator', 'firstName lastName email avatar role')
      .populate('createdBy', 'firstName lastName email avatar role')
      .populate('assignments.member', 'firstName lastName email avatar role')
      .populate('assignments.task', 'title status displayId priority')
      .populate('comments.author', 'firstName lastName email avatar role')

    if (!standupSchedule) {
      return NextResponse.json({ error: 'Standup schedule not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: standupSchedule })
  } catch (error) {
    console.error('Get standup schedule error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
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

    const standupSchedule = await StandupSchedule.findOne({
      _id: params.scheduleId,
      project: params.id,
      organization: user.organization,
      archived: false
    })

    if (!standupSchedule) {
      return NextResponse.json({ error: 'Standup schedule not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)

    if (body?.title !== undefined) {
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      if (!title) {
        return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
      }
      standupSchedule.title = title
    }

    if (body?.scheduledDate !== undefined || body?.date !== undefined) {
      const scheduledDate = new Date(body.scheduledDate || body.date)
      if (Number.isNaN(scheduledDate.getTime())) {
        return NextResponse.json({ error: 'Scheduled date is invalid' }, { status: 400 })
      }
      standupSchedule.scheduledDate = scheduledDate
    }

    if (body?.time !== undefined) {
      const time = typeof body.time === 'string' ? body.time.trim() : ''
      if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
        return NextResponse.json({ error: 'Time must be in HH:mm format' }, { status: 400 })
      }
      standupSchedule.time = time
    }

    if (body?.durationMinutes !== undefined) {
      const durationMinutes = typeof body.durationMinutes === 'number' ? body.durationMinutes : Number(body.durationMinutes)
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        return NextResponse.json({ error: 'Duration must be a positive number' }, { status: 400 })
      }
      standupSchedule.durationMinutes = durationMinutes
    }

    if (body?.status !== undefined) {
      const status = typeof body.status === 'string' ? body.status.trim() : ''
      if (!['scheduled', 'in_progress', 'completed', 'cancelled', 'missed'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      standupSchedule.status = status as typeof standupSchedule.status
    }

    if (body?.facilitator !== undefined || body?.facilitatorId !== undefined) {
      const facilitatorId = typeof body.facilitator === 'string'
        ? body.facilitator.trim()
        : typeof body.facilitatorId === 'string'
          ? body.facilitatorId.trim()
          : ''

      if (!isValidObjectIdString(facilitatorId)) {
        return NextResponse.json({ error: 'Facilitator is invalid' }, { status: 400 })
      }

      standupSchedule.facilitator = new mongoose.Types.ObjectId(facilitatorId)
    }

    if (body?.participants !== undefined || body?.participantIds !== undefined) {
      const participants = normalizeObjectIdList(body.participants || body.participantIds)
      const participantIds = participants.length > 0
        ? participants.filter((memberId) => projectContext.teamMemberIds.size === 0 || projectContext.teamMemberIds.has(memberId))
        : Array.from(projectContext.teamMemberIds)

      standupSchedule.participants = participantIds.map((memberId: string) => new mongoose.Types.ObjectId(memberId))
    }

    if (body?.assignments !== undefined) {
      const participantIds = new Set<string>(standupSchedule.participants.map((memberId: mongoose.Types.ObjectId) => memberId.toString()))
      const taskIds = Array.from(new Set(
        Array.isArray(body.assignments)
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
          project: params.id,
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
        body.assignments,
        tasksById,
        participantIds
      )

      if (unexpectedTaskIds.length > 0) {
        return NextResponse.json({ error: 'One or more assigned tasks were not found in this project' }, { status: 400 })
      }

      standupSchedule.assignments = assignments as any
    }

    if (body?.notes !== undefined) {
      standupSchedule.notes = typeof body.notes === 'string' ? body.notes.trim() : undefined
    }

    if (body?.summary !== undefined) {
      standupSchedule.summary = typeof body.summary === 'string' ? body.summary.trim() : undefined
    }

    if (body?.actualDate !== undefined) {
      const actualDate = body.actualDate ? new Date(body.actualDate) : undefined
      if (actualDate && Number.isNaN(actualDate.getTime())) {
        return NextResponse.json({ error: 'Actual date is invalid' }, { status: 400 })
      }
      standupSchedule.actualDate = actualDate
    }

    if (body?.location !== undefined) {
      standupSchedule.location = typeof body.location === 'string' ? body.location.trim() : undefined
    }

    if (body?.meetingLink !== undefined) {
      standupSchedule.meetingLink = typeof body.meetingLink === 'string' ? body.meetingLink.trim() : undefined
    }

    if (body?.comments !== undefined) {
      standupSchedule.comments = normalizeComments(body.comments, user.id) as any
    }

    await standupSchedule.save()

    const populatedSchedule = await StandupSchedule.findById(standupSchedule._id)
      .populate('participants', 'firstName lastName email avatar role')
      .populate('facilitator', 'firstName lastName email avatar role')
      .populate('createdBy', 'firstName lastName email avatar role')
      .populate('assignments.member', 'firstName lastName email avatar role')
      .populate('assignments.task', 'title status displayId priority')
      .populate('comments.author', 'firstName lastName email avatar role')

    return NextResponse.json({ success: true, data: populatedSchedule })
  } catch (error) {
    console.error('Update standup schedule error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
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

    const standupSchedule = await StandupSchedule.findOne({
      _id: params.scheduleId,
      project: params.id,
      organization: user.organization,
      archived: false
    })

    if (!standupSchedule) {
      return NextResponse.json({ error: 'Standup schedule not found' }, { status: 404 })
    }

    standupSchedule.archived = true
    await standupSchedule.save()

    return NextResponse.json({ success: true, message: 'Standup schedule archived successfully' })
  } catch (error) {
    console.error('Delete standup schedule error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}