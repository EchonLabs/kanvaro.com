import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'

export async function GET(request: NextRequest) {
  try {
    await connectDB()

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''

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

    // Build query for active employees in the same organization
    const query: any = {
      organization: orgId,
      isActive: true
    }

    // Add search filter if provided
    if (search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i')
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
