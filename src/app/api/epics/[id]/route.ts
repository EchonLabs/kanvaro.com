import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Epic } from '@/models/Epic'
import { Story } from '@/models/Story'
import { Project } from '@/models/Project'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { pickFields, rejectUnlessProjectMoveAllowed } from '@/lib/api/update-fields'

/** Epic fields a client may change (F7). createdBy and completedAt stay server-side. */
const EPIC_EDITABLE_FIELDS = [
  'title', 'description', 'project', 'assignedTo', 'status', 'priority',
  'storyPoints', 'estimatedHours', 'actualHours', 'startDate', 'dueDate',
  'tags', 'attachments', 'archived'
] as const

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

    const hasEpicViewAll = await PermissionService.hasPermission(
      userId.toString(),
      Permission.EPIC_VIEW_ALL
    );

    const epic = await Epic.findOne({ _id: epicId })
      .populate('project', 'name startDate endDate')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')

    if (!epic) {
      return NextResponse.json(
        { error: 'Epic not found' },
        { status: 404 }
      )
    }

    if (!hasEpicViewAll) {
      const projectId = (epic.project as any)?._id?.toString() || epic.project?.toString?.()

      if (!projectId) {
        return NextResponse.json(
          { error: 'You do not have permission to view this epic' },
          { status: 403 }
        )
      }

      const hasProjectAccess = await Project.exists({
        _id: projectId,
        organization: organizationId,
        'teamMembers.memberId': userId
      })

      if (!hasProjectAccess) {
        return NextResponse.json(
          { error: 'You do not have permission to view this epic' },
          { status: 403 }
        )
      }
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

    // F7: only fields a client may edit (the body used to go straight to the database).
    const updateData = pickFields(await request.json(), EPIC_EDITABLE_FIELDS)

    const existingEpic = await Epic.findById(epicId)
      .populate('project', 'name organization')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')

    const epicOrganization = (existingEpic?.project as any)?.organization
    if (!existingEpic || (epicOrganization && String(epicOrganization) !== String(organizationId))) {
      return NextResponse.json(
        { error: 'Epic not found or unauthorized' },
        { status: 404 }
      )
    }

    const isCreator = existingEpic.createdBy?.toString?.() === userId.toString()

    const canEditEpic = isCreator || await PermissionService.hasPermission(
      userId.toString(),
      Permission.EPIC_EDIT,
      existingEpic.project._id?.toString()
    )
console.log('canEditEpic',canEditEpic);

    if (!canEditEpic) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this epic' },
        { status: 403 }
      )
    }

    // Moving the epic to another project: the target must be one the caller can access.
    const currentProjectId = (existingEpic.project as any)?._id?.toString()
    if (updateData.project !== undefined && String(updateData.project) !== currentProjectId) {
      const moveDenied = await rejectUnlessProjectMoveAllowed({
        requestedProjectId: updateData.project,
        currentProjectId,
        organizationId,
        permissions: await PermissionService.getUserPermissions(userId)
      })
      if (moveDenied) return moveDenied
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
