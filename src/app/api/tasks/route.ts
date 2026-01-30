import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import mongoose from 'mongoose'
import { Task, TASK_STATUS_VALUES, TaskStatus } from '@/models/Task'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import '@/models/Sprint'
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
  const startTime = Date.now();
  console.log('[Tasks GET] Starting request processing');

  try {
    console.log('[Tasks GET] Connecting to database');
    await connectDB();
    console.log('[Tasks GET] Database connected successfully');

    console.log('[Tasks GET] Authenticating user');
    const authResult = await authenticateUser();
    if ('error' in authResult) {
      console.error('[Tasks GET] Authentication failed:', authResult.error);
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }
    console.log('[Tasks GET] User authenticated successfully');

    const { user } = authResult;
    const userId = user.id;
    const organizationId = user.organization;
    console.log('[Tasks GET] User ID:', userId, 'Organization ID:', organizationId);

    console.log('[Tasks GET] Parsing search parameters');
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const after = searchParams.get('after');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const priority = searchParams.get('priority') || '';
    const type = searchParams.get('type') || '';
    const project = searchParams.get('project') || '';
    const story = searchParams.get('story') || '';
    const assignedTo = searchParams.get('assignedTo') || '';
    const createdBy = searchParams.get('createdBy') || '';
    const dueDateFrom = searchParams.get('dueDateFrom') || '';
    const dueDateTo = searchParams.get('dueDateTo') || '';
    const createdAtFrom = searchParams.get('createdAtFrom') || '';
    const createdAtTo = searchParams.get('createdAtTo') || '';
    const minimal = searchParams.get('minimal') === 'true';

    console.log('[Tasks GET] Parameters parsed:', {
      page, limit, after, search, status, priority, type, project, story,
      assignedTo, createdBy, dueDateFrom, dueDateTo, createdAtFrom, createdAtTo, minimal
    });

    const useCursorPagination = !!after;
    const PAGE_SIZE = Math.min(limit, 1000);
    const sort = { createdAt: -1 as const };

    console.log('[Tasks GET] Checking user permissions');
    const [canViewAllTasks, hasTaskViewAll] = await Promise.all([
      PermissionService.hasPermission(userId, Permission.PROJECT_VIEW_ALL),
      PermissionService.hasPermission(userId, Permission.TASK_VIEW_ALL)
    ]);
    console.log('[Tasks GET] User permissions - canViewAllTasks:', canViewAllTasks, 'hasTaskViewAll:', hasTaskViewAll);

    const filters: any = {
      organization: organizationId,
      archived: false,
    };

    // Build the base filter for user permissions
    // If user has TASK_VIEW_ALL or PROJECT_VIEW_ALL, they can view all tasks
    // Otherwise, restrict to tasks assigned to or created by the user
    if (!canViewAllTasks && !hasTaskViewAll) {
      const userFilters: any[] = [{ 'assignedTo.user': { $in: [userId] } }, { createdBy: userId }];

      // If assignedTo filter is provided and it's the current user, use it
      // Otherwise, ignore the filter and use default user restriction
      if (assignedTo && assignedTo === userId) {
        filters['assignedTo.user'] = { $in: [userId] };
      } else if (createdBy && createdBy === userId) {
        filters.createdBy = userId;
      } else {
        filters.$or = userFilters;
      }
    } else {
      // User can view all tasks, so apply filters as requested
      if (assignedTo) filters['assignedTo.user'] = { $in: [assignedTo] };
      if (createdBy) filters.createdBy = createdBy;
    }

    console.log('[Tasks GET] Building search filters');
    if (search) {
      try {
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
      } catch (searchError) {
        console.error('[Tasks GET] Error building search filters:', searchError);
        return NextResponse.json(
          { error: 'Invalid search parameter' },
          { status: 400 }
        );
      }
    }

    // Apply simple filters
    if (status) filters.status = status;
    if (priority) filters.priority = priority;
    if (type) filters.type = type;
    if (project) filters.project = project;
    if (story) filters.story = story;

    console.log('[Tasks GET] Building date filters');
    // Date range filters
    if (dueDateFrom || dueDateTo) {
      try {
        filters.dueDate = {};
        if (dueDateFrom) {
          const fromDate = new Date(dueDateFrom);
          if (isNaN(fromDate.getTime())) {
            throw new Error('Invalid dueDateFrom format');
          }
          fromDate.setHours(0, 0, 0, 0);
          filters.dueDate.$gte = fromDate;
        }
        if (dueDateTo) {
          const toDate = new Date(dueDateTo);
          if (isNaN(toDate.getTime())) {
            throw new Error('Invalid dueDateTo format');
          }
          toDate.setHours(23, 59, 59, 999);
          filters.dueDate.$lte = toDate;
        }
      } catch (dateError) {
        console.error('[Tasks GET] Error parsing due date filters:', dateError);
        return NextResponse.json(
          { error: 'Invalid due date format. Use ISO date strings.' },
          { status: 400 }
        );
      }
    }

    // Created date range filters (combine with cursor pagination if needed)
    const createdAtFilters: any = {};
    if (createdAtFrom || createdAtTo) {
      try {
        if (createdAtFrom) {
          const fromDate = new Date(createdAtFrom);
          if (isNaN(fromDate.getTime())) {
            throw new Error('Invalid createdAtFrom format');
          }
          fromDate.setHours(0, 0, 0, 0);
          createdAtFilters.$gte = fromDate;
        }
        if (createdAtTo) {
          const toDate = new Date(createdAtTo);
          if (isNaN(toDate.getTime())) {
            throw new Error('Invalid createdAtTo format');
          }
          toDate.setHours(23, 59, 59, 999);
          createdAtFilters.$lte = toDate;
        }
      } catch (dateError) {
        console.error('[Tasks GET] Error parsing created date filters:', dateError);
        return NextResponse.json(
          { error: 'Invalid created date format. Use ISO date strings.' },
          { status: 400 }
        );
      }
    }

    if (useCursorPagination && after) {
      try {
        createdAtFilters.$lt = new Date(after);
        if (isNaN(createdAtFilters.$lt.getTime())) {
          throw new Error('Invalid after cursor format');
        }
      } catch (cursorError) {
        console.error('[Tasks GET] Error parsing cursor:', cursorError);
        return NextResponse.json(
          { error: 'Invalid cursor format. Use ISO date string.' },
          { status: 400 }
        );
      }
    }

    if (Object.keys(createdAtFilters).length > 0) {
      filters.createdAt = createdAtFilters;
    } else if (useCursorPagination && after) {
      try {
        filters.createdAt = { $lt: new Date(after) };
        if (isNaN(filters.createdAt.$lt.getTime())) {
          throw new Error('Invalid after cursor format');
        }
      } catch (cursorError) {
        console.error('[Tasks GET] Error parsing cursor for createdAt:', cursorError);
        return NextResponse.json(
          { error: 'Invalid cursor format. Use ISO date string.' },
          { status: 400 }
        );
      }
    }

    const taskQueryFilters: any = { ...filters };

    // Use minimal population for story detail view to improve performance
    const populatePaths = minimal ? [] : [
      { path: 'project', select: '_id name' },
      { path: 'assignedTo.user', select: '_id firstName lastName email' },
      { path: 'createdBy', select: 'firstName lastName email' },
      { path: 'movedFromSprint', select: '_id name' }
    ];

    console.log('[Tasks GET] Executing database query');
    console.log('[Tasks GET] Query filters:', JSON.stringify(taskQueryFilters, null, 2));
    console.log('[Tasks GET] Minimal mode:', minimal, 'Page size:', PAGE_SIZE);

    // Add performance logging for task queries
    const queryStartTime = Date.now();

    let items: any[], total: number;
    try {
      [items, total] = await Promise.all([
        Task.find(taskQueryFilters)
          .populate(populatePaths)
          .sort(sort)
          .skip((page - 1) * PAGE_SIZE)
          .limit(PAGE_SIZE)
          .lean(),
        Task.countDocuments(taskQueryFilters)
      ]);
    } catch (queryError) {
      console.error('[Tasks GET] Database query error:', queryError);
      return NextResponse.json(
        { error: 'Database query failed' },
        { status: 500 }
      );
    }

    const queryTime = Date.now() - queryStartTime;
    console.log(`[Tasks GET] Query completed in ${queryTime}ms, found ${items.length} items, total: ${total}`);

    console.log('[Tasks GET] Filtering results');
    // Exclude tasks whose project no longer exists (or is outside scope)
    const filteredItems = items.filter((t: any) => !!t.project)
    console.log(`[Tasks GET] Filtered ${items.length - filteredItems.length} items without projects`);

    const totalTime = Date.now() - startTime;
    console.log(`[Tasks GET] Request completed successfully in ${totalTime}ms`);

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
    const totalTime = Date.now() - startTime;
    console.error(`[Tasks GET] Unexpected error after ${totalTime}ms:`, error);

    // Provide more specific error messages based on error type
    if (error instanceof Error) {
      if (error.message.includes('connect')) {
        return NextResponse.json(
          { error: 'Database connection failed' },
          { status: 503 }
        );
      }
      if (error.message.includes('auth')) {
        return NextResponse.json(
          { error: 'Authentication service unavailable' },
          { status: 503 }
        );
      }
    }

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
      epic,
      parentTask,
      assignedTo,
      storyPoints,
      dueDate,
      estimatedHours,
      labels,
      subtasks,
      attachments,
      isBillable
    } = payload

    // Validate required fields first (fail fast)
    if (!title || !project) {
      return NextResponse.json(
        { error: 'Title and project are required' },
        { status: 400 }
      )
    }

    // Fetch project and check permissions in parallel for better performance
    const [projectDoc, canCreateTask] = await Promise.all([
      Project.findById(project).select('projectNumber organization name teamMembers createdBy isBillableByDefault'),
      PermissionService.hasPermission(userId, Permission.TASK_CREATE, project)
    ])

    if (!projectDoc) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 400 }
      )
    }

    // Verify user has access to this project (quick check before permission check)
    const isProjectMember = projectDoc.teamMembers?.some((member: any) => 
      member.toString() === userId || (typeof member === 'object' && member._id?.toString() === userId)
    ) || projectDoc.createdBy?.toString() === userId

    if (!canCreateTask && !isProjectMember) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create tasks' },
        { status: 403 }
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
    const normalizedEpic = typeof epic === 'string' && epic.trim() !== '' ? epic.trim() : undefined
    const normalizedParentTask = typeof parentTask === 'string' && parentTask.trim() !== '' ? parentTask.trim() : undefined
    // Handle assignedTo as an array of objects with user, user details, and hourlyRate
    let normalizedAssignedTo: Array<{ user: string; firstName?: string; lastName?: string; email?: string; hourlyRate?: number }> = []
    if (Array.isArray(assignedTo)) {
      normalizedAssignedTo = assignedTo
        .filter(item => typeof item === 'object' && item !== null && item.user)
        .map(item => ({
          user: typeof item.user === 'string' ? item.user.trim() : String(item.user),
          firstName: typeof item.firstName === 'string' ? item.firstName.trim() : undefined,
          lastName: typeof item.lastName === 'string' ? item.lastName.trim() : undefined,
          email: typeof item.email === 'string' ? item.email.trim() : undefined,
          hourlyRate: typeof item.hourlyRate === 'number' && item.hourlyRate >= 0 ? item.hourlyRate : undefined
        }))
    } else if (typeof assignedTo === 'string' && assignedTo.trim() !== '') {
      // Legacy support for single string
      normalizedAssignedTo = [{ user: assignedTo.trim() }]
    }

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
      epic: normalizedEpic,
      parentTask: normalizedParentTask,
      assignedTo: normalizedAssignedTo.map(item => ({
        user: item.user,
        firstName: item.firstName,
        lastName: item.lastName,
        email: item.email,
        hourlyRate: item.hourlyRate
      })),
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
      position: nextPosition,
      isBillable: typeof isBillable === 'boolean'
        ? isBillable
        : (projectDoc as any)?.isBillableByDefault ?? true
    })

    // Save task and prepare response data in parallel where possible
    const savePromise = task.save()

    // Build minimal populate paths for faster response
    // Only populate essential fields that are likely to be used immediately
    const populatePaths: any[] = [
      { path: 'project', select: '_id name' },
      { path: 'createdBy', select: 'firstName lastName email' }
    ]

    // Only populate story/epic if they exist (avoid unnecessary queries)
    if (normalizedStory) {
      populatePaths.push({ path: 'story', select: 'title status' })
    }
    if (normalizedEpic) {
      populatePaths.push({ path: 'epic', select: 'title' })
    }
    if (normalizedParentTask) {
      populatePaths.push({ path: 'parentTask', select: 'title' })
    }

    // Only add sprint if model is registered and task has sprint
    if (mongoose.models.Sprint && task.sprint) {
      populatePaths.push({ path: 'sprint', select: 'name status' })
    }

    // Populate attachments.uploadedBy only if there are attachments
    if (task.attachments && Array.isArray(task.attachments) && task.attachments.length > 0) {
      populatePaths.push({ path: 'attachments.uploadedBy', select: 'firstName lastName email' })
    }

    // Wait for save to complete, then populate
    await savePromise

    // Use lean() for faster queries - returns plain JS objects instead of Mongoose documents
    const populatedTask = await Task.findById(task._id)
      .populate(populatePaths)
      .lean()
      .exec()

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

    // Determine base URL for notifications
    let baseUrl: string

    // First, check if NEXT_PUBLIC_APP_URL is explicitly set (recommended for all environments)
    if (process.env.NEXT_PUBLIC_APP_URL) {
      baseUrl = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '') // Remove trailing slash
    } else {
      // Fall back to detecting from request headers
      // When behind a proxy/load balancer, check x-forwarded-* headers first
      const forwardedHost = request.headers.get('x-forwarded-host')
      const forwardedProto = request.headers.get('x-forwarded-proto')
      
      // Get the host from various sources, prioritizing origin/referer headers for external URLs
      const originHeader = request.headers.get('origin')
      const refererHeader = request.headers.get('referer')
      const hostHeader = request.headers.get('host')
      
      // Extract host from origin or referer (these usually have the correct external domain)
      let extractedHost: string | null = null
      let extractedProtocol: string | null = null
      
      if (originHeader) {
        try {
          const originUrl = new URL(originHeader)
          extractedHost = originUrl.host
          extractedProtocol = originUrl.protocol.replace(':', '')
        } catch (e) {
          // Invalid origin, continue
        }
      }
      
      if (!extractedHost && refererHeader) {
        try {
          const refererUrl = new URL(refererHeader)
          extractedHost = refererUrl.host
          extractedProtocol = refererUrl.protocol.replace(':', '')
        } catch (e) {
          // Invalid referer, continue
        }
      }
      
      // Determine protocol
      let protocol: string
      if (extractedProtocol) {
        protocol = extractedProtocol
      } else if (forwardedProto) {
        protocol = forwardedProto.split(',')[0].trim() // Use first proto if multiple
      } else if (hostHeader?.includes('localhost') || hostHeader?.includes('127.0.0.1')) {
        protocol = 'http'
      } else {
        protocol = 'https' // Default to https for production domains
      }
      
      // Determine host - prefer extracted host from origin/referer, then forwarded host, then host header
      let host: string
      if (extractedHost && !extractedHost.includes('localhost') && !extractedHost.includes('127.0.0.1')) {
        // Use extracted host if it's a valid external domain
        host = extractedHost
      } else if (forwardedHost) {
        host = forwardedHost.split(',')[0].trim() // Use first host if multiple
      } else if (hostHeader) {
        host = hostHeader.replace(/^https?:\/\//, '') // Remove protocol if present
      } else {
        host = 'localhost:3000' // Fallback
        protocol = 'http'
      }
      
      // Clean up host (remove any protocol prefix, remove trailing slash, remove port if default)
      host = host.replace(/^https?:\/\//, '').replace(/\/$/, '')
      // Remove default ports
      host = host.replace(/^(.+):80$/, '$1')
      host = host.replace(/^(.+):443$/, '$1')
      
      baseUrl = `${protocol}://${host}`
      console.log('baseUrl from fallback logic:', baseUrl)
    }

    // Send notifications to all assignees except the creator (non-blocking - fire and forget)
    if (normalizedAssignedTo && normalizedAssignedTo.length > 0) {
      const assigneesToNotify = normalizedAssignedTo.filter(id => id.user !== userId)
      assigneesToNotify.forEach(assigneeId => {
      notificationService.notifyTaskUpdate(
        task._id.toString(),
        'assigned',
          assigneeId.user.toString(),
        user.organization,
        title,
        projectDoc?.name,
        baseUrl
      ).catch(notificationError => {
        console.error('Failed to send task assignment notification:', notificationError)
        // Don't fail the task creation if notification fails
        })
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