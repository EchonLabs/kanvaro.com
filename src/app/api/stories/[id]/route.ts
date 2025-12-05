import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Story } from '@/models/Story'
import { Epic } from '@/models/Epic'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('inside story get');

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
    const storyId = params.id

    // Check if user has permission to view all stories
    const hasStoryViewAll = await PermissionService.hasPermission(
      userId,
      Permission.STORY_VIEW_ALL
    );

    // Build query - if user has STORY_VIEW_ALL, they can view any story
    const storyQuery: any = {
      _id: storyId,
    };
    
    if (!hasStoryViewAll) {
      storyQuery.$or = [
        { createdBy: userId },
        { assignedTo: userId }
      ];
    }

    const story = await Story.findOne(storyQuery)
      .populate('project', 'name')
      .populate({
        path: 'epic',
        select: 'title description status priority dueDate tags project createdBy',
        populate: [
          { path: 'project', select: 'name' },
          { path: 'createdBy', select: 'firstName lastName email' }
        ]
      })
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate({
        path: 'sprint',
        select: 'name description status startDate endDate goal project',
        populate: [
          { path: 'project', select: 'name' }
        ]
      })

    if (!story) {
      return NextResponse.json(
        { error: 'Story not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: story
    })

  } catch (error) {
    console.error('Get story error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const storyId = params.id

    const updateData = await request.json()

    // Find and update story
    const story = await Story.findOneAndUpdate(
      {
        _id: storyId,
      },
      updateData,
      { new: true }
    )
      .populate('project', 'name')
      .populate({
        path: 'epic',
        select: 'title description status priority dueDate tags project createdBy',
        populate: [
          { path: 'project', select: 'name' },
          { path: 'createdBy', select: 'firstName lastName email' }
        ]
      })
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate({
        path: 'sprint',
        select: 'name description status startDate endDate goal project',
        populate: [
          { path: 'project', select: 'name' }
        ]
      })

    if (!story) {
      return NextResponse.json(
        { error: 'Story not found or unauthorized' },
        { status: 404 }
      )
    }

    // If this story belongs to an epic, check if epic should be completed
    // Use the completion service to ensure consistent logic
    if (story.epic) {
      const { CompletionService } = await import('@/lib/completion-service')
      CompletionService.checkEpicCompletion(story.epic.toString()).catch(error => {
        console.error('Error checking epic completion:', error)
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Story updated successfully',
      data: story
    })

  } catch (error) {
    console.error('Update story error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const storyId = params.id

    // Find and delete story (only creator can delete)
    const story = await Story.findOneAndDelete({
      _id: storyId,
      createdBy: userId
    })

    if (!story) {
      return NextResponse.json(
        { error: 'Story not found or unauthorized' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Story deleted successfully'
    })

  } catch (error) {
    console.error('Delete story error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
