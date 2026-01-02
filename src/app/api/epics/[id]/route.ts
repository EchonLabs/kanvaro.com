import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Epic } from '@/models/Epic'
import { Story } from '@/models/Story'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

export async function GET(
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
    const epicId = params.id

    const canViewEpic = await PermissionService.hasAnyPermission(
      userId.toString(),
      [Permission.EPIC_VIEW, Permission.EPIC_READ, Permission.EPIC_VIEW_ALL]
    );
    const hasEpicViewAll = await PermissionService.hasPermission(
      userId.toString(),
      Permission.EPIC_VIEW_ALL
    );

    // Build query - if user has EPIC_VIEW_ALL, they can view any epic
    const epicQuery: any = { _id: epicId };
    
    if (!hasEpicViewAll) {
      epicQuery.$or = [
        { createdBy: userId },
        { assignedTo: userId }
      ];
    }

    const epic = await Epic.findOne(epicQuery)
      .populate('project', 'name startDate endDate')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')

    if (!epic) {
      return NextResponse.json(
        { error: 'Epic not found' },
        { status: 404 }
      )
    }

    const stories = await Story.find({
      epic: epicId,
      archived: { $ne: true }
    })
      .select('status storyPoints')
      .lean()

    const storyStats = stories.reduce((stats, story) => {
      const storyPoints = typeof story.storyPoints === 'number' ? story.storyPoints : 0
      stats.totalStories += 1
      stats.totalStoryPoints += storyPoints
      const isCompleted = ['done', 'completed'].includes(story.status)
      if (isCompleted) {
        stats.storiesCompleted += 1
        stats.storyPointsCompleted += storyPoints
      }
      return stats
    }, {
      totalStories: 0,
      storiesCompleted: 0,
      totalStoryPoints: 0,
      storyPointsCompleted: 0
    })

    const completionPercentage = storyStats.totalStories > 0
      ? Math.round((storyStats.storiesCompleted / storyStats.totalStories) * 100)
      : 0

    const epicData = {
      ...epic.toObject(),
      progress: {
        completionPercentage,
        storiesCompleted: storyStats.storiesCompleted,
        totalStories: storyStats.totalStories,
        storyPointsCompleted: storyStats.storyPointsCompleted,
        totalStoryPoints: storyStats.totalStoryPoints
      }
    }

    return NextResponse.json({
      success: true,
      data: epicData
    })

  } catch (error) {
    console.error('Get epic error:', error)
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
    const epicId = params.id

    const updateData = await request.json()

    const existingEpic = await Epic.findById(epicId)
      .populate('project', 'name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')

    if (!existingEpic) {
      return NextResponse.json(
        { error: 'Epic not found or unauthorized' },
        { status: 404 }
      )
    }

    const isCreator = existingEpic.createdBy?._id?.toString?.() === userId.toString()

    const canEditEpic = isCreator || await PermissionService.hasPermission(
      userId.toString(),
      Permission.EPIC_EDIT
    )
    
    if (!canEditEpic) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this epic' },
        { status: 403 }
      )
    }

    const epic = await Epic.findByIdAndUpdate(
      epicId,
      updateData,
      { new: true }
    )
      .populate('project', 'name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')

    return NextResponse.json({
      success: true,
      message: 'Epic updated successfully',
      data: epic
    })

  } catch (error) {
    console.error('Update epic error:', error)
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
    const epicId = params.id

    const epic = await Epic.findById(epicId)

    if (!epic) {
      return NextResponse.json(
        { error: 'Epic not found or unauthorized' },
        { status: 404 }
      )
    }

    const isCreator = epic.createdBy?.toString() === userId.toString()
    const canDeleteEpic = isCreator || await PermissionService.hasPermission(
      userId.toString(),
      Permission.EPIC_DELETE,
      epic.project.toString()
    )

    if (!canDeleteEpic) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this epic' },
        { status: 403 }
      )
    }

    await Epic.findByIdAndDelete(epicId)

    return NextResponse.json({
      success: true,
      message: 'Epic deleted successfully'
    })

  } catch (error) {
    console.error('Delete epic error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
