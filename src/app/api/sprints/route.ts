import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
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
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''

    // Build filters (Sprint schema has no 'organization' field)
    const filters: any = {
      archived: false,
    }

    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ]
    }

    if (status) {
      filters.status = status
    }

    // Query sprints created by the user (like "My Sprints"). Optionally scope by project.
    const sprintQueryFilters: any = {
      ...filters,
      createdBy: userId,
    }
    const projectFilter = searchParams.get('project')
    if (projectFilter) {
      sprintQueryFilters.project = projectFilter
    }

    const PAGE_SIZE = Math.min(limit, 100)

    // Fetch sprints
    const sprints = await Sprint.find(sprintQueryFilters)
      .populate('project', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('teamMembers', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean()

    // Count total for pagination
    const total = await Sprint.countDocuments(sprintQueryFilters)

    // Add placeholder progress stats for now
    const sprintsWithProgress = sprints.map((sprint) => ({
      ...sprint,
      progress: {
        completionPercentage: 0,
        tasksCompleted: 0,
        totalTasks: 0,
        storyPointsCompleted: 0,
        totalStoryPoints: 0,
      },
    }))

    // ✅ Unified JSON response structure (same as /api/tasks)
    return NextResponse.json({
      success: true,
      data: sprintsWithProgress,
      pagination: {
        page,
        limit: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    })
  } catch (error) {
    console.error('Get sprints error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
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
    const organizationId = user.organization

    const {
      name,
      description,
      project,
      startDate,
      endDate,
      goal,
      capacity,
      teamMembers = []
    } = await request.json()

    // Validate required fields
    if (!name || !project || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Name, project, start date, and end date are required' },
        { status: 400 }
      )
    }

    // Create sprint
    const sprint = new Sprint({
      name,
      description,
      status: 'planning',
      organization: organizationId,
      project,
      createdBy: userId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      goal: goal || '',
      capacity: capacity || 0,
      velocity: 0,
      teamMembers: Array.isArray(teamMembers) ? teamMembers : []
    })

    await sprint.save()

    // Populate the created sprint
    const populatedSprint = await Sprint.findById(sprint._id)
      .populate('project', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('teamMembers', 'firstName lastName email')

    return NextResponse.json({
      success: true,
      message: 'Sprint created successfully',
      data: populatedSprint
    })

  } catch (error) {
    console.error('Create sprint error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}