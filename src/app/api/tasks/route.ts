import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Task, TASK_STATUS_VALUES, TaskStatus } from '@/models/Task'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { notificationService } from '@/lib/notification-service'
import { cache, invalidateCache } from '@/lib/redis'
import crypto from 'crypto'
import { Counter } from '@/models/Counter'

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const TASK_STATUS_SET = new Set<TaskStatus>(TASK_STATUS_VALUES)

function sanitizeLabels(input: any): string[] {
  if (Array.isArray(input)) {
    return input
      .filter((value): value is string => typeof value === 'string')
      .map(label => label.trim())
      .filter(label => label.length > 0)
  }

  if (typeof input === 'string') {
    return input
      .split(',')
      .map(part => part.trim())
      .filter(part => part.length > 0)
  }

  return []
}

type IncomingSubtask = {
  _id?: string
  title?: unknown
  description?: unknown
  status?: unknown
  isCompleted?: unknown
}

type IncomingAttachment = {
  name?: unknown
  url?: unknown
  size?: unknown
  type?: unknown
  uploadedBy?: unknown
  uploadedAt?: unknown
}

function sanitizeSubtasks(input: any): Array<{
  _id?: string
  title: string
  description?: string
  status: TaskStatus
  isCompleted: boolean
}> {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .filter((item: IncomingSubtask) => typeof item?.title === 'string' && item.title.trim().length > 0)
    .map((item: IncomingSubtask) => {
      const rawStatus = typeof item.status === 'string' ? item.status : undefined
      const status = rawStatus && TASK_STATUS_SET.has(rawStatus as TaskStatus)
        ? rawStatus as TaskStatus
        : 'backlog'

      const sanitized: {
        _id?: string
        title: string
        description?: string
        status: TaskStatus
        isCompleted: boolean
      } = {
        title: (item.title as string).trim(),
        status,
        isCompleted: typeof item.isCompleted === 'boolean'
          ? item.isCompleted
          : status === 'done'
      }

      if (item._id && typeof item._id === 'string') {
        sanitized._id = item._id
      }

      if (typeof item.description === 'string') {
        const trimmed = item.description.trim()
        if (trimmed.length > 0) {
          sanitized.description = trimmed
        }
      }

      return sanitized
    })
}

function sanitizeAttachments(input: any, defaultUserId: string) {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item: IncomingAttachment) => {
      if (typeof item?.name !== 'string' || typeof item?.url !== 'string') {
        return null
      }

      const sizeValue = typeof item.size === 'number'
        ? item.size
        : typeof item.size === 'string'
          ? Number(item.size)
          : undefined

      if (typeof sizeValue !== 'number' || Number.isNaN(sizeValue)) {
        return null
      }

      const typeValue = typeof item.type === 'string' ? item.type : 'application/octet-stream'
      const uploadedByValue =
        typeof item.uploadedBy === 'string' && item.uploadedBy.trim().length > 0
          ? item.uploadedBy.trim()
          : defaultUserId

      const uploadedAtValue =
        typeof item.uploadedAt === 'string'
          ? new Date(item.uploadedAt)
          : new Date()

      return {
        name: item.name,
        url: item.url,
        size: sizeValue,
        type: typeValue,
        uploadedBy: uploadedByValue,
        uploadedAt: uploadedAtValue
      }
    })
    .filter((attachment): attachment is NonNullable<typeof attachment> => attachment !== null)
}

