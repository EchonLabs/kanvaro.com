import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'
import { authenticateUser } from '@/lib/auth-utils'

export async function POST(
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
    const organizationId = user.organization
    const sprintId = params.id
console.log('sprintId', sprintId);
console.log('organizationId', organizationId);

    if (!sprintId) {
      return NextResponse.json(
        { error: 'Sprint ID is required' },
        { status: 400 }
      )
    }

    const sprint = await Sprint.findById(sprintId)
    if (!sprint) {
      return NextResponse.json(
        { error: 'Sprint not found' },
        { status: 404 }
      )
    }
    if (!sprint.organization) {
      console.warn('[Sprint Start] Sprint missing organization, assigning current org', { sprintId })
      sprint.organization = organizationId
      await sprint.save()
    } else if (sprint.organization.toString() !== organizationId.toString()) {
      return NextResponse.json(
        { error: 'Unauthorized to start this sprint' },
        { status: 403 }
      )
    }

    if (sprint.status !== 'planning') {
      return NextResponse.json(
        { error: 'Only sprints in planning can be started' },
        { status: 400 }
      )
    }

    const now = new Date()
    sprint.status = 'active'
    sprint.actualStartDate = now
    await sprint.save()

    await Task.updateMany(
      { sprint: sprintId, archived: { $ne: true } },
      { status: 'todo', startDate: now }
    )

    const updatedSprint = await Sprint.findById(sprintId)
      .populate('project', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('teamMembers', 'firstName lastName email')

    return NextResponse.json({
      success: true,
      message: 'Sprint started successfully',
      data: updatedSprint
    })
  } catch (error) {
    console.error('Start sprint error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

