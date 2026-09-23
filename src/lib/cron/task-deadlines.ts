import { connectDB } from '@/lib/db-config'
import '@/models/registry'
import { Task } from '@/models/Task'
import { notificationService } from '@/lib/notification-service'

export async function processTaskDeadlines(baseUrl?: string) {
  await connectDB()

  const now = new Date()
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const results = {
    dueSoon24h: 0,
    overdue: 0,
    errors: [] as string[]
  }

  // Process tasks due in the next 24 hours
  const tasksDueSoon = await Task.find({
    dueDate: { $gte: now, $lte: in24Hours },
    status: { $nin: ['done', 'cancelled'] },
    archived: { $ne: true },
    'remindersSent.dueSoon24h': { $ne: true }
  })
    .populate('project', 'name organization settings')
    .populate('assignedTo.user', '_id firstName lastName email preferences')
    .populate('createdBy', '_id firstName lastName email preferences')

  for (const task of tasksDueSoon) {
    try {
      const project = task.project as any
      // Check if project has deadline reminders enabled (defaults to true)
      if (project?.settings?.notifications?.deadlineReminders === false) {
        continue
      }

      const projectName = project?.name || 'Project'
      const organizationId = (task.organization || project?.organization || '').toString()

      // Get recipients (assignees or creator if unassigned)
      const recipientIds = new Set<string>()

      if (Array.isArray(task.assignedTo) && task.assignedTo.length > 0) {
        for (const item of task.assignedTo) {
          const userObj = item?.user as any
          const userId = userObj?._id ? userObj._id.toString() : item?.user ? item.user.toString() : null
          if (userId) {
            if (userObj?.preferences?.notifications?.taskReminders !== false) {
              recipientIds.add(userId)
            }
          }
        }
      }

      // If no assignees or assignees had reminders disabled, fallback to creator
      if (recipientIds.size === 0 && task.createdBy) {
        const creatorObj = task.createdBy as any
        const creatorId = creatorObj?._id ? creatorObj._id.toString() : task.createdBy.toString()
        if (creatorId && creatorObj?.preferences?.notifications?.taskReminders !== false) {
          recipientIds.add(creatorId)
        }
      }

      // Send notifications
      const recipientList = Array.from(recipientIds)
      for (let i = 0; i < recipientList.length; i++) {
        const recipientId = recipientList[i]
        await notificationService.notifyTaskDeadline(
          task._id.toString(),
          'approaching',
          recipientId,
          organizationId,
          task.title,
          task.dueDate!,
          projectName,
          baseUrl
        )
      }

      // Mark 24h reminder as sent
      await Task.updateOne(
        { _id: task._id },
        { $set: { 'remindersSent.dueSoon24h': true } }
      )
      results.dueSoon24h++
    } catch (err: any) {
      console.error(`Failed to process due soon reminder for task ${task._id}:`, err)
      results.errors.push(`Task ${task._id} (24h): ${err?.message || 'Unknown error'}`)
    }
  }

  // Process overdue tasks
  const overdueTasks = await Task.find({
    dueDate: { $lt: now },
    status: { $nin: ['done', 'cancelled'] },
    archived: { $ne: true },
    'remindersSent.overdue': { $ne: true }
  })
    .populate('project', 'name organization settings')
    .populate('assignedTo.user', '_id firstName lastName email preferences')
    .populate('createdBy', '_id firstName lastName email preferences')

  for (const task of overdueTasks) {
    try {
      const project = task.project as any
      if (project?.settings?.notifications?.deadlineReminders === false) {
        continue
      }

      const projectName = project?.name || 'Project'
      const organizationId = (task.organization || project?.organization || '').toString()

      const recipientIds = new Set<string>()

      if (Array.isArray(task.assignedTo) && task.assignedTo.length > 0) {
        for (const item of task.assignedTo) {
          const userObj = item?.user as any
          const userId = userObj?._id ? userObj._id.toString() : item?.user ? item.user.toString() : null
          if (userId) {
            if (userObj?.preferences?.notifications?.taskReminders !== false) {
              recipientIds.add(userId)
            }
          }
        }
      }

      if (recipientIds.size === 0 && task.createdBy) {
        const creatorObj = task.createdBy as any
        const creatorId = creatorObj?._id ? creatorObj._id.toString() : task.createdBy.toString()
        if (creatorId && creatorObj?.preferences?.notifications?.taskReminders !== false) {
          recipientIds.add(creatorId)
        }
      }

      const overdueRecipientList = Array.from(recipientIds)
      for (let i = 0; i < overdueRecipientList.length; i++) {
        const recipientId = overdueRecipientList[i]
        await notificationService.notifyTaskDeadline(
          task._id.toString(),
          'overdue',
          recipientId,
          organizationId,
          task.title,
          task.dueDate!,
          projectName,
          baseUrl
        )
      }

      // Mark overdue reminder as sent
      await Task.updateOne(
        { _id: task._id },
        { $set: { 'remindersSent.overdue': true } }
      )
      results.overdue++
    } catch (err: any) {
      console.error(`Failed to process overdue reminder for task ${task._id}:`, err)
      results.errors.push(`Task ${task._id} (overdue): ${err?.message || 'Unknown error'}`)
    }
  }

  return {
    results,
    processedAt: now.toISOString()
  }
}
