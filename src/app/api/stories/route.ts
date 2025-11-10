import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Story } from '@/models/Story'
import { Project } from '@/models/Project'
import { Epic } from '@/models/Epic'
import { User } from '@/models/User'
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
    const projectId = searchParams.get('projectId')
    const epicId = searchParams.get('epicId')
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const sprintId = searchParams.get('sprintId')

    // Build filters
    const filters: any = {}
    
    if (projectId) {
      filters.project = projectId
    }
    
    if (epicId) {
      filters.epic = epicId
    }
    
    if (status) {
      filters.status = status
    }
    
    if (priority) {
      filters.priority = priority
    }
    
    if (sprintId) {
      filters.sprint = sprintId
    }

    const stories = await Story.find(filters)
      .populate('project', 'name')
      .populate('epic', 'title')
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .populate('sprint', 'name')
      .sort({ createdAt: -1 })

    return NextResponse.json({
      success: true,
      data: stories
    })

  } catch (error) {
    console.error('Get stories error:', error);
    if (error instanceof Error && error.stack) {
      console.error('Stack:', error.stack);
    }
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
      title,
      description,
      acceptanceCriteria,
      project,
      epic,
      assignedTo,
      priority,
      storyPoints,
      estimatedHours,
      sprint,
      startDate,
      dueDate,
      tags
    } = await request.json()

    // Validate required fields
    if (!title || !project) {
      return NextResponse.json(
        { error: 'Title and project are required' },
        { status: 400 }
      )
    }

    // Verify project exists and user has access
    const projectDoc = await Project.findOne({
      _id: project,
      organization: organizationId,
      $or: [
        { createdBy: userId },
        { teamMembers: userId }
      ]
    })

    if (!projectDoc) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      )
    }

    // Verify epic exists if provided
    if (epic) {
      const epicDoc = await Epic.findOne({
        _id: epic,
        project: project
      })

      if (!epicDoc) {
        return NextResponse.json(
          { error: 'Epic not found' },
          { status: 404 }
        )
      }
    }

    // Create story
    const story = new Story({
      title,
      description,
      acceptanceCriteria: acceptanceCriteria || [],
      project,
      epic,
      createdBy: userId,
      assignedTo,
      priority: priority || 'medium',
      storyPoints,
      estimatedHours,
      sprint,
      startDate: startDate ? new Date(startDate) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      tags: tags || []
    })

    await story.save()

    // Populate the created story
    const populatedStory = await Story.findById(story._id)
      .populate('project', 'name')
      .populate('epic', 'title')
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .populate('sprint', 'name')

    return NextResponse.json({
      success: true,
      message: 'Story created successfully',
      data: populatedStory
    })

  } catch (error) {
    console.error('Create story error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
