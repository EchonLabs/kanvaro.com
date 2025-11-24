import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'
import { Story } from '@/models/Story'
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

    // Calculate progress & velocity for each sprint using linked tasks/stories
    const sprintsWithProgress = await Promise.all(
      sprints.map(async (sprint) => {
        const sprintId = (sprint as any)._id.toString()
        const sprintTaskIds = sprint.tasks || []

        // Find all tasks currently associated with this sprint
        const tasks = await Task.find({
          $or: [
            { _id: { $in: sprintTaskIds } },
            { sprint: sprintId }
          ],
          organization: organizationId,
          archived: { $ne: true }
        }).select('status storyPoints').lean()

        const totalTasks = tasks.length
        // Consider tasks with status 'done' or 'completed' as completed
        const tasksCompleted = tasks.filter(
          task => task.status === 'done' || task.status === 'completed'
        ).length
        
        const completionPercentage = totalTasks > 0 
          ? Math.round((tasksCompleted / totalTasks) * 100) 
          : 0

        // Use stories assigned to the sprint (stories hold story points)
        const projectId =
          typeof sprint.project === 'object' && sprint.project !== null
            ? (sprint.project as any)._id
            : sprint.project

        const storyFilters: Record<string, any> = {
          sprint: sprintId,
          archived: { $ne: true }
        }
        if (projectId) {
          storyFilters.project = projectId
        }

        const stories = await Story.find(storyFilters)
          .select('status storyPoints')
          .lean()

        const doneStoryStatuses = new Set(['done', 'completed'])

        const totalStoryPoints = stories.reduce((sum, story) => {
          return sum + (story.storyPoints || 0)
        }, 0)

        const storyPointsCompleted = stories
          .filter(story => doneStoryStatuses.has((story.status || '').toLowerCase()))
          .reduce((sum, story) => {
            return sum + (story.storyPoints || 0)
          }, 0)

        const storyPointsCompletionPercentage =
          totalStoryPoints > 0 ? Math.round((storyPointsCompleted / totalStoryPoints) * 100) : 0

        return {
          ...sprint,
          velocity: storyPointsCompleted,
          progress: {
            completionPercentage,
            tasksCompleted,
            totalTasks,
            storyPointsCompleted,
            totalStoryPoints,
            storyPointsCompletionPercentage
          },
        }
      })
    )

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