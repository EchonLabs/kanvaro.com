import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { TimeEntry } from '@/models/TimeEntry'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

export async function POST(request: NextRequest) {
  try {
    await connectDB()
    
    // Authenticate user
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const userId = user.id

    // Parse body first to determine projects involved
    const body = await request.json()
    const { timeEntryIds, approvedBy, action } = body

    if (!timeEntryIds || !Array.isArray(timeEntryIds) || timeEntryIds.length === 0) {
      return NextResponse.json({ error: 'Time entry IDs are required' }, { status: 400 })
    }

    // Only check that the logged-in user has TIME_TRACKING_APPROVE permission globally
    const perms = await PermissionService.getUserPermissions(userId)
    const canApprove = perms.globalPermissions.includes(Permission.TIME_TRACKING_APPROVE)
    if (!canApprove) {
      return NextResponse.json(
        { error: 'You do not have permission to approve time entries' },
        { status: 403 }
      )
    }
    // Ensure approvedBy matches the authenticated user
    if (!approvedBy || approvedBy.toString() !== userId.toString()) {
      return NextResponse.json({ error: 'Invalid approver' }, { status: 400 })
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be "approve" or "reject"' }, { status: 400 })
    }

    const updateData: any = {
      approvedBy,
      approvedAt: new Date()
    }

    if (action === 'approve') {
      updateData.isApproved = true
    } else {
      updateData.isApproved = false
    }

    const result = await TimeEntry.updateMany(
      { _id: { $in: timeEntryIds } },
      updateData
    )

    return NextResponse.json({
      message: `${action === 'approve' ? 'Approved' : 'Rejected'} ${result.modifiedCount} time entries`,
      modifiedCount: result.modifiedCount
    })
  } catch (error) {
    console.error('Error approving/rejecting time entries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
