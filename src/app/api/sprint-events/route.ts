import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { SprintEvent } from '@/models/SprintEvent'
import { Sprint } from '@/models/Sprint'
import { User } from '@/models/User'
import { Project } from '@/models/Project'
import { authenticateUser } from '@/lib/auth-utils'
import { hasPermission } from '@/lib/permissions/permission-utils'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'
import { EmailService } from '@/lib/email/EmailService'

// Helper function to generate recurring event dates
function generateRecurringDates(
  startDate: Date,
  recurrence: {
    type: 'daily' | 'weekly' | 'monthly'
    interval: number
    endDate?: Date
    daysOfWeek?: number[]
    dayOfMonth?: number
    occurrences?: number
  }
): Date[] {
  const dates: Date[] = [new Date(startDate)]
  const maxOccurrences = recurrence.occurrences || 52 // Default max 52 occurrences (1 year for weekly)
  const maxDate = recurrence.endDate || new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000) // Default 1 year
  
  let currentDate = new Date(startDate)
  
  while (dates.length < maxOccurrences) {
    switch (recurrence.type) {
      case 'daily':
        currentDate = new Date(currentDate.getTime() + recurrence.interval * 24 * 60 * 60 * 1000)
        break
      case 'weekly':
        if (recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0) {
          // Find next occurrence based on days of week
          let found = false
          for (let i = 1; i <= 7 * recurrence.interval; i++) {
            const nextDate = new Date(currentDate.getTime() + i * 24 * 60 * 60 * 1000)
            if (recurrence.daysOfWeek.includes(nextDate.getDay())) {
              currentDate = nextDate
              found = true
              break
            }
          }
          if (!found) {
            currentDate = new Date(currentDate.getTime() + recurrence.interval * 7 * 24 * 60 * 60 * 1000)
          }
        } else {
          currentDate = new Date(currentDate.getTime() + recurrence.interval * 7 * 24 * 60 * 60 * 1000)
        }
        break
      case 'monthly':
        const dayOfMonth = recurrence.dayOfMonth || currentDate.getDate()
        const nextMonth = new Date(currentDate)
        nextMonth.setMonth(nextMonth.getMonth() + recurrence.interval)
        nextMonth.setDate(Math.min(dayOfMonth, new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate()))
        currentDate = nextMonth
        break
    }
    
    if (currentDate > maxDate) break
    dates.push(new Date(currentDate))
  }
  
  return dates
}

// Helper function to send event creation email to attendees
async function sendEventCreationEmails(
  event: any,
  attendees: any[],
  facilitator: any,
  projectName: string
) {
  try {
    const emailService = EmailService.getInstance()
    const eventDate = new Date(event.scheduledDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    const eventTime = event.startTime ? ` at ${event.startTime}` : ''
    
    const emailPromises = attendees.map(async (attendee: any) => {
      if (!attendee.email) return
      
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .event-card { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .event-title { font-size: 20px; font-weight: bold; color: #1a1a1a; margin-bottom: 15px; }
            .event-detail { display: flex; margin-bottom: 10px; }
            .event-label { font-weight: 600; color: #666; width: 120px; }
            .event-value { color: #333; }
            .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
            .footer { text-align: center; color: #888; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">📅 New Sprint Event Invitation</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">You've been invited to a sprint event</p>
            </div>
            <div class="content">
              <p>Hi ${attendee.firstName},</p>
              <p>You have been invited to attend a sprint event for the <strong>${projectName}</strong> project.</p>
              
              <div class="event-card">
                <div class="event-title">${event.title}</div>
                <div class="event-detail">
                  <span class="event-label">📆 Date:</span>
                  <span class="event-value">${eventDate}${eventTime}</span>
                </div>
                ${event.endTime ? `
                <div class="event-detail">
                  <span class="event-label">⏰ End Time:</span>
                  <span class="event-value">${event.endTime}</span>
                </div>
                ` : ''}
                ${event.duration ? `
                <div class="event-detail">
                  <span class="event-label">⏱️ Duration:</span>
                  <span class="event-value">${event.duration} minutes</span>
                </div>
                ` : ''}
                <div class="event-detail">
                  <span class="event-label">📋 Type:</span>
                  <span class="event-value">${event.eventType.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
                </div>
                <div class="event-detail">
                  <span class="event-label">👤 Facilitator:</span>
                  <span class="event-value">${facilitator.firstName} ${facilitator.lastName}</span>
                </div>
                ${event.location ? `
                <div class="event-detail">
                  <span class="event-label">📍 Location:</span>
                  <span class="event-value">${event.location}</span>
                </div>
                ` : ''}
                ${event.meetingLink ? `
                <div class="event-detail">
                  <span class="event-label">🔗 Meeting Link:</span>
                  <span class="event-value"><a href="${event.meetingLink}">${event.meetingLink}</a></span>
                </div>
                ` : ''}
                ${event.description ? `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                  <strong>Description:</strong>
                  <p style="margin: 10px 0 0 0; color: #555;">${event.description}</p>
                </div>
                ` : ''}
              </div>
              
              ${event.recurrence && event.recurrence.type !== 'none' ? `
              <p style="background: #fef3cd; padding: 10px; border-radius: 6px; border-left: 4px solid #ffc107;">
                <strong>🔄 Recurring Event:</strong> This event repeats ${event.recurrence.type}
                ${event.recurrence.interval > 1 ? ` every ${event.recurrence.interval} ${event.recurrence.type === 'daily' ? 'days' : event.recurrence.type === 'weekly' ? 'weeks' : 'months'}` : ''}
              </p>
              ` : ''}
              
              <p style="color: #666;">Please make sure to mark this on your calendar and be prepared for the event.</p>
              
              <div class="footer">
                <p>This is an automated message from Kanvaro Project Management</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
      
      await emailService.sendEmail({
        to: attendee.email,
        subject: `📅 Sprint Event: ${event.title} - ${eventDate}`,
        html: emailHtml
      })
    })
    
    await Promise.allSettled(emailPromises)
  } catch (error) {
    console.error('Error sending event creation emails:', error)
    // Don't throw - email sending failure shouldn't block event creation
  }
}

// Test endpoint to check sprint data
export async function HEAD(req: NextRequest) {
  try {
    await connectDB()

    // Check if we can find the specific sprint mentioned by user
    const Sprint = (await import('@/models/Sprint')).Sprint
    const testSprint = await Sprint.findById('694b864fa38e971b507ccc24')
    console.log('Test sprint lookup:', testSprint ? {
      _id: testSprint._id,
      name: testSprint.name,
      status: testSprint.status,
      project: testSprint.project
    } : 'Sprint not found')

    return new Response('Test completed - check console logs', { status: 200 })
  } catch (error) {
    console.error('Test endpoint error:', error)
    return new Response('Test failed', { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user } = authResult
    const userId = user.id

    // Check if user has permission to view all sprint events
    const hasSprintEventViewAll = await PermissionService.hasPermission(
      userId,
      Permission.SPRINT_EVENT_VIEW_ALL
    );

    const { searchParams } = new URL(req.url)
    const sprintId = searchParams.get('sprintId')
    const projectId = searchParams.get('projectId')
    const eventType = searchParams.get('eventType')
    const status = searchParams.get('status')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let query: any = {}
    
    // If user doesn't have SPRINT_EVENT_VIEW_ALL, restrict to events they created or are attendees
    if (!hasSprintEventViewAll) {
      query.$or = [
        { facilitator: userId },
        { attendees: userId }
      ]
    }
    
    if (sprintId) {
      query.sprint = sprintId
    }
    
    if (projectId) {
      // Check if user has access to this project
      const hasAccess = await hasPermission(userId, Permission.PROJECT_READ, projectId)
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

    // First get raw events to check sprint references
    const rawSprintEvents = await SprintEvent.find(query).sort({ createdAt: -1 })

    console.log('Raw sprint events before population:', rawSprintEvents.map(event => ({
      _id: event._id,
      title: event.title,
      sprint: event.sprint, // Raw ObjectId
      project: event.project
    })))

    const sprintEvents = await SprintEvent.find(query)
      .populate('sprint', 'name status')
      .populate('project', 'name')
      .populate('facilitator', 'firstName lastName email')
      .populate('attendees', 'firstName lastName email')
      .sort({ createdAt: -1 })

    // Debug sprint population and fix data integrity issues
    for (const event of sprintEvents) {
      console.log('Event sprint status:', {
        eventId: event._id,
        eventTitle: event.title,
        sprint: event.sprint,
        sprintType: typeof event.sprint,
        hasName: event.sprint?.name ? true : false
      })

      // If sprint is not populated (still an ObjectId or missing name), try to populate manually
      if (!event.sprint || (typeof event.sprint === 'object' && !event.sprint.name)) {
        const rawEvent = rawSprintEvents.find(re => re._id.toString() === event._id.toString())
        const sprintObjectId = rawEvent?.sprint

        console.log('Attempting manual sprint population:', {
          eventId: event._id,
          rawSprintId: sprintObjectId
        })

        if (sprintObjectId) {
          try {
            const Sprint = (await import('@/models/Sprint')).Sprint
            const sprintData = await Sprint.findById(sprintObjectId).select('name status')
            if (sprintData) {
              event.sprint = sprintData
              console.log('Successfully populated sprint:', {
                eventId: event._id,
                sprintName: sprintData.name,
                sprintStatus: sprintData.status
              })
            } else {
              console.log('Sprint not found in database:', sprintObjectId)
              // Try to find any sprint for this project as fallback
              if (event.project && typeof event.project === 'object' && event.project._id) {
                const fallbackSprint = await Sprint.findOne({
                  project: event.project._id,
                  status: { $in: ['planning', 'active'] }
                }).select('name status').sort({ createdAt: -1 })

                if (fallbackSprint) {
                  event.sprint = fallbackSprint
                  console.log('Used fallback sprint:', {
                    eventId: event._id,
                    sprintName: fallbackSprint.name
                  })
                }
              }
            }
          } catch (error) {
            console.error('Error during manual sprint population:', error)
          }
        }
      }
    }

    console.log('Sprint Events Final Results:', sprintEvents.map(event => ({
      _id: event._id,
      title: event.title,
      sprint: event.sprint, // Check if populated
      sprintName: event.sprint?.name || 'No sprint name',
      project: event.project?.name,
      sprintType: typeof event.sprint
    })))

    // Also log a summary
    const populatedCount = sprintEvents.filter(e => e.sprint?.name).length
    const totalCount = sprintEvents.length
    console.log(`Sprint population summary: ${populatedCount}/${totalCount} events have sprint names`)

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
      recurrence,
      notificationSettings
    } = body

    // Check if user has permission to manage sprints for this project
    const hasAccess = await hasPermission(authResult.user.id, Permission.SPRINT_EVENT_VIEW, projectId)
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

    // Get project name for email
    const project = await Project.findById(projectId).select('name')
    const projectName = project?.name || 'Unknown Project'

    // Prepare notification settings with defaults for reminders
    const eventNotificationSettings = notificationSettings ? {
      enabled: notificationSettings.enabled ?? true,
      reminderTime: notificationSettings.reminderTime ?? '1hour',
      emailReminder1Day: notificationSettings.emailReminder1Day ?? true,
      notificationReminder1Hour: notificationSettings.notificationReminder1Hour ?? true,
      notificationReminder15Min: notificationSettings.notificationReminder15Min ?? true
    } : {
      enabled: true,
      reminderTime: '1hour',
      emailReminder1Day: true,
      notificationReminder1Hour: true,
      notificationReminder15Min: true
    }

    // Ensure facilitator is included in attendees
    const attendeesWithFacilitator = Array.isArray(attendees) ? Array.from(new Set([...attendees, authResult.user.id])) : [authResult.user.id]

    console.log('Attendees from request:', attendees)
    console.log('Attendees with facilitator:', attendeesWithFacilitator)

    // Handle recurring events
    let createdEvents = []
    const baseEventDate = new Date(scheduledDate)
    
    if (recurrence && recurrence.type && recurrence.type !== 'none') {
      // Generate recurring dates
      const dates = generateRecurringDates(baseEventDate, {
        type: recurrence.type,
        interval: recurrence.interval || 1,
        endDate: recurrence.endDate ? new Date(recurrence.endDate) : undefined,
        daysOfWeek: recurrence.daysOfWeek,
        dayOfMonth: recurrence.dayOfMonth,
        occurrences: recurrence.occurrences
      })
      
      // Create parent event (first occurrence)
      const parentEvent = new SprintEvent({
        sprint: sprintId,
        project: projectId,
        eventType,
        title,
        description,
        scheduledDate: dates[0],
        startTime,
        endTime,
        duration,
        status: status || 'scheduled',
        attendees: attendeesWithFacilitator,
        facilitator: authResult.user.id,
        location,
        meetingLink,
        attachments: attachments?.map((att: any) => ({
          ...att,
          uploadedBy: authResult.user.id,
          uploadedAt: new Date()
        })),
        recurrence: {
          type: recurrence.type,
          interval: recurrence.interval || 1,
          endDate: recurrence.endDate ? new Date(recurrence.endDate) : undefined,
          daysOfWeek: recurrence.daysOfWeek,
          dayOfMonth: recurrence.dayOfMonth,
          occurrences: recurrence.occurrences
        },
        isRecurringSeries: true,
        notificationSettings: eventNotificationSettings,
        remindersSent: {
          email1Day: false,
          notification1Hour: false,
          notification5Min: false
        }
      })
      
      await parentEvent.save()
      createdEvents.push(parentEvent)
      
      // Create child events for remaining occurrences
      for (let i = 1; i < dates.length; i++) {
        const childEvent = new SprintEvent({
          sprint: sprintId,
          project: projectId,
          eventType,
          title,
          description,
          scheduledDate: dates[i],
          startTime,
          endTime,
          duration,
          status: status || 'scheduled',
          attendees: attendeesWithFacilitator,
          facilitator: authResult.user.id,
          location,
          meetingLink,
          attachments: attachments?.map((att: any) => ({
            ...att,
            uploadedBy: authResult.user.id,
            uploadedAt: new Date()
          })),
          parentEventId: parentEvent._id,
          notificationSettings: eventNotificationSettings,
          remindersSent: {
            email1Day: false,
            notification1Hour: false,
            notification5Min: false
          }
        })
        
        await childEvent.save()
        createdEvents.push(childEvent)
      }
    } else {
      // Create single event
    const sprintEvent = new SprintEvent({
      sprint: sprintId,
      project: projectId,
      eventType,
      title,
      description,
        scheduledDate: baseEventDate,
      startTime,
      endTime,
      duration,
      status: status || 'scheduled',
      attendees: attendeesWithFacilitator,
      facilitator: authResult.user.id,
      location,
      meetingLink,
      attachments: attachments?.map((att: any) => ({
        ...att,
        uploadedBy: authResult.user.id,
        uploadedAt: new Date()
      })),
        notificationSettings: eventNotificationSettings,
        remindersSent: {
          email1Day: false,
          notification1Hour: false,
          notification5Min: false
        }
    })

    await sprintEvent.save()
      createdEvents.push(sprintEvent)
    }

    // Populate the first event for response
    const populatedEvent = await SprintEvent.findById(createdEvents[0]._id)
      .populate('sprint', 'name status')
      .populate('project', 'name')
      .populate('facilitator', 'firstName lastName email')
      .populate('attendees', 'firstName lastName email')

    // Send email notifications to attendees (asynchronously)
    if (attendees && attendees.length > 0) {
      const attendeeUsers = await User.find({ _id: { $in: attendees } }).select('firstName lastName email')
      const facilitator = await User.findById(authResult.user.id).select('firstName lastName email')
      
      if (facilitator && attendeeUsers.length > 0) {
        // Send emails in background - don't await
        sendEventCreationEmails(
          { ...populatedEvent?.toObject(), recurrence },
          attendeeUsers,
          facilitator,
          projectName
        ).catch(err => console.error('Background email sending failed:', err))
      }
    }

    return NextResponse.json({
      ...populatedEvent?.toObject(),
      recurringEventsCreated: createdEvents.length > 1 ? createdEvents.length : undefined
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating sprint event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
