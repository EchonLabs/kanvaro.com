import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Task } from '@/models/Task'
import { Project } from '@/models/Project'
import { User } from '@/models/User'
import { Story } from '@/models/Story'
import { authenticateUser } from '@/lib/auth-utils'

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

    const { searchParams } = new URL(request.url)
    const since = searchParams.get('since')
    const ifModifiedSince = request.headers.get('if-modified-since')

    // Use either the 'since' parameter or the If-Modified-Since header
    const lastModified = since || ifModifiedSince

    // Build the base filter
    const filters: any = {
      organization: organizationId,
      $or: [
        { assignedTo: userId },
        { createdBy: userId }
      ]
    }

    // If we have a last modified timestamp, only get tasks updated after that
    if (lastModified) {
      filters.updatedAt = { $gt: new Date(lastModified) }
    }

    // Get tasks that have been updated since the last sync
    const tasks = await Task.find(filters)
      .populate('project', '_id name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate('story', 'title')
      .populate('parentTask', 'title')
      .sort({ updatedAt: -1 })
      .limit(100) // Limit to prevent large responses

    // Drop orphan tasks with missing project
    const validTasks = tasks.filter((t: any) => !!t.project)

    // Get the most recent update timestamp
    const latestUpdate = validTasks.length > 0 
      ? Math.max(...validTasks.map(task => new Date(task.updatedAt).getTime()))
      : null

    // Format the response
    const updates = validTasks.map(task => ({
      type: 'update',
      data: {
        taskId: task._id,
        status: task.status,
        priority: task.priority,
        assignedTo: task.assignedTo,
        dueDate: task.dueDate,
        updatedAt: task.updatedAt
      }
    }))

    const response = NextResponse.json({
      success: true,
      updates,
      lastModified: latestUpdate ? new Date(latestUpdate).toISOString() : null,
      count: updates.length
    })

    // Set cache headers to prevent unnecessary requests
    if (latestUpdate) {
      response.headers.set('Last-Modified', new Date(latestUpdate).toUTCString())
    }

    response.headers.set('Cache-Control', 'no-cache, must-revalidate')
    response.headers.set('ETag', `"${latestUpdate || '0'}"`)

    return response

  } catch (error) {
    console.error('Task sync error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Webhook endpoint for real-time updates (if using external services)
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
    const { taskId, updates } = await request.json()

    if (!taskId || !updates) {
      return NextResponse.json(
        { error: 'Task ID and updates are required' },
        { status: 400 }
      )
    }

    // Verify the user has access to this task
    const task = await Task.findOne({
      _id: taskId,
      organization: user.organization,
      $or: [
        { assignedTo: user.id },
        { createdBy: user.id }
      ]
    })

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found or unauthorized' },
        { status: 404 }
      )
    }

    // Update the task
    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      { ...updates, updatedAt: new Date() },
      { new: true }
    )
      .populate('project', 'name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')

    return NextResponse.json({
      success: true,
      message: 'Task updated successfully',
      data: updatedTask
    })

  } catch (error) {
    console.error('Task sync webhook error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
