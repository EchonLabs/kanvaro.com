import { TaskActivity, TaskActivityAction } from '@/models/TaskActivity'

interface LogActivityParams {
  taskId: string
  organizationId: string
  userId: string
  action: TaskActivityAction
  field?: string
  oldValue?: string
  newValue?: string
  metadata?: Record<string, any>
}

export async function logTaskActivity(params: LogActivityParams): Promise<void> {
  try {
    await TaskActivity.create({
      task: params.taskId,
      organization: params.organizationId,
      user: params.userId,
      action: params.action,
      field: params.field,
      oldValue: params.oldValue,
      newValue: params.newValue,
      metadata: params.metadata
    })
  } catch (error) {
    console.error('Failed to log task activity:', error)
  }
}

/**
 * Compare old and new task data, and log individual field changes.
 */
export async function logTaskFieldChanges(
  taskId: string,
  organizationId: string,
  userId: string,
  currentTask: Record<string, any>,
  updateData: Record<string, any>
): Promise<void> {
  const activities: LogActivityParams[] = []

  const fieldMapping: Record<string, { action: TaskActivityAction; label: string }> = {
    title: { action: 'title_changed', label: 'Title' },
    description: { action: 'description_changed', label: 'Description' },
    status: { action: 'status_changed', label: 'Status' },
    priority: { action: 'priority_changed', label: 'Priority' },
    type: { action: 'type_changed', label: 'Type' },
    dueDate: { action: 'due_date_changed', label: 'Due Date' },
    storyPoints: { action: 'story_points_changed', label: 'Story Points' },
    estimatedHours: { action: 'estimated_hours_changed', label: 'Estimated Hours' },
    sprint: { action: 'sprint_changed', label: 'Sprint' },
    story: { action: 'story_changed', label: 'Story' },
    epic: { action: 'epic_changed', label: 'Epic' },
  }

  for (const [field, config] of Object.entries(fieldMapping)) {
    if (!Object.prototype.hasOwnProperty.call(updateData, field)) continue

    const oldVal = currentTask[field]
    const newVal = updateData[field]

    const oldStr = oldVal != null ? String(oldVal) : ''
    const newStr = newVal != null ? String(newVal) : ''

    if (oldStr !== newStr) {
      activities.push({
        taskId,
        organizationId,
        userId,
        action: config.action,
        field: config.label,
        oldValue: oldStr || undefined,
        newValue: newStr || undefined
      })
    }
  }

  // Handle labels changes
  if (Object.prototype.hasOwnProperty.call(updateData, 'labels')) {
    const oldLabels = Array.isArray(currentTask.labels) ? currentTask.labels.sort().join(', ') : ''
    const newLabels = Array.isArray(updateData.labels) ? updateData.labels.sort().join(', ') : ''
    if (oldLabels !== newLabels) {
      activities.push({
        taskId,
        organizationId,
        userId,
        action: 'labels_changed',
        field: 'Labels',
        oldValue: oldLabels || undefined,
        newValue: newLabels || undefined
      })
    }
  }

  // Handle assignedTo changes
  if (Object.prototype.hasOwnProperty.call(updateData, 'assignedTo')) {
    const getAssigneeIds = (arr: any) => {
      if (!Array.isArray(arr)) return []
      return arr.map((item: any) => {
        if (typeof item === 'object' && item?.user) {
          return typeof item.user === 'object' && item.user?._id
            ? String(item.user._id)
            : String(item.user)
        }
        return String(item)
      }).sort()
    }

    const oldIds = getAssigneeIds(currentTask.assignedTo)
    const newIds = getAssigneeIds(updateData.assignedTo)

    const added = newIds.filter((id: string) => !oldIds.includes(id))
    const removed = oldIds.filter((id: string) => !newIds.includes(id))

    for (const id of added) {
      activities.push({
        taskId,
        organizationId,
        userId,
        action: 'assigned',
        field: 'Assigned To',
        newValue: id
      })
    }

    for (const id of removed) {
      activities.push({
        taskId,
        organizationId,
        userId,
        action: 'unassigned',
        field: 'Assigned To',
        oldValue: id
      })
    }
  }

  if (activities.length > 0) {
    await Promise.allSettled(activities.map(a => logTaskActivity(a)))
  }
}
