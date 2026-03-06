import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import { Project } from '@/models/Project'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'

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
