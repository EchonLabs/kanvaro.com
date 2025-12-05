import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import mongoose from 'mongoose'
import { Story } from '@/models/Story'
import { Project } from '@/models/Project'
import { Epic } from '@/models/Epic'
import { User } from '@/models/User'
import { Sprint } from '@/models/Sprint'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

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

    // Check if user has permission to view all stories
    const hasStoryViewAll = await PermissionService.hasPermission(
      userId,
      Permission.STORY_VIEW_ALL
    );

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const epicId = searchParams.get('epicId')
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const sprintId = searchParams.get('sprintId')

    // Build filters
    const filters: any = {}
    
    // If user doesn't have STORY_VIEW_ALL, restrict to stories they created or are assigned to
    if (!hasStoryViewAll) {
      filters.$or = [
        { createdBy: userId },
        { assignedTo: userId }
      ]
    }
    
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

    // Ensure Sprint model is registered
    // The import should register it, but in Next.js HMR we need to ensure it's available
    if (!mongoose.models.Sprint) {
      // Force import and registration
      const SprintModel = require('@/models/Sprint').Sprint
      // Access the model to ensure it's registered
      void SprintModel
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
    let epicDoc = null
    if (epic) {
      epicDoc = await Epic.findOne({
        _id: epic,
        project: project
      })

      if (!epicDoc) {
        return NextResponse.json(
          { error: 'Epic not found' },
          { status: 404 }
        )
      }

      // Validate story dueDate doesn't exceed epic dueDate
      if (dueDate && epicDoc.dueDate) {
        const storyDueDate = new Date(dueDate)
        const epicDueDate = new Date(epicDoc.dueDate)
        
        // Reset time to compare only dates
        storyDueDate.setHours(0, 0, 0, 0)
        epicDueDate.setHours(0, 0, 0, 0)
        
        if (storyDueDate > epicDueDate) {
          return NextResponse.json(
            { error: 'Story Due Date cannot be later than the selected Epic\'s Due Date.' },
            { status: 400 }
          )
        }
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

    // Ensure Sprint model is registered
    if (!mongoose.models.Sprint) {
      const SprintModel = require('@/models/Sprint').Sprint
      void SprintModel
    }

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