export async function GET(request: NextRequest) {
  try {
    
    await connectDB();

    const authResult = await authenticateUser();
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { user } = authResult;
    const userId = user.id;
    const organizationId = user.organization;

    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const after = searchParams.get('after');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const priority = searchParams.get('priority') || '';
    const type = searchParams.get('type') || '';
    const project = searchParams.get('project') || '';
    const assignedTo = searchParams.get('assignedTo') || '';
    const createdBy = searchParams.get('createdBy') || '';
    const dueDateFrom = searchParams.get('dueDateFrom') || '';
    const dueDateTo = searchParams.get('dueDateTo') || '';
    const createdAtFrom = searchParams.get('createdAtFrom') || '';
    const createdAtTo = searchParams.get('createdAtTo') || '';

    const useCursorPagination = !!after;
    const PAGE_SIZE = Math.min(limit, 100);
    const sort = { createdAt: -1 as const };

    const canViewAllTasks = await PermissionService.hasPermission(
      userId,
      Permission.PROJECT_VIEW_ALL
    );
    const filters: any = {
      organization: organizationId,
      archived: false,
    };

    // Build the base filter for user permissions
    // If user can view all tasks, allow additional filters like assignedTo and createdBy
    // Otherwise, restrict to tasks assigned to or created by the user
    if (!canViewAllTasks) {
      const userFilters: any[] = [{ assignedTo: userId }, { createdBy: userId }];
      
      // If assignedTo filter is provided and it's the current user, use it
      // Otherwise, ignore the filter and use default user restriction
      if (assignedTo && assignedTo === userId) {
        filters.assignedTo = userId;
      } else if (createdBy && createdBy === userId) {
        filters.createdBy = userId;
      } else {
        filters.$or = userFilters;
      }
    } else {
      // User can view all tasks, so apply filters as requested
      if (assignedTo) filters.assignedTo = assignedTo;
      if (createdBy) filters.createdBy = createdBy;
    }

    if (search) {
      const trimmedSearch = search.trim()
      const escapedSearch = escapeRegex(trimmedSearch)
      const fuzzyRegex = new RegExp(escapedSearch, 'i')
      const displayIdRegex = new RegExp(`^${escapedSearch}$`, 'i')
      const orFilters: any[] = [
        { title: fuzzyRegex },
        { description: fuzzyRegex },
        { displayId: trimmedSearch.includes('.') ? displayIdRegex : fuzzyRegex }
      ]

      const numericValue = Number(trimmedSearch)
      if (!Number.isNaN(numericValue)) {
        orFilters.push({ taskNumber: numericValue })
      }

      filters.$and = filters.$and || []
      filters.$and.push({ $or: orFilters })
    }

    if (status) filters.status = status;
    if (priority) filters.priority = priority;
    if (type) filters.type = type;
    if (project) filters.project = project;

    // Date range filters
    if (dueDateFrom || dueDateTo) {
      filters.dueDate = {};
      if (dueDateFrom) {
        const fromDate = new Date(dueDateFrom);
        fromDate.setHours(0, 0, 0, 0);
        filters.dueDate.$gte = fromDate;
      }
      if (dueDateTo) {
        const toDate = new Date(dueDateTo);
        toDate.setHours(23, 59, 59, 999);
        filters.dueDate.$lte = toDate;
      }
    }

    // Created date range filters (combine with cursor pagination if needed)
    const createdAtFilters: any = {};
    if (createdAtFrom) {
      const fromDate = new Date(createdAtFrom);
      fromDate.setHours(0, 0, 0, 0);
      createdAtFilters.$gte = fromDate;
    }
    if (createdAtTo) {
      const toDate = new Date(createdAtTo);
      toDate.setHours(23, 59, 59, 999);
      createdAtFilters.$lte = toDate;
    }
    
    if (useCursorPagination && after) {
      createdAtFilters.$lt = new Date(after);
    }
    
    if (Object.keys(createdAtFilters).length > 0) {
      filters.createdAt = createdAtFilters;
    } else if (useCursorPagination && after) {
      filters.createdAt = { $lt: new Date(after) };
    }

    const taskQueryFilters: any = { ...filters };

    const items = await Task.find(taskQueryFilters)
      .populate('project', '_id name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .sort(sort)
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();

    // Exclude tasks whose project no longer exists (or is outside scope)
    const filteredItems = items.filter((t: any) => !!t.project)

    const total = await Task.countDocuments(taskQueryFilters);

    return NextResponse.json({
      success: true,
      data: filteredItems,
      pagination: {
        page,
        limit: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const userId = user.id

    const payload = await request.json()
    console.log('[Task POST] Starting task creation', { userId, project: payload.project })
    const {
      title,
      description,
      status,
      priority,
      type,
      project,
      story,
      parentTask,
      assignedTo,
      storyPoints,
      dueDate,
      estimatedHours,
      labels,
      subtasks,
      attachments
    } = payload

    // Check if user can create tasks (project-scoped permission)
    const canCreateTask = await PermissionService.hasPermission(userId, Permission.TASK_CREATE, project)
    if (!canCreateTask) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create tasks' },
        { status: 403 }
      )
    }

    // Validate required fields
    if (!title || !project) {
      return NextResponse.json(
        { error: 'Title and project are required' },
        { status: 400 }
      )
    }

    // Resolve project number and next task number for this project (do this first as we need it)
    const projectDoc = await Project.findById(project).select('projectNumber organization name')
    if (!projectDoc) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 400 }
      )
    }

    // Get the next position for this project/status combination
    // Allow any string status to support custom kanban statuses per project
    // Default to 'backlog' if no status provided
    const taskStatus: string = typeof status === 'string' && status.trim().length > 0
      ? status.trim()
      : 'backlog'
    
    // Run position query and counter update in parallel for better performance
    const [maxPosition, taskCounter] = await Promise.all([
      Task.findOne(
        { project, status: taskStatus },
        { position: 1 }
      ).sort({ position: -1 }).lean(),
      Counter.findOneAndUpdate(
        { scope: 'task', project: projectDoc._id },
        { $inc: { seq: 1 }, $setOnInsert: { updatedAt: new Date() } },
        { new: true, upsert: true }
      )
    ])
    
    // TypeScript type narrowing: findOne returns a single document or null
    // Access position property safely after verifying it exists
    const maxPositionValue = maxPosition && typeof maxPosition === 'object' && !Array.isArray(maxPosition) && 'position' in maxPosition
      ? (maxPosition as any).position
      : undefined
    const nextPosition = typeof maxPositionValue === 'number' ? maxPositionValue + 1 : 0
    const taskNumber = taskCounter.seq
    const displayId = `${projectDoc.projectNumber}.${taskNumber}`

    // Create task
    const normalizedStory = typeof story === 'string' && story.trim() !== '' ? story.trim() : undefined
    const normalizedParentTask = typeof parentTask === 'string' && parentTask.trim() !== '' ? parentTask.trim() : undefined
    const normalizedAssignedTo = typeof assignedTo === 'string' && assignedTo.trim() !== '' ? assignedTo.trim() : undefined

    const task = new Task({
      title,
      description,
      status: taskStatus,
      priority: priority || 'medium',
      type: type || 'task',
      organization: user.organization,
      project,
      taskNumber,
      displayId,
      story: normalizedStory,
      parentTask: normalizedParentTask,
      assignedTo: normalizedAssignedTo,
      createdBy: userId,
      storyPoints: typeof storyPoints === 'number'
        ? storyPoints
        : (typeof storyPoints === 'string' && storyPoints.trim() !== '' ? Number(storyPoints) : undefined),
      dueDate: dueDate ? new Date(dueDate) : undefined,
      estimatedHours: typeof estimatedHours === 'number'
        ? estimatedHours
        : (typeof estimatedHours === 'string' && estimatedHours.trim() !== '' ? Number(estimatedHours) : undefined),
      labels: sanitizeLabels(labels),
      subtasks: sanitizeSubtasks(subtasks),
      attachments: sanitizeAttachments(attachments, userId),
      position: nextPosition
    })

    await task.save()

    // Populate the created task (do this before cache invalidation to ensure we have the data)
    const populatedTask = await Task.findById(task._id)
      .populate('project', '_id name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate('story', 'title status')
      .populate('sprint', 'name status')
      .populate('parentTask', 'title')
      .populate('attachments.uploadedBy', 'firstName lastName email')

    // Return response immediately to avoid blocking on slow operations
    const responseData = {
      success: true,
      message: 'Task created successfully',
      data: populatedTask
    }

    // Invalidate tasks cache for this organization (non-blocking)
    invalidateCache(`tasks:*:org:${user.organization}:*`).catch(err => {
      console.error('Failed to invalidate cache:', err)
    })

    // Send notification if task is assigned to someone (non-blocking - fire and forget)
    if (normalizedAssignedTo && normalizedAssignedTo !== userId) {
      // Use projectDoc we already fetched earlier instead of querying again
      notificationService.notifyTaskUpdate(
        task._id.toString(),
        'assigned',
        normalizedAssignedTo,
        user.organization,
        title,
        projectDoc?.name
      ).catch(notificationError => {
        console.error('Failed to send task assignment notification:', notificationError)
        // Don't fail the task creation if notification fails
      })
    }

    const duration = Date.now() - startTime
    console.log('[Task POST] Task created successfully', { taskId: task._id, duration: `${duration}ms` })

    return NextResponse.json(responseData)

  } catch (error) {
    console.error('Create task error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}