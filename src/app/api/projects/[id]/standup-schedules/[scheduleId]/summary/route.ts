import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import '@/models/registry'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
import { StandupSchedule } from '@/models/StandupSchedule'
import { StandupSummary } from '@/models/StandupSummary'
import { TimeEntry } from '@/models/TimeEntry'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'

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

    if (!schedule) {
      return NextResponse.json({ error: 'Standup schedule not found' }, { status: 404 })
    }

    // Load necessary context for analysis
    const dateStr = schedule.scheduledDate.toISOString().slice(0, 10)
    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`)
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`)

    const [projectWithMembers, projectTasks, timeEntries] = await Promise.all([
      Project.findById(params.id).populate('teamMembers.memberId', 'firstName lastName email avatar role'),
      Task.find({ project: params.id, organization: user.organization, archived: false }),
      TimeEntry.find({
        project: params.id,
        organization: user.organization,
        startTime: { $gte: startOfDay, $lte: endOfDay }
      }).populate('user', 'firstName lastName email')
    ])

    // Core Logical PM Analysis
    const memberAnalysis: string[] = []
    const taskAnalysis: string[] = []

    const totalLoggedMinutes = timeEntries.reduce((sum, log) => sum + log.duration, 0)
    const totalLoggedHours = totalLoggedMinutes / 60

    // Analyze each member's workload, productivity, and activity
    const members = (projectWithMembers?.teamMembers || [])
      .map((m: any) => m.memberId)
      .filter((m: any) => m !== null && m !== undefined)

    members.forEach((member: any) => {
      const memberIdStr = member._id.toString()

      // Find active tasks assigned to this member
      const memberTasks = projectTasks.filter((task: any) =>
        (task.assignedTo || []).some((assignee: any) => assignee.user?.toString() === memberIdStr)
      )
      const activeTasks = memberTasks.filter((task: any) => !['done', 'cancelled'].includes(task.status))
      const completedTasksToday = memberTasks.filter((task: any) =>
        task.status === 'done' && task.completedAt &&
        task.completedAt >= startOfDay && task.completedAt <= endOfDay
      )

      // Time logged by member today
      const memberTimeEntries = timeEntries.filter((log: any) => log.user?._id?.toString() === memberIdStr)
      const memberMinutes = memberTimeEntries.reduce((sum: number, entry: any) => sum + entry.duration, 0)
      const memberHours = memberMinutes / 60

      const isScheduledParticipant = schedule.participants.some((pId: any) => pId.toString() === memberIdStr)

      // Workload detection
      if (activeTasks.length >= 4) {
        memberAnalysis.push(`- **${member.firstName} ${member.lastName}** is currently managing a heavy workload with **${activeTasks.length} active tasks**, which may affect delivery timelines if not balanced.`)
      }

      // Productivity trends
      if (memberHours >= 4) {
        memberAnalysis.push(`- **${member.firstName} ${member.lastName}** demonstrated strong progress today, logging **${memberHours.toFixed(1)} hours** across their tasks.`)
      } else if (isScheduledParticipant && memberHours === 0 && completedTasksToday.length === 0) {
        // Inactive member detection
        memberAnalysis.push(`- **${member.firstName} ${member.lastName}** (scheduled participant) had no active task timelogs or completed updates recorded today.`)
      }
    })

    // Analyze task estimation, status accuracy, and stalled progress
    projectTasks.forEach((task: any) => {
      const taskIdStr = task._id.toString()

      // Find all timelogs for this task today
      const taskLogsToday = timeEntries.filter((log: any) => log.task?.toString() === taskIdStr)
      const taskMinutesToday = taskLogsToday.reduce((sum: number, entry: any) => sum + entry.duration, 0)

      // Get cumulative tracked minutes for this task across ALL time entries
      // Note: we can sum this up asynchronously to see if task exceeds overall estimate
      const hasTrackedToday = taskMinutesToday > 0

      // Missing status updates (timelogs exist but status is TODO/BACKLOG)
      if (hasTrackedToday && ['todo', 'backlog'].includes(task.status)) {
        taskAnalysis.push(`- **Work has started** on "${task.title}" (logged ${taskMinutesToday} mins today), but the task status is still marked as **${task.status.toUpperCase()}**. Please prompt the team to update its status.`)
      }

      // Check if task estimation exceeded
      if (task.estimatedHours && task.actualHours && task.actualHours > task.estimatedHours) {
        taskAnalysis.push(`- **Estimation Alert**: "${task.title}" has exceeded its original estimate of **${task.estimatedHours}h** (currently at **${task.actualHours.toFixed(1)}h** logged), indicating potential blockers or initial underestimation.`)
      }

      // Stalled progress detection
      const isAssignedToStandup = schedule.assignments.some((assign: any) => assign.task?.toString() === taskIdStr)
      if (isAssignedToStandup && task.status === 'in_progress' && !hasTrackedToday) {
        taskAnalysis.push(`- **Stalled Progress**: "${task.title}" is in progress but had no timelog activity logged during today's standup window.`)
      }
    })

    // Fallback notes if analysis is empty
    if (memberAnalysis.length === 0) {
      memberAnalysis.push('- Team members are operating within standard workload limits, and active contributors are progressing consistently.')
    }
    if (taskAnalysis.length === 0) {
      taskAnalysis.push('- Tasks appear aligned with status updates and estimates. No anomalies detected.')
    }

    // Build the Markdown summary
    const completedCount = schedule.assignments.filter((a: any) => a.taskStatus === 'done' || a.taskStatus === 'completed').length
    const totalAssignments = schedule.assignments.length

    const markdownSummary = `### 📋 PM Standup Report: ${schedule.title}

**Scheduled Date:** ${dateStr}
**Participation:** ${schedule.participants.length} scheduled attendees | Facilitated by ${schedule.facilitator ? 'Project Manager' : 'Facilitator'}
**Logged Workload:** ${totalLoggedHours.toFixed(1)} total hours tracked today

---

#### 👥 Member Workload & Activity
${memberAnalysis.join('\n')}

---

#### 📌 Task Status & Estimation Insights
${taskAnalysis.join('\n')}

---

*This report was automatically compiled using Kanvaro logical PM analysis on today's active tasks, assignments, and time logs.*`

    // Database Restructuring Logic: Only ONE summary entry per standup schedule/day
    // Uses findOneAndUpdate with upsert to prevent race conditions or duplicates
    const savedSummary = await StandupSummary.findOneAndUpdate(
      { standupScheduleId: params.scheduleId },
      {
        projectId: params.id,
        generatedSummary: markdownSummary,
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
