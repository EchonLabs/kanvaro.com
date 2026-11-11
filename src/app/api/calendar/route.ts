import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Task } from '@/models/Task'
import { Sprint } from '@/models/Sprint'
import { authenticateUser } from '@/lib/auth-utils'

export async function GET(request: NextRequest) {
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
    const organizationId = user.organization

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const type = searchParams.get('type') || ''

    // Build date filter
    const dateFilter: any = {}
    if (startDate) {
      dateFilter.$gte = new Date(startDate)
    }
    if (endDate) {
      dateFilter.$lte = new Date(endDate)
    }

    // Get calendar events from tasks and sprints
    const [tasks, sprints] = await Promise.all([
      Task.find({
        organization: organizationId,
        $or: [
          { 'assignedTo.user': userId },
          { createdBy: userId }
        ],
        ...(Object.keys(dateFilter).length > 0 && { dueDate: dateFilter })
      })
        .populate('project', 'name')
        .populate('assignedTo.user', 'firstName lastName email')
        .populate('createdBy', 'firstName lastName email')
        .sort({ dueDate: 1 })
        .lean(),
      
      Sprint.find({
        organization: organizationId,
        $or: [
          { createdBy: userId },
          { teamMembers: userId }
        ],
        ...(Object.keys(dateFilter).length > 0 && { 
          $or: [
            { startDate: dateFilter },
            { endDate: dateFilter }
          ]
        })
      })
        .populate('project', 'name')
        .populate('createdBy', 'firstName lastName email')
        .populate('teamMembers', 'firstName lastName email')
        .sort({ startDate: 1 })
    ])

    // Format tasks as calendar events
    const taskEvents = tasks.map(task => ({
      _id: task._id,
      title: task.title,
      description: task.description,
      type: 'task',
      status: task.status === 'todo' ? 'scheduled' :
              task.status === 'in_progress' ? 'in_progress' :
              task.status === 'done' ? 'completed' : 'scheduled',
      priority: task.priority,
      startDate: task.dueDate || task.createdAt,
      endDate: task.dueDate,
      project: task.project,
      assignedTo: task.assignedTo,
      createdBy: task.createdBy,
      labels: task.labels,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    }))

    // Format sprints as calendar events
    const sprintEvents = sprints.map(sprint => ({
      _id: sprint._id,
      title: sprint.name,
      description: sprint.description,
      type: 'sprint',
      status: sprint.status === 'planning' ? 'scheduled' :
              sprint.status === 'active' ? 'in_progress' :
              sprint.status === 'completed' ? 'completed' : 'scheduled',
      priority: 'medium',
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      project: sprint.project,
      assignedTo: null,
      createdBy: sprint.createdBy,
      labels: [],
      createdAt: sprint.createdAt,
      updatedAt: sprint.updatedAt
    }))

    // Combine all events
    const allEvents = [...taskEvents, ...sprintEvents]

    // Filter by type if specified
    const filteredEvents = type ? allEvents.filter(event => event.type === type) : allEvents

    return NextResponse.json({
      success: true,
      data: filteredEvents
    })

  } catch (error) {
    console.error('Get calendar events error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
