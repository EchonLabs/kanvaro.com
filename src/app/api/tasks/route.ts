import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Task } from '@/models/Task'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { notificationService } from '@/lib/notification-service'
import { cache, invalidateCache } from '@/lib/redis'
import crypto from 'crypto'
import { Counter } from '@/models/Counter'

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

    if (!canViewAllTasks) {
      filters.$or = [{ assignedTo: userId }, { createdBy: userId }];
    }

    if (search) {
      if (search.length >= 3) {
        filters.$text = { $search: search };
      } else {
        filters.$and = [
          {
            $or: [
              { title: { $regex: search, $options: 'i' } },
              { description: { $regex: search, $options: 'i' } },
            ],
          },
        ];
      }
    }

    if (status) filters.status = status;
    if (priority) filters.priority = priority;
    if (type) filters.type = type;
    if (project) filters.project = project;

    if (useCursorPagination && after) {
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
      labels
    } = await request.json()

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

    // Get the next position for this project/status combination
    const taskStatus = status || 'todo'
    const maxPosition = await Task.findOne(
      { project, status: taskStatus },
      { position: 1 }
    ).sort({ position: -1 })
    const nextPosition = maxPosition ? maxPosition.position + 1 : 0

    // Resolve project number and next task number for this project
    const projectDoc = await Project.findById(project).select('projectNumber organization')
    if (!projectDoc) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 400 }
      )
    }

    const taskCounter = await Counter.findOneAndUpdate(
      { scope: 'task', project: projectDoc._id },
      { $inc: { seq: 1 }, $setOnInsert: { updatedAt: new Date() } },
      { new: true, upsert: true }
    )
    const taskNumber = taskCounter.seq
    const displayId = `${projectDoc.projectNumber}.${taskNumber}`

    // Create task
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
      story: story || undefined,
      parentTask: parentTask || undefined,
      assignedTo: assignedTo || undefined,
      createdBy: userId,
      storyPoints: storyPoints || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      estimatedHours: estimatedHours || undefined,
      labels: labels || [],
      position: nextPosition
    })

    await task.save()

    // Invalidate tasks cache for this organization
    await invalidateCache(`tasks:*:org:${user.organization}:*`)

    // Populate the created task
    const populatedTask = await Task.findById(task._id)
      .populate('project', '_id name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate('story', 'title status')
      .populate('sprint', 'name status')
      .populate('parentTask', 'title')

    // Send notification if task is assigned to someone
    if (assignedTo && assignedTo !== userId) {
      try {
        const projectDoc = await Project.findById(project).select('name')
        const createdByUser = await User.findById(userId).select('firstName lastName')
        
        await notificationService.notifyTaskUpdate(
          task._id.toString(),
          'assigned',
          assignedTo,
          user.organization,
          title,
          projectDoc?.name
        )
      } catch (notificationError) {
        console.error('Failed to send task assignment notification:', notificationError)
        // Don't fail the task creation if notification fails
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Task created successfully',
      data: populatedTask
    })

  } catch (error) {
    console.error('Create task error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}