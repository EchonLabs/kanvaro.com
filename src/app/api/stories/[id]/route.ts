import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Story } from '@/models/Story'
import { authenticateUser } from '@/lib/auth-utils'

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

    // Find story (allow any organization member to view)
    const story = await Story.findOne({
      _id: storyId,
    })
      .populate('project', 'name')
      .populate('epic', 'name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate('sprint', 'name')

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
      .populate('epic', 'name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate('sprint', 'name')

    if (!story) {
      return NextResponse.json(
        { error: 'Story not found or unauthorized' },
        { status: 404 }
      )
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
