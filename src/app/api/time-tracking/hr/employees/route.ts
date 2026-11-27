import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import { Role } from '@/lib/permissions/permission-definitions'
import { authenticateUserWithDocument } from '@/lib/auth-utils'
import { escapeRegex } from '@/lib/text/escape-regex'

const UNRESTRICTED_TIME_LOG_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.HUMAN_RESOURCE]

export async function GET(request: NextRequest) {
  try {
    await connectDB()

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''

    // Authenticate from cookies
    // F3: the shared sign-in check (accepts a Bearer token as well as the
    // cookies; this route used to carry its own cookie-only copy).
    const auth = await authenticateUserWithDocument()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const requester: any = auth.document

    // Only unrestricted roles (Super Admin/Admin/HR) can pick an arbitrary employee to log time for
    if (!UNRESTRICTED_TIME_LOG_ROLES.includes(requester.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const orgId = requester.organization.toString()

    // Build query for active employees in the same organization
    const query: any = {
      organization: orgId,
      isActive: true
    }

    // Add search filter if provided
    if (search.trim()) {
      // Escaped so the text is matched literally.
      const searchRegex = new RegExp(escapeRegex(search.trim()), 'i')
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex }
      ]
    }

    const employees = await User.find(query)
      .select('_id firstName lastName email role avatar memberId')
      .sort({ firstName: 1, lastName: 1 })
      .limit(100)
      .lean()

    return NextResponse.json({
      success: true,
      employees
    })
  } catch (error) {
    console.error('Error fetching employees for HR:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
