import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Sprint } from '@/models/Sprint'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
import { Story } from '@/models/Story'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { EmailService } from '@/lib/email/EmailService'

// Helper function to send sprint assignment email to team members
async function sendSprintAssignmentEmails(
  sprint: any,
  teamMembers: any[],
  projectName: string
) {
  try {
    const emailService = EmailService.getInstance()
    const startDate = new Date(sprint.startDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    const endDate = new Date(sprint.endDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    const emailPromises = teamMembers.map(async (member: any) => {
      if (!member.email) return

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .sprint-card { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .sprint-title { font-size: 20px; font-weight: bold; color: #1a1a1a; margin-bottom: 15px; }
            .sprint-detail { display: flex; margin-bottom: 10px; }
            .sprint-label { font-weight: 600; color: #666; width: 120px; }
            .sprint-value { color: #333; }
            .button { display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
            .footer { text-align: center; color: #888; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">🎯 Sprint Assignment</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">You've been assigned to a new sprint</p>
            </div>
            <div class="content">
              <p>Hi ${member.firstName},</p>
              <p>You have been assigned to a new sprint in the <strong>${projectName}</strong> project.</p>

              <div class="sprint-card">
                <div class="sprint-title">${sprint.name}</div>
                <div class="sprint-detail">
                  <span class="sprint-label">📅 Start Date:</span>
                  <span class="sprint-value">${startDate}</span>
                </div>
                <div class="sprint-detail">
                  <span class="sprint-label">📅 End Date:</span>
                  <span class="sprint-value">${endDate}</span>
                </div>
                <div class="sprint-detail">
                  <span class="sprint-label">📊 Status:</span>
                  <span class="sprint-value">${sprint.status.charAt(0).toUpperCase() + sprint.status.slice(1)}</span>
                </div>
                ${sprint.capacity ? `
                <div class="sprint-detail">
                  <span class="sprint-label">⏱️ Capacity:</span>
                  <span class="sprint-value">${sprint.capacity} hours</span>
                </div>
                ` : ''}
                ${sprint.goal ? `
                <div class="sprint-detail">
                  <span class="sprint-label">🎯 Goal:</span>
                  <span class="sprint-value">${sprint.goal}</span>
                </div>
                ` : ''}
                ${sprint.description ? `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                  <strong>Description:</strong>
                  <p style="margin: 10px 0 0 0; color: #555;">${sprint.description}</p>
                </div>
                ` : ''}
              </div>

              <p style="color: #666;">Please review the sprint details and prepare for the upcoming work. You can access the sprint through the project management dashboard.</p>

              <div class="footer">
                <p>This is an automated message from Kanvaro Project Management</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `

      await emailService.sendEmail({
        to: member.email,
        subject: `🎯 Sprint Assignment: ${sprint.name} - ${projectName}`,
        html: emailHtml
      })
    })

    await Promise.allSettled(emailPromises)
  } catch (error) {
    console.error('Error sending sprint assignment emails:', error)
    // Don't throw - email sending failure shouldn't block sprint creation
  }
}
 
export async function GET(request: NextRequest) {
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

    const canViewSprints = await PermissionService.hasAnyPermission(
      userId.toString(),
      [Permission.SPRINT_VIEW, Permission.SPRINT_READ]
    )
    
    if (!canViewSprints) {
      return NextResponse.json(
        { error: 'You do not have permission to view sprints' },
        { status: 403 }
      )
    }

    // Check if user has permission to view all sprints
    const hasSprintViewAll = await PermissionService.hasPermission(
      userId,
      Permission.SPRINT_VIEW_ALL
    );

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const PAGE_SIZE = Math.min(limit, 100)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const projectFilter = searchParams.get('project') || ''
    const countOnly = searchParams.get('countOnly') === 'true'

    let accessibleProjectIds: string[] = []

    if (!hasSprintViewAll) {
      const memberProjects = await Project.distinct('_id', {
        organization: organizationId,
        'teamMembers.memberId': userId
      })

      accessibleProjectIds = memberProjects.map(projectId => projectId.toString())

      if (!accessibleProjectIds.length) {
        if (countOnly) {
          return NextResponse.json({
            success: true,
            count: 0
          })
        }

        return NextResponse.json({
          success: true,
          data: [],
          pagination: {
            page,
            limit: PAGE_SIZE,
            total: 0,
            totalPages: 0,
          },
        })
      }
    }

    // Build filters (Sprint schema has no 'organization' field)
    const filters: any = {
      archived: false,
    }

    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ]
    }

    if (status) {
      // Support comma-separated status values
      const statusArray = status.split(',').map(s => s.trim())
      if (statusArray.length === 1) {
        filters.status = status
      } else {
        filters.status = { $in: statusArray }
      }
    }

    // Query sprints - if user has SPRINT_VIEW_ALL, show all sprints; otherwise only projects they belong to
    const sprintQueryFilters: any = {
      ...filters,
    }

    if (projectFilter) {
      if (!hasSprintViewAll) {
        const canAccessProject = accessibleProjectIds.some(id => id === projectFilter)
        if (!canAccessProject) {
          if (countOnly) {
            return NextResponse.json({
              success: true,
              count: 0
            })
          }

          return NextResponse.json({
            success: true,
            data: [],
            pagination: {
              page,
              limit: PAGE_SIZE,
              total: 0,
              totalPages: 0,
            },
          })
        }
      }
      sprintQueryFilters.project = projectFilter
    } else if (!hasSprintViewAll) {
      sprintQueryFilters.project = { $in: accessibleProjectIds }
    }

    // Check if only count is requested
    if (countOnly) {
      const total = await Sprint.countDocuments(sprintQueryFilters)
      return NextResponse.json({
        success: true,
        count: total
      })
    }

    // Fetch sprints
    const sprints = await Sprint.find(sprintQueryFilters)
      .populate('project', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('teamMembers', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean()

    // Count total for pagination
    const total = await Sprint.countDocuments(sprintQueryFilters)

    // Calculate progress & velocity for each sprint using linked tasks/stories
    const sprintsWithProgress = await Promise.all(
      sprints.map(async (sprint) => {
        const sprintId = (sprint as any)._id.toString()
        const sprintTaskIds = sprint.tasks || []

        // Find all tasks currently associated with this sprint
        const includeArchivedTasks = sprint.status === 'completed' || sprint.status === 'cancelled'
        const taskQuery: Record<string, any> = {
          $or: [
            { _id: { $in: sprintTaskIds } },
            { sprint: sprintId }
          ],
          organization: organizationId
        }
        if (!includeArchivedTasks) {
          taskQuery.archived = { $ne: true }
        }

        const taskDocs = await Task.find(taskQuery).select('status storyPoints _id').lean()

        // Deduplicate tasks in case they were matched by both clauses above
        const taskMap = new Map<string, typeof taskDocs[number]>()
        taskDocs.forEach(task => {
          taskMap.set((task as any)._id.toString(), task)
        })
        const tasks = Array.from(taskMap.values())

        const totalTasks = tasks.length
        // Consider tasks with status 'done' or 'completed' as completed
        const tasksCompleted = tasks.filter(
          task => task.status === 'done' || task.status === 'completed'
        ).length
        
        const completionPercentage = totalTasks > 0 
          ? Math.round((tasksCompleted / totalTasks) * 100) 
          : 0

        // Use stories assigned to the sprint (stories hold story points)
        const projectId =
          typeof sprint.project === 'object' && sprint.project !== null
            ? (sprint.project as any)._id
            : sprint.project

        const storyFilters: Record<string, any> = {
          sprint: sprintId,
          archived: { $ne: true }
        }
        if (projectId) {
          storyFilters.project = projectId
        }

        const stories = await Story.find(storyFilters)
          .select('status storyPoints')
          .lean()

        const doneStoryStatuses = new Set(['done', 'completed'])

        const totalStoryPoints = stories.reduce((sum, story) => {
          return sum + (story.storyPoints || 0)
        }, 0)

        const storyPointsCompleted = stories
          .filter(story => doneStoryStatuses.has((story.status || '').toLowerCase()))
          .reduce((sum, story) => {
            return sum + (story.storyPoints || 0)
          }, 0)

        const storyPointsCompletionPercentage =
          totalStoryPoints > 0 ? Math.round((storyPointsCompleted / totalStoryPoints) * 100) : 0

        return {
          ...sprint,
          velocity: storyPointsCompleted,
          progress: {
            completionPercentage,
            tasksCompleted,
            totalTasks,
            storyPointsCompleted,
            totalStoryPoints,
            storyPointsCompletionPercentage
          },
        }
      })
    )

    // ✅ Unified JSON response structure (same as /api/tasks)
    return NextResponse.json({
      success: true,
      data: sprintsWithProgress,
      pagination: {
        page,
        limit: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    })
  } catch (error) {
    console.error('Get sprints error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
export async function POST(request: NextRequest) {
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

    const {
      name,
      description,
      project,
      startDate,
      endDate,
      goal,
      capacity,
      teamMembers = []
    } = await request.json()

    // Validate required fields
    if (!name || !project || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Name, project, start date, and end date are required' },
        { status: 400 }
      )
    }

    // Ensure project exists and belongs to the user's organization
    const projectDoc = await Project.findById(project).select('organization')
    if (!projectDoc) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    if (projectDoc.organization.toString() !== organizationId.toString()) {
      return NextResponse.json(
        { error: 'You do not have access to this project' },
        { status: 403 }
      )
    }

    const canCreateSprint = await PermissionService.hasPermission(
      userId.toString(),
      Permission.SPRINT_CREATE,
      projectDoc._id.toString()
    )

    if (!canCreateSprint) {
      return NextResponse.json(
        { error: 'You do not have permission to create sprints' },
        { status: 403 }
      )
    }

    // Create sprint
    const sprint = new Sprint({
      name,
      description,
      status: 'planning',
      organization: organizationId,
      project,
      createdBy: userId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      goal: goal || '',
      capacity: capacity || 0,
      velocity: 0,
      teamMembers: Array.isArray(teamMembers) ? teamMembers : []
    })

    await sprint.save()

    // Populate the created sprint
    const populatedSprint = await Sprint.findById(sprint._id)
      .populate('project', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('teamMembers', 'firstName lastName email')

    // Send email notifications to team members (asynchronously)
    if (teamMembers && teamMembers.length > 0) {
      const User = (await import('@/models/User')).User
      const teamMemberUsers = await User.find({ _id: { $in: teamMembers } }).select('firstName lastName email')

      if (teamMemberUsers.length > 0) {
        // Send emails in background - don't await
        sendSprintAssignmentEmails(
          populatedSprint,
          teamMemberUsers,
          populatedSprint.project.name
        ).catch(err => console.error('Background email sending failed:', err))
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Sprint created successfully',
      data: populatedSprint
    })

  } catch (error) {
    console.error('Create sprint error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}