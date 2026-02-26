import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import { Task } from '@/models/Task'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'

export async function GET(request: NextRequest) {
  try {
    await connectDB()

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const projectId = searchParams.get('projectId')
    const search = searchParams.get('search') || ''

    if (!employeeId || !projectId) {
      return NextResponse.json({ error: 'employeeId and projectId are required' }, { status: 400 })
    }

    // Authenticate from cookies
    const cookieStore = cookies()
    const accessToken = cookieStore.get('accessToken')?.value
    const refreshToken = cookieStore.get('refreshToken')?.value

    if (!accessToken && !refreshToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let requester: any = null
    try {
      if (accessToken) {
        const decoded: any = jwt.verify(accessToken, JWT_SECRET)
        requester = await User.findById(decoded.userId)
      }
    } catch {}
    if (!requester && refreshToken) {
      try {
        const decoded: any = jwt.verify(refreshToken, JWT_REFRESH_SECRET)
        requester = await User.findById(decoded.userId)
      } catch {}
    }
    if (!requester || !requester.isActive) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only HR and admin can access this endpoint
    if (!['admin', 'human_resource'].includes(requester.role)) {
      return NextResponse.json({ error: 'Forbidden: Only HR and Admin users can access this endpoint' }, { status: 403 })
    }

    const orgId = requester.organization.toString()

    // Verify the employee belongs to the same organization
    const employee = await User.findById(employeeId).select('organization isActive')
    if (!employee || !employee.isActive || employee.organization.toString() !== orgId) {
      return NextResponse.json({ error: 'Employee not found or not in your organization' }, { status: 404 })
    }

    // Find tasks in this project assigned to the employee
    // Tasks use assignedTo array with objects containing { user: ObjectId }
    const query: any = {
      organization: orgId,
      project: projectId,
      archived: { $ne: true },
      'assignedTo.user': employeeId
    }

    const tasks = await Task.find(query)
      .select('_id title status priority isBillable displayId')
      .sort({ title: 1 })
      .lean()

    // Apply search filter on results if provided
    let filteredTasks = tasks
    if (search.trim()) {
      const searchLower = search.trim().toLowerCase()
      filteredTasks = tasks.filter((t: any) =>
        t.title?.toLowerCase().includes(searchLower) ||
        t.displayId?.toLowerCase().includes(searchLower)
      )
    }

    return NextResponse.json({
      success: true,
      tasks: filteredTasks
    })
  } catch (error) {
    console.error('Error fetching employee tasks for HR:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
