import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { SprintEvent } from '@/models/SprintEvent'
import { Sprint } from '@/models/Sprint'
import { authenticateUser } from '@/lib/auth-utils'
import { hasPermission } from '@/lib/permissions/permission-utils'
import { Permission } from '@/lib/permissions/permission-definitions'

export async function GET(req: NextRequest) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { searchParams } = new URL(req.url)
    const sprintId = searchParams.get('sprintId')
    const projectId = searchParams.get('projectId')
    const eventType = searchParams.get('eventType')
    const status = searchParams.get('status')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let query: any = {}
    
    if (sprintId) {
      query.sprint = sprintId
    }
    
    if (projectId) {
      // Check if user has access to this project
      const hasAccess = await hasPermission(authResult.user.id, Permission.PROJECT_READ, projectId)
      if (!hasAccess) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }
      query.project = projectId
    }

    if (eventType) {
      query.eventType = eventType
    }

    if (status) {
      query.status = status
    }

    if (startDate && endDate) {
      query.scheduledDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }

    const sprintEvents = await SprintEvent.find(query)
      .populate('sprint', 'name status')
      .populate('project', 'name')
      .populate('facilitator', 'firstName lastName email')
      .populate('attendees', 'firstName lastName email')
      .sort({ scheduledDate: 1 })

    return NextResponse.json(sprintEvents)
  } catch (error) {
    console.error('Error fetching sprint events:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const body = await req.json()
    const { 
      sprintId, 
      projectId, 
      eventType, 
      title, 
      description, 
      scheduledDate,
      startTime,
      endTime,
      duration, 
      status,
      attendees, 
      location, 
      meetingLink,
      attachments,
      notificationSettings
    } = body

    // Check if user has permission to manage sprints for this project
    const hasAccess = await hasPermission(authResult.user.id, Permission.SPRINT_MANAGE, projectId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Verify sprint exists and belongs to the project
    const sprint = await Sprint.findById(sprintId)
    if (!sprint) {
      return NextResponse.json({ error: 'Sprint not found' }, { status: 404 })
    }
    
    // Check if sprint belongs to the project
    // Handle both ObjectId and string comparison
    let sprintProjectId: string
    
    // Check if project is populated or is an ObjectId
    if (typeof sprint.project === 'object' && sprint.project !== null) {
      // Project is populated or is an object
      sprintProjectId = (sprint.project as any)._id 
        ? (sprint.project as any)._id.toString() 
        : sprint.project.toString()
    } else {
      // Project is an ObjectId
      sprintProjectId = sprint.project.toString()
    }
    
    const projectIdStr = projectId.toString()
    
    if (sprintProjectId !== projectIdStr) {
      console.error('Sprint project mismatch:', {
        sprintProjectId,
        projectIdStr,
        sprintId: sprint._id.toString(),
        sprintProjectType: typeof sprint.project
      })
      return NextResponse.json({ error: 'Sprint does not belong to the specified project' }, { status: 400 })
    }

    const sprintEvent = new SprintEvent({
      sprint: sprintId,
      project: projectId,
      eventType,
      title,
      description,
      scheduledDate: new Date(scheduledDate),
      startTime,
      endTime,
      duration,
      status: status || 'scheduled',
      attendees,
      facilitator: authResult.user.id,
      location,
      meetingLink,
      attachments: attachments?.map((att: any) => ({
        ...att,
        uploadedBy: authResult.user.id,
        uploadedAt: new Date()
      })),
      notificationSettings
    })

    await sprintEvent.save()

    const populatedEvent = await SprintEvent.findById(sprintEvent._id)
      .populate('sprint', 'name status')
      .populate('project', 'name')
      .populate('facilitator', 'firstName lastName email')
      .populate('attendees', 'firstName lastName email')

    return NextResponse.json(populatedEvent, { status: 201 })
  } catch (error) {
    console.error('Error creating sprint event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
