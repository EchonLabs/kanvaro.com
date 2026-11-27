import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import { Task } from '@/models/Task'
import { Role } from '@/lib/permissions/permission-definitions'
import { authenticateUserWithDocument } from '@/lib/auth-utils'

const UNRESTRICTED_TIME_LOG_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.HUMAN_RESOURCE]

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
    // F3: the shared sign-in check (accepts a Bearer token as well as the
    // cookies; this route used to carry its own cookie-only copy).
    const auth = await authenticateUserWithDocument()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const requester: any = auth.document

    // Unrestricted roles (Super Admin/Admin/HR) can look up anyone's tasks; everyone else
    // may only look up their own (self-service manual log flow).
    const isSelfRequest = employeeId === requester._id.toString()
    if (!UNRESTRICTED_TIME_LOG_ROLES.includes(requester.role) && !isSelfRequest) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const orgId = requester.organization.toString()

    // Verify the employee belongs to the same organization (reuse requester if self-request)
    const employee = isSelfRequest
      ? requester
      : await User.findById(employeeId).select('organization isActive').lean()
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
