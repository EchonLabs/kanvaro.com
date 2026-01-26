import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { ActiveTimer, IActiveTimer } from '@/models/ActiveTimer'
import { authenticateUser } from '@/lib/auth-utils'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'

function calculateCurrentDurationMinutes(activeTimer: any): number {
  const now = new Date()
  const baseDuration = (now.getTime() - activeTimer.startTime.getTime()) / (1000 * 60)
  return Math.max(0, baseDuration - (activeTimer.totalPausedDuration || 0))
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

    // Check permission
    const canViewAllTimers = await PermissionService.hasPermission(
      userId,
      Permission.TIME_TRACKING_VIEW_ALL_TIMER
    )

    if (!canViewAllTimers) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const projectId = searchParams.get('projectId')

    // Build query
    const query: any = {
      organization: organizationId
    }

    if (employeeId) {
      query.user = employeeId
    }

    if (projectId) {
      query.project = projectId
    }

    // Get all active timers for the organization
    const activeTimers = await ActiveTimer.find(query)
      .populate('user', 'firstName lastName email')
      .populate('project', 'name settings')
      .populate('task', 'title')
      .sort({ startTime: -1 })
      .lean()

    // Calculate current duration for each timer
    const timersWithDuration = activeTimers.map((timer: any) => {
      const currentDuration = calculateCurrentDurationMinutes(timer)
      return {
        ...timer,
        currentDuration,
        isPaused: !!timer.pausedAt
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        timers: timersWithDuration,
        count: timersWithDuration.length
      }
    })
  } catch (error) {
    console.error('Error fetching all active timers:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
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

    // Check permission
    const canViewAllTimers = await PermissionService.hasPermission(
      userId,
      Permission.TIME_TRACKING_VIEW_ALL_TIMER
    )

    if (!canViewAllTimers) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { timerId } = await request.json()

    if (!timerId) {
      return NextResponse.json(
        { error: 'Timer ID is required' },
        { status: 400 }
      )
    }

    // Find the timer
    const activeTimer = await ActiveTimer.findById(timerId)

    if (!activeTimer) {
      return NextResponse.json(
        { error: 'Timer not found' },
        { status: 404 }
      )
    }

    // Verify timer belongs to same organization
    const timerOrgId = activeTimer.organization.toString()
    const userOrgId = organizationId.toString()

    if (timerOrgId !== userOrgId) {
      return NextResponse.json(
        { error: 'Timer does not belong to your organization' },
        { status: 403 }
      )
    }

    // Stop the timer by calling the timer API endpoint
    // We need to use the timer owner's userId and organizationId
    const timerUserId = activeTimer.user.toString()
    
    const stopResponse = await fetch(`${request.nextUrl.origin}/api/time-tracking/timer`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('Cookie') || ''
      },
      body: JSON.stringify({
        userId: timerUserId,
        organizationId: timerOrgId,
        action: 'stop'
      })
    })

    const stopData = await stopResponse.json()

    if (!stopResponse.ok) {
      return NextResponse.json(stopData, { status: stopResponse.status })
    }

    return NextResponse.json({
      success: true,
      message: 'Timer stopped successfully',
      data: stopData
    })
  } catch (error) {
    console.error('Error stopping timer:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

