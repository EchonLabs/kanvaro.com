import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Story } from '@/models/Story'
import { Epic } from '@/models/Epic'
import { Project } from '@/models/Project'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { Sprint } from '@/models/Sprint'
import {
  pickFields,
  refId,
  rejectLinksOutsideProject,
  rejectUnlessProjectMoveAllowed
} from '@/lib/api/update-fields'

/** Story fields a client may change (F7). createdBy and completedAt stay server-side. */
const STORY_EDITABLE_FIELDS = [
  'title', 'description', 'acceptanceCriteria', 'project', 'epic', 'assignedTo',
  'status', 'priority', 'storyPoints', 'estimatedHours', 'actualHours', 'sprint',
  'startDate', 'dueDate', 'tags', 'attachments', 'archived'
] as const

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

    // Optimize population to only fetch what's needed for the UI
    const story = await Story.findOne({ _id: storyId })
      .populate('project', '_id name') // Include _id for permission checks
      .populate({
        path: 'epic',
        select: '_id title description status priority dueDate tags project createdBy',
        populate: [
          { path: 'project', select: '_id name' },
          { path: 'createdBy', select: '_id firstName lastName email' }
        ]
      })
      .populate('assignedTo', '_id firstName lastName email') // Include _id for permission checks
      .populate('createdBy', '_id firstName lastName email') // Include _id for permission checks
      .populate({
        path: 'sprint',
        select: '_id name description status startDate endDate goal project',
        populate: [
          { path: 'project', select: '_id name' }
        ]
      })
      .lean() // Use lean for better performance

    if (!story) {
      return NextResponse.json(
        { error: 'Story not found' },
        { status: 404 }
      )
    }

    if (!hasStoryViewAll) {
      const projectId = (story.project as any)?._id?.toString() || story.project?.toString()

      if (!projectId) {
        return NextResponse.json(
          { error: 'You do not have permission to view this story' },
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
          { error: 'You do not have permission to view this story' },
          { status: 403 }
        )
      }
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

    // F7: only fields a client may edit; the body used to go straight to
    // findByIdAndUpdate, so createdBy, completedAt or anything else could be set.
    const updateData = pickFields(await request.json(), STORY_EDITABLE_FIELDS)

    // Only fetch essential data for permission check and update validation
    const existingStory = await Story.findById(storyId)
      .populate('project', '_id organization')
      .populate('createdBy', '_id')

    const storyOrganization = (existingStory?.project as any)?.organization
    if (!existingStory || (storyOrganization && String(storyOrganization) !== String(organizationId))) {
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

    // Moving the story to another project: the target must be one the caller can access.
    const currentProjectId = (existingStory.project as any)?._id?.toString()
    if (updateData.project !== undefined && String(updateData.project) !== currentProjectId) {
      const moveDenied = await rejectUnlessProjectMoveAllowed({
        requestedProjectId: updateData.project,
        currentProjectId,
        organizationId,
        permissions: await PermissionService.getUserPermissions(userId)
      })
      if (moveDenied) return moveDenied
    }

    // The story's epic and sprint must be in the story's project. Only links
    // this request adds or changes are checked (all submitted ones on a move).
    const effectiveProjectId = refId(updateData.project) || currentProjectId || ''
    const projectChanges = effectiveProjectId !== currentProjectId
    const changedLink = (field: 'epic' | 'sprint') => {
      if (!Object.prototype.hasOwnProperty.call(updateData, field)) return []
      const next = refId(updateData[field])
      return next && (projectChanges || next !== refId((existingStory as any)[field])) ? [next] : []
    }
    const linkDenied = await rejectLinksOutsideProject(effectiveProjectId, [
      { label: 'epic', model: Epic, ids: changedLink('epic') },
      { label: 'sprint', model: Sprint, ids: changedLink('sprint') }
    ])
    if (linkDenied) return linkDenied

    const story: any = await Story.findByIdAndUpdate(
      storyId,
      updateData,
      { new: true }
    )
      .populate('project', '_id name')
      .populate({
        path: 'epic',
        select: '_id title description status priority dueDate tags project createdBy',
        populate: [
          { path: 'project', select: '_id name' },
          { path: 'createdBy', select: '_id firstName lastName email' }
        ]
      })
      .populate('assignedTo', '_id firstName lastName email')
      .populate('createdBy', '_id firstName lastName email')
      .populate({
        path: 'sprint',
        select: '_id name description status startDate endDate goal project',
        populate: [
          { path: 'project', select: '_id name' }
        ]
      })
      .lean()

    // If this story belongs to an epic, check if epic should be completed
    // Use the completion service to ensure consistent logic
    if (story?.epic) {
      const { CompletionService } = await import('@/lib/completion-service')
      CompletionService.checkEpicCompletion(story?.epic.toString()).catch(error => {
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
