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
    } catch { }
    if (!requester && refreshToken) {
      try {
        const decoded: any = jwt.verify(refreshToken, JWT_REFRESH_SECRET)
        requester = await User.findById(decoded.userId)
      } catch { }
    }
    if (!requester || !requester.isActive) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only HR can access this endpoint
    if (requester.role !== 'human_resource') {
      return NextResponse.json({ error: 'Forbidden: Only HR users can access this endpoint' }, { status: 403 })
    }

    const orgId = requester.organization.toString()

    // Verify the employee belongs to the same organization
    const employee = await User.findById(employeeId).select('organization isActive')
    if (!employee || !employee.isActive || employee.organization.toString() !== orgId) {
      return NextResponse.json({ error: 'Employee not found or not in your organization' }, { status: 404 })
    }

    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')

    // Find tasks in this project assigned to the employee
    // Tasks use assignedTo array with objects containing { user: ObjectId }
    const query: any = {
      organization: orgId,
      project: projectId,
      archived: { $ne: true },
      'assignedTo.user': employeeId
    }

    if (search.trim()) {
      const searchLower = search.trim().toLowerCase()
      const searchRegex = new RegExp(searchLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      query.$or = [
        { title: searchRegex },
        { displayId: searchRegex }
      ]
    }

    const tasks = await Task.find(query)
      .select('_id title status priority isBillable displayId')
      .sort({ title: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()

    return NextResponse.json({
      success: true,
      tasks,
      pagination: {
        page,
        limit
      }
    })
  } catch (error) {
    console.error('Error fetching employee tasks for HR:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
