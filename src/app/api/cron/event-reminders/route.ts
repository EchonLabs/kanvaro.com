import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db-config'
import { SprintEvent } from '@/models/SprintEvent'
import { User } from '@/models/User'
import { Notification } from '@/models/Notification'
import { Project } from '@/models/Project'
import { EmailService } from '@/lib/email/EmailService'

// Helper function to send reminder email
async function sendReminderEmail(
  event: any,
  attendees: any[],
  projectName: string,
  reminderType: '1day' | '1hour' | '15min'
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
    
    const reminderText = {
      '1day': 'Tomorrow',
      '1hour': 'In 1 hour',
      '15min': 'In 15 minutes'
    }[reminderType]
    
    const urgencyColor = {
      '1day': '#3b82f6', // blue
      '1hour': '#f59e0b', // amber
      '15min': '#ef4444'  // red
    }[reminderType]

    const emailPromises = attendees.map(async (attendee: any) => {
      if (!attendee.email) return

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${urgencyColor}; color: white; padding: 30px; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .event-card { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid ${urgencyColor}; }
            .event-title { font-size: 20px; font-weight: bold; color: #1a1a1a; margin-bottom: 15px; }
            .event-detail { display: flex; margin-bottom: 10px; }
            .event-label { font-weight: 600; color: #666; width: 120px; }
            .event-value { color: #333; }
            .button { display: inline-block; background: ${urgencyColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
            .footer { text-align: center; color: #888; font-size: 12px; margin-top: 20px; }
            .urgency-badge { display: inline-block; background: ${urgencyColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <span class="urgency-badge">⏰ ${reminderText}</span>
              <h1 style="margin: 15px 0 0 0;">Sprint Event Reminder</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Don't forget about your upcoming event!</p>
            </div>
            <div class="content">
              <p>Hi ${attendee.firstName},</p>
              <p>This is a reminder that you have an upcoming sprint event:</p>
              
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
                  <span class="event-label">📁 Project:</span>
                  <span class="event-value">${projectName}</span>
                </div>
                ${event.location ? `
                <div class="event-detail">
                  <span class="event-label">📍 Location:</span>
                  <span class="event-value">${event.location}</span>
                </div>
                ` : ''}
                ${event.meetingLink ? `
                <div style="margin-top: 15px;">
                  <a href="${event.meetingLink}" class="button">🔗 Join Meeting</a>
                </div>
                ` : ''}
              </div>
              
              <p style="color: #666;">Please ensure you're prepared and on time for the event.</p>
              
              <div class="footer">
                <p>This is an automated reminder from Kanvaro Project Management</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `

      await emailService.sendEmail({
        to: attendee.email,
        subject: `⏰ Reminder: ${event.title} - ${reminderText}`,
        html: emailHtml
      })
    })

    await Promise.allSettled(emailPromises)
  } catch (error) {
    console.error('Error sending reminder emails:', error)
  }
}

// Helper function to create in-app notifications
async function createReminderNotifications(
  event: any,
  attendees: any[],
  projectName: string,
  reminderType: '1hour' | '15min'
) {
  try {
    const reminderText = {
      '1hour': 'in 1 hour',
      '15min': 'in 15 minutes'
    }[reminderType]

    const notifications = attendees.map((attendee: any) => ({
      user: attendee._id,
      organization: event.project.organization || attendee.organization,
      type: 'sprint_event',
      title: `Upcoming Event: ${event.title}`,
      message: `Your sprint event "${event.title}" starts ${reminderText}. ${event.location ? `Location: ${event.location}` : ''} ${event.meetingLink ? 'Join link available.' : ''}`,
      data: {
        entityType: 'sprint_event',
        entityId: event._id,
        action: 'upcoming',
        priority: reminderType === '15min' ? 'high' : 'medium',
        url: `/sprint-events/view-sprint-event/${event._id}`,
        metadata: {
          projectName,
          eventType: event.eventType,
          startTime: event.startTime,
          meetingLink: event.meetingLink,
          reminderType
        }
      },
      isRead: false,
      sentVia: {
        inApp: true,
        email: false,
        push: false
      }
    }))

    await Notification.insertMany(notifications)
  } catch (error) {
    console.error('Error creating reminder notifications:', error)
  }
}

// Main cron handler - should be called periodically (e.g., every 5 minutes)
export async function GET(req: NextRequest) {
  try {
    await connectDB()
    
    // Check for authorization (you can add a secret key check here)
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    // If CRON_SECRET is set, validate it
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const results = {
      email1Day: 0,
      notification1Hour: 0,
      notification15Min: 0,
      errors: [] as string[]
    }

    // 1. Process 1-day email reminders (events tomorrow, sent at 8 AM)
    const currentHour = now.getHours()
    if (currentHour >= 7 && currentHour <= 9) { // Between 7 AM and 9 AM to catch the 8 AM window
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      
      const tomorrowEnd = new Date(tomorrow)
      tomorrowEnd.setHours(23, 59, 59, 999)

      const eventsForTomorrow = await SprintEvent.find({
        scheduledDate: { $gte: tomorrow, $lte: tomorrowEnd },
        status: { $in: ['scheduled', 'in_progress'] },
        'notificationSettings.emailReminder1Day': true,
        'remindersSent.email1Day': { $ne: true }
      })
        .populate('project', 'name organization')
        .populate('attendees', 'firstName lastName email organization')

      for (const event of eventsForTomorrow) {
        try {
          const projectName = (event.project as any)?.name || 'Unknown Project'
          await sendReminderEmail(event, event.attendees, projectName, '1day')
          
          // Mark reminder as sent
          await SprintEvent.updateOne(
            { _id: event._id },
            { $set: { 'remindersSent.email1Day': true } }
          )
          results.email1Day++
        } catch (err) {
          results.errors.push(`Failed to send 1-day reminder for event ${event._id}`)
        }
      }
    }

    // 2. Process 1-hour notification reminders
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)
    const eventsIn1Hour = await SprintEvent.find({
      scheduledDate: {
        $gte: new Date(oneHourFromNow.getTime() - 5 * 60 * 1000), // 5 min buffer
        $lte: new Date(oneHourFromNow.getTime() + 5 * 60 * 1000)
      },
      status: { $in: ['scheduled', 'in_progress'] },
      'notificationSettings.notificationReminder1Hour': true,
      'remindersSent.notification1Hour': { $ne: true }
    })
      .populate('project', 'name organization')
      .populate('attendees', '_id firstName lastName email organization')

    for (const event of eventsIn1Hour) {
      try {
        // Check if start time matches (within the hour window)
        if (event.startTime) {
          const [hours, minutes] = event.startTime.split(':').map(Number)
          const eventDateTime = new Date(event.scheduledDate)
          eventDateTime.setHours(hours, minutes, 0, 0)
          
          const diffMs = eventDateTime.getTime() - now.getTime()
          const diffMins = diffMs / (60 * 1000)
          
          // Only trigger if event is 55-65 minutes away
          if (diffMins < 55 || diffMins > 65) continue
        }

        const projectName = (event.project as any)?.name || 'Unknown Project'
        await createReminderNotifications(event, event.attendees, projectName, '1hour')
        
        // Mark reminder as sent
        await SprintEvent.updateOne(
          { _id: event._id },
          { $set: { 'remindersSent.notification1Hour': true } }
        )
        results.notification1Hour++
      } catch (err) {
        results.errors.push(`Failed to send 1-hour notification for event ${event._id}`)
      }
    }

    // 3. Process 15-minute notification reminders
    const fifteenMinFromNow = new Date(now.getTime() + 15 * 60 * 1000)
    const eventsIn15Min = await SprintEvent.find({
      scheduledDate: {
        $gte: new Date(fifteenMinFromNow.getTime() - 5 * 60 * 1000), // 5 min buffer
        $lte: new Date(fifteenMinFromNow.getTime() + 5 * 60 * 1000)
      },
      status: { $in: ['scheduled', 'in_progress'] },
      'notificationSettings.notificationReminder15Min': true,
      'remindersSent.notification15Min': { $ne: true }
    })
      .populate('project', 'name organization')
      .populate('attendees', '_id firstName lastName email organization')

    for (const event of eventsIn15Min) {
      try {
        // Check if start time matches (within the 15 min window)
        if (event.startTime) {
          const [hours, minutes] = event.startTime.split(':').map(Number)
          const eventDateTime = new Date(event.scheduledDate)
          eventDateTime.setHours(hours, minutes, 0, 0)
          
          const diffMs = eventDateTime.getTime() - now.getTime()
          const diffMins = diffMs / (60 * 1000)
          
          // Only trigger if event is 10-20 minutes away
          if (diffMins < 10 || diffMins > 20) continue
        }

        const projectName = (event.project as any)?.name || 'Unknown Project'
        await createReminderNotifications(event, event.attendees, projectName, '15min')
        
        // Mark reminder as sent
        await SprintEvent.updateOne(
          { _id: event._id },
          { $set: { 'remindersSent.notification15Min': true } }
        )
        results.notification15Min++
      } catch (err) {
        results.errors.push(`Failed to send 15-min notification for event ${event._id}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Event reminders processed',
      results,
      processedAt: now.toISOString()
    })
  } catch (error) {
    console.error('Error processing event reminders:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST endpoint for manual trigger or webhook
export async function POST(req: NextRequest) {
  return GET(req)
}

