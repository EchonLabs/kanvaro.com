import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Epic } from '@/models/Epic'
import { Story } from '@/models/Story'
import { authenticateUser } from '@/lib/auth-utils'

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

    // Fetch epic by id only (visibility/auth policy relaxed for GET by id)
    const epic = await Epic.findById(epicId)
      .populate('project', 'name')
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

    // Update epic by id only (visibility/auth policy relaxed for PUT by id)
    const epic = await Epic.findByIdAndUpdate(
      epicId,
      updateData,
      { new: true }
    )
      .populate('project', 'name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')

    if (!epic) {
      return NextResponse.json(
        { error: 'Epic not found or unauthorized' },
        { status: 404 }
      )
    }

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

    // Delete epic by id only (visibility/auth policy relaxed for DELETE by id)
    const epic = await Epic.findByIdAndDelete(epicId)

    if (!epic) {
      return NextResponse.json(
        { error: 'Epic not found or unauthorized' },
        { status: 404 }
      )
    }

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
