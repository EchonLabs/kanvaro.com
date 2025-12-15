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

    const existingStory = await Story.findById(storyId)
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

    if (!existingStory) {
      return NextResponse.json(
        { error: 'Story not found or unauthorized' },
        { status: 404 }
      )
    }

    const isCreator = existingStory.createdBy?._id?.toString?.() === userId.toString()
    const canEditStory = isCreator || await PermissionService.hasPermission(
      userId.toString(),
      Permission.STORY_UPDATE
    )

    if (!canEditStory) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this story' },
        { status: 403 }
      )
    }

    const story = await Story.findByIdAndUpdate(
      storyId,
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

    const story = await Story.findById(storyId)

    if (!story) {
      return NextResponse.json(
        { error: 'Story not found or unauthorized' },
        { status: 404 }
      )
    }

    const isCreator = story.createdBy?.toString?.() === userId.toString()
    const canDeleteStory = isCreator || await PermissionService.hasPermission(
      userId,
      Permission.STORY_DELETE
    )

    if (!canDeleteStory) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this story' },
        { status: 403 }
      )
    }

    await Story.findByIdAndDelete(storyId)

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
