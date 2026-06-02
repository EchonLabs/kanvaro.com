import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import '@/models/registry'
import { AIProjectReport } from '@/models/AIProjectReport'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; reportId: string } }
) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { user } = authResult

    const canAccess = await PermissionService.canAccessProject(user.id, params.id)
    if (!canAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const report = await AIProjectReport.findOne({
      _id: params.reportId,
      projectId: params.id,
      organizationId: user.organization
    }).lean()

    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

    return NextResponse.json({ success: true, data: report })
  } catch (error) {
    console.error('Get AI report error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
