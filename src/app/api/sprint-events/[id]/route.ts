import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { SprintEvent } from '@/models/SprintEvent'
import { Sprint } from '@/models/Sprint'
import { authenticateUser } from '@/lib/auth-utils'
import { hasPermission } from '@/lib/permissions/permission-utils'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user } = authResult
    const userId = user.id

    console.log('Fetching sprint event:', { userId, eventId: params.id })

    // First, try to find the event without restrictions to check if it exists
    const rawEvent = await SprintEvent.findById(params.id)
    console.log('Raw event found:', rawEvent ? {
      _id: rawEvent._id,
      title: rawEvent.title,
      sprint: rawEvent.sprint, // Check raw sprint ObjectId
      attendees: rawEvent.attendees,
      attendeesLength: rawEvent.attendees?.length || 0,
      facilitator: rawEvent.facilitator,
      project: rawEvent.project
    } : 'No event found with this ID')

    // Check if the referenced sprint exists and fix data integrity issues
    if (rawEvent?.sprint) {
      const Sprint = (await import('@/models/Sprint')).Sprint
      const sprintExists = await Sprint.findById(rawEvent.sprint)
      console.log('Sprint reference check:', {
        eventSprintId: rawEvent.sprint,
        sprintExists: !!sprintExists,
        sprintData: sprintExists ? { name: sprintExists.name, status: sprintExists.status } : null
      })

      // If sprint doesn't exist, try to find the correct sprint for this project
      if (!sprintExists && rawEvent.project) {
        console.log('Sprint reference is invalid, trying to find correct sprint for project')
        const correctSprint = await Sprint.findOne({
          project: rawEvent.project,
          status: { $in: ['planning', 'active'] } // Look for active/planning sprints
        }).sort({ createdAt: -1 }) // Get the most recent one

        if (correctSprint) {
          console.log('Found correct sprint:', {
            _id: correctSprint._id,
            name: correctSprint.name,
            status: correctSprint.status
          })

          // Update the event with the correct sprint reference
          rawEvent.sprint = correctSprint._id
          await rawEvent.save()
          console.log('Updated event with correct sprint reference')
        } else {
          console.log('No suitable sprint found for this project')
        }
      }
    }

    if (!rawEvent) {
      return NextResponse.json({ error: 'Sprint event not found' }, { status: 404 })
    }

    // Check if user has permission to view all sprint events
    const hasSprintEventViewAll = await PermissionService.hasPermission(
      userId,
      Permission.SPRINT_EVENT_VIEW_ALL
    );

    console.log('User permissions:', {
      userId,
      hasSprintEventViewAll,
      isFacilitator: rawEvent.facilitator.toString() === userId,
      isAttendee: rawEvent.attendees?.includes(userId),
      eventId: params.id
    })

    // Check access permissions
    let hasAccess = hasSprintEventViewAll;

    if (!hasAccess) {
      // User can access if they are the facilitator OR an attendee
      hasAccess = rawEvent.facilitator.toString() === userId || rawEvent.attendees?.includes(userId);
      console.log('Access check:', {
        hasSprintEventViewAll,
        isFacilitator: rawEvent.facilitator.toString() === userId,
        isAttendee: rawEvent.attendees?.includes(userId),
        finalAccess: hasAccess
      })
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Insufficient permissions to view this sprint event' }, { status: 403 })
    }

    // Ensure facilitator is in attendees list (migration for existing events)
    if (rawEvent && !rawEvent.attendees?.includes(rawEvent.facilitator)) {
      console.log('Adding facilitator to attendees list for existing event')
      rawEvent.attendees = [...(rawEvent.attendees || []), rawEvent.facilitator]
      await rawEvent.save()
      console.log('Facilitator added to attendees')
    }

    // Now populate the event
    const sprintEvent = await SprintEvent.findById(params.id)
      .populate('sprint', 'name status')
      .populate('project', 'name')
      .populate('facilitator', 'firstName lastName email')
      .populate('attendees', 'firstName lastName email')

    console.log('Final Populated Sprint Event:', sprintEvent ? {
      _id: sprintEvent._id,
      title: sprintEvent.title,
      sprint: sprintEvent.sprint, // Check if sprint is populated
      project: sprintEvent.project, // Check if project is populated
      attendees: sprintEvent.attendees,
      attendeesLength: sprintEvent.attendees?.length || 0,
      facilitator: sprintEvent.facilitator
    } : 'Population failed')

    if (!sprintEvent) {
      return NextResponse.json({ error: 'Sprint event not found' }, { status: 404 })
    }

    // Check if user has access to this project
    const hasProjectAccess = await hasPermission(userId, Permission.PROJECT_READ, sprintEvent.project._id.toString())
    if (!hasProjectAccess) {
      return NextResponse.json({ error: 'Insufficient permissions to access this project' }, { status: 403 })
    }

    return NextResponse.json(sprintEvent)
  } catch (error) {
    console.error('Error fetching sprint event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const body = await req.json()
    const {
      title,
      description,
      scheduledDate,
      startTime,
      endTime,
      actualDate,
      duration,
      attendees,
      status,
      outcomes,
      location,
      meetingLink,
      attachments,
      notificationSettings
    } = body

    // Ensure facilitator is included in attendees when updating
    const attendeesWithFacilitator = Array.isArray(attendees) ? Array.from(new Set([...attendees, authResult.user.id])) : [authResult.user.id]

    
    const sprintEvent = await SprintEvent.findById(params.id)
    if (!sprintEvent) {
      return NextResponse.json({ error: 'Sprint event not found' }, { status: 404 })
    }

    // Check if user has permission to manage sprints for this project
    const hasAccess = await hasPermission(authResult.user.id, Permission.SPRINT_MANAGE, sprintEvent.project.toString())
    if (!hasAccess) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Update sprint event
    if (title !== undefined) sprintEvent.title = title
    if (description !== undefined) sprintEvent.description = description
    if (scheduledDate !== undefined) sprintEvent.scheduledDate = new Date(scheduledDate)
    if (startTime !== undefined) sprintEvent.startTime = startTime
    if (endTime !== undefined) sprintEvent.endTime = endTime
    if (actualDate !== undefined) sprintEvent.actualDate = actualDate ? new Date(actualDate) : undefined
    if (duration !== undefined) sprintEvent.duration = duration
    if (attendees !== undefined) sprintEvent.attendees = attendeesWithFacilitator
    if (status !== undefined) sprintEvent.status = status
    if (outcomes !== undefined) sprintEvent.outcomes = outcomes
    if (location !== undefined) sprintEvent.location = location
    if (meetingLink !== undefined) sprintEvent.meetingLink = meetingLink
    if (attachments !== undefined) {
      sprintEvent.attachments = attachments.map((att: any) => ({
        ...att,
        uploadedBy: att.uploadedBy || authResult.user.id,
        uploadedAt: att.uploadedAt ? new Date(att.uploadedAt) : new Date()
      }))
    }
    if (notificationSettings !== undefined) sprintEvent.notificationSettings = notificationSettings

    await sprintEvent.save()

    console.log('Update - After save, raw attendees in DB:', sprintEvent.attendees)

    const updatedEvent = await SprintEvent.findById(params.id)
      .populate('sprint', 'name status')
      .populate('project', 'name')
      .populate('facilitator', 'firstName lastName email')
      .populate('attendees', 'firstName lastName email')

    console.log('Update - After populate, attendees count:', updatedEvent?.attendees?.length || 0)
    console.log('Update - Populated attendees:', updatedEvent?.attendees?.map((a: any) => ({
      _id: a._id,
      name: `${a.firstName} ${a.lastName}`,
      email: a.email
    })))

    return NextResponse.json(updatedEvent)
  } catch (error) {
    console.error('Error updating sprint event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const body = await req.json()
    const sprintEvent = await SprintEvent.findById(params.id)
    if (!sprintEvent) {
      return NextResponse.json({ error: 'Sprint event not found' }, { status: 404 })
    }

    // Check if user has permission to manage sprints for this project
    const hasAccess = await hasPermission(authResult.user.id, Permission.SPRINT_MANAGE, sprintEvent.project.toString())
    if (!hasAccess) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Update only provided fields
    Object.keys(body).forEach(key => {
      if (key === 'scheduledDate' || key === 'actualDate') {
        sprintEvent[key] = body[key] ? new Date(body[key]) : undefined
      } else if (key === 'attachments' && body[key]) {
        sprintEvent.attachments = body[key].map((att: any) => ({
          ...att,
          uploadedBy: att.uploadedBy || authResult.user.id,
          uploadedAt: att.uploadedAt ? new Date(att.uploadedAt) : new Date()
        }))
      } else if (key === 'attendees' && body[key] !== undefined) {
        // Ensure facilitator is included in attendees when updating attendees
        const attendeesWithFacilitator = Array.isArray(body[key]) ? Array.from(new Set([...body[key], authResult.user.id])) : [authResult.user.id]
        sprintEvent[key] = attendeesWithFacilitator
      } else if (body[key] !== undefined) {
        sprintEvent[key] = body[key]
      }
    })

    await sprintEvent.save()

    console.log('PATCH - After save, raw attendees in DB:', sprintEvent.attendees)

    const updatedEvent = await SprintEvent.findById(params.id)
      .populate('sprint', 'name status')
      .populate('project', 'name')
      .populate('facilitator', 'firstName lastName email')
      .populate('attendees', 'firstName lastName email')

    console.log('PATCH - After populate, attendees count:', updatedEvent?.attendees?.length || 0)
    console.log('PATCH - Populated attendees:', updatedEvent?.attendees?.map((a: any) => ({
      _id: a._id,
      name: `${a.firstName} ${a.lastName}`,
      email: a.email
    })))

    return NextResponse.json(updatedEvent)
  } catch (error) {
    console.error('Error updating sprint event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const sprintEvent = await SprintEvent.findById(params.id)
    if (!sprintEvent) {
      return NextResponse.json({ error: 'Sprint event not found' }, { status: 404 })
    }

    // Check if user has permission to manage sprints for this project
    const hasAccess = await hasPermission(authResult.user.id, Permission.SPRINT_MANAGE, sprintEvent.project.toString())
    if (!hasAccess) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    await SprintEvent.findByIdAndDelete(params.id)

    return NextResponse.json({ message: 'Sprint event deleted successfully' })
  } catch (error) {
    console.error('Error deleting sprint event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
