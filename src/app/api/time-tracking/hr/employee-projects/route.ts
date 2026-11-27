import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import { Project } from '@/models/Project'
import { Role } from '@/lib/permissions/permission-definitions'
import { authenticateUserWithDocument } from '@/lib/auth-utils'

const UNRESTRICTED_TIME_LOG_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.HUMAN_RESOURCE]

export async function GET(request: NextRequest) {
  try {
    await connectDB()

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const search = searchParams.get('search') || ''

    if (!employeeId) {
      return NextResponse.json({ error: 'employeeId is required' }, { status: 400 })
    }

    // Authenticate from cookies
    // F3: the shared sign-in check (accepts a Bearer token as well as the
    // cookies; this route used to carry its own cookie-only copy).
    const auth = await authenticateUserWithDocument()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const requester: any = auth.document

    // Unrestricted roles (Super Admin/Admin/HR) can look up anyone's projects; everyone else
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

    // Find all projects in this organization where the employee is a team member
    // and time tracking is enabled
    const query: any = {
      organization: orgId,
      archived: { $ne: true },
      'settings.allowTimeTracking': true,
      'teamMembers.memberId': employeeId
    }

    const projects = await Project.find(query)
      .select('_id name status settings.allowTimeTracking settings.allowManualTimeSubmission')
      .sort({ name: 1 })
      .lean()

    // Apply search filter on results if provided
    let filteredProjects = projects
    if (search.trim()) {
      const searchLower = search.trim().toLowerCase()
      filteredProjects = projects.filter((p: any) =>
        p.name?.toLowerCase().includes(searchLower)
      )
    }

    return NextResponse.json({
      success: true,
      projects: filteredProjects
    })
  } catch (error) {
    console.error('Error fetching employee projects for HR:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
