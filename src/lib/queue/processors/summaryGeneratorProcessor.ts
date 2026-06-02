import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import '@/models/registry'
import { StandupSchedule } from '@/models/StandupSchedule'
import { StandupSummary } from '@/models/StandupSummary'
import { StandupCronJob } from '@/models/StandupCronJob'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
import { Sprint } from '@/models/Sprint'
import { TimeEntry } from '@/models/TimeEntry'
import { TaskActivity } from '@/models/TaskActivity'
import { Notification } from '@/models/Notification'
import { buildStandupSummaryMarkdown } from '@/components/standup-dashboard/standup-summary-utils'
import { filterStandupTimelogs } from '@/components/standup-dashboard/standup-timelog-utils'
import { getStandupDayBounds } from '@/components/standup-dashboard/standup-date-utils'
import type { StandupJobData } from '../standupQueue'

export async function processSummaryGenerator(data: StandupJobData) {
  await connectDB()

  await StandupCronJob.findOneAndUpdate(
    { projectId: data.projectId, jobType: 'summary_generator' },
    { lastRunStatus: 'running' }
  )

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentStandups = await StandupSchedule.find({
      project: data.projectId,
      organization: data.organizationId,
      status: 'completed',
      archived: false,
      scheduledDate: { $gte: since }
    })
      .populate('participants', 'firstName lastName email avatar role')
      .lean() as any[]

    for (const standup of recentStandups) {
      const existing = await StandupSummary.findOne({ standupScheduleId: standup._id })
      if (existing) continue

      const summaryDate = standup.actualDate || standup.scheduledDate
      const dayBounds = getStandupDayBounds(summaryDate)
      if (!dayBounds) continue

      const [projectRecord, projectTasks, timeEntries, taskActivities, sprintDocs] = await Promise.all([
        Project.findById(data.projectId).select('name').lean() as any,
        Task.find({ project: data.projectId, organization: data.organizationId, archived: false })
          .select('_id title status priority displayId taskNumber assignedTo sprint completedAt dueDate estimatedHours actualHours')
          .lean(),
        TimeEntry.find({
          project: data.projectId,
          organization: data.organizationId,
          startTime: { $gte: dayBounds.start, $lte: dayBounds.end }
        }).populate('user', 'firstName lastName email avatar role').populate('task', 'title status displayId').lean(),
        TaskActivity.find({
          organization: data.organizationId,
          createdAt: { $gte: dayBounds.start, $lte: dayBounds.end }
        }).populate('user', 'firstName lastName email avatar role').lean(),
        Sprint.find({ project: data.projectId, organization: data.organizationId, archived: false })
          .select('_id name status startDate endDate tasks').lean()
      ])

      const currentSprint = (sprintDocs as any[]).find((s: any) => s.status === 'active') || (sprintDocs as any[])[0]
      const sprintTaskIds = new Set<string>(currentSprint?.tasks?.map((t: any) => String(t)) || [])

      const taskCards = (projectTasks as any[]).map((task: any) => ({
        _id: String(task._id),
        title: task.title || 'Untitled',
        status: task.status,
        displayId: task.displayId,
        dueDate: task.dueDate,
        estimatedHours: task.estimatedHours,
        completedAt: task.completedAt,
        actualHours: task.actualHours,
        comments: [],
        assignedTo: Array.isArray(task.assignedTo) ? task.assignedTo : []
      }))

      const projectTaskIds = new Set<string>(taskCards.map((t) => t._id))
      const sprintTasks = currentSprint ? taskCards.filter((t) => sprintTaskIds.has(t._id)) : taskCards
      const participantIds = new Set((standup.participants || []).map((p: any) => String(p._id || p)))

      const timelogs = filterStandupTimelogs({
        timelogs: (timeEntries as any[]).map((entry: any) => ({
          _id: String(entry._id),
          userId: String(entry.user?._id || entry.user || ''),
          userName: typeof entry.user === 'object' && entry.user
            ? `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim() || entry.user.email
            : 'Unknown',
          taskId: String(entry.task?._id || entry.task || ''),
          taskTitle: typeof entry.task === 'object' && entry.task ? entry.task.title : undefined,
          taskStatus: undefined,
          projectName: (projectRecord as any)?.name || 'Project',
          startTime: entry.startTime,
          endTime: entry.endTime,
          duration: entry.duration || 0,
          description: entry.description || '',
          isBillable: !!entry.isBillable,
          status: entry.status || 'completed'
        })),
        standupDate: standup.actualDate || standup.scheduledDate,
        memberIds: Array.from(participantIds),
        requireTaskId: false
      })

      const activities = (taskActivities as any[])
        .map((a: any) => ({
          taskId: String(a.task?._id || a.task || ''),
          taskTitle: taskCards.find((t) => t._id === String(a.task?._id || a.task || ''))?.title || 'Untitled',
          oldValue: a.oldValue,
          newValue: a.newValue,
          createdAt: a.createdAt,
          userName: a.user ? `${a.user.firstName || ''} ${a.user.lastName || ''}`.trim() || a.user.email : 'Unknown'
        }))
        .filter((a) => projectTaskIds.has(a.taskId))

      const markdownSummary = buildStandupSummaryMarkdown({
        meeting: {
          _id: String(standup._id),
          title: standup.title || 'Daily Standup',
          date: summaryDate.toISOString(),
          time: standup.time || '09:00',
          durationMinutes: standup.durationMinutes || 15,
          participants: standup.participants || [],
          status: standup.status,
          notes: standup.notes,
          actualDate: standup.actualDate?.toISOString?.(),
          facilitator: standup.facilitator,
          createdBy: standup.createdBy,
          location: undefined,
          meetingLink: undefined,
          assignments: standup.assignments || [],
          comments: standup.comments || [],
          summary: undefined
        },
        projectName: (projectRecord as any)?.name || 'Project',
        sprintName: currentSprint?.name,
        sprintStatus: currentSprint?.status,
        sprintTasks,
        allTasks: taskCards,
        participants: standup.participants || [],
        timelogs,
        taskActivities: activities,
        taskComments: sprintTasks,
        standupComments: (standup.comments || []).map((c: any) => ({
          _id: String(c._id || ''),
          authorName: c.authorName || 'Unknown',
          memberId: c.member?.toString?.(),
          taskId: c.task?.toString?.(),
          taskTitle: c.taskTitle,
          reason: c.reason || '',
          createdAt: c.createdAt || new Date().toISOString()
        })),
        delayReasons: {}
      })

      await StandupSummary.findOneAndUpdate(
        { standupScheduleId: standup._id },
        { projectId: data.projectId, generatedSummary: markdownSummary, delayReasons: {}, generatedDate: new Date() },
        { new: true, upsert: true }
      )
    }

    await StandupCronJob.findOneAndUpdate(
      { projectId: data.projectId, jobType: 'summary_generator' },
      { lastRunStatus: 'success', lastRunAt: new Date(), lastRunError: undefined }
    )

    await Notification.create({
      user: new mongoose.Types.ObjectId(data.createdBy),
      organization: new mongoose.Types.ObjectId(data.organizationId),
      type: 'project',
      title: 'Standup Summaries Generated',
      message: `Automated summary generation completed for your project.`,
      data: {
        entityType: 'project',
        entityId: new mongoose.Types.ObjectId(data.projectId),
        action: 'updated',
        priority: 'low',
        url: `/tasks/standup-dashboard/${data.projectId}`
      },
      isRead: false,
      sentVia: { inApp: true, email: false, push: false }
    })
  } catch (err: any) {
    await StandupCronJob.findOneAndUpdate(
      { projectId: data.projectId, jobType: 'summary_generator' },
      { lastRunStatus: 'failed', lastRunAt: new Date(), lastRunError: err?.message || 'Unknown error' }
    )
    throw err
  }
}
