import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import '@/models/registry'
import { AIProjectReport } from '@/models/AIProjectReport'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { emailService } from '@/lib/email/EmailService'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const body = await request.json()
    const { reportId, memberIds } = body as { reportId: string; memberIds: string[] }

    if (!reportId || !Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json({ error: 'reportId and memberIds are required' }, { status: 400 })
    }

    const report = await AIProjectReport.findOne({
      _id: reportId,
      projectId: params.id,
      organizationId: user.organization
    }).lean() as any

    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

    const results: { memberId: string; memberName: string; success: boolean }[] = []
    const newlySentTo = new Set<string>(report.sentTo || [])

    for (const memberId of memberIds) {
      const personal = report.personalReports.find((p: any) => p.memberId === memberId)
      if (!personal || !personal.memberEmail) {
        results.push({ memberId, memberName: personal?.memberName || memberId, success: false })
        continue
      }

      const html = emailService.generateAIPerformanceReportEmail(
        personal.memberName,
        report.projectName,
        report.standupDateRange.from,
        report.standupDateRange.to,
        report.standupCount,
        personal.report
      )

      const sent = await emailService.sendEmail({
        to: personal.memberEmail,
        subject: `Your Performance Report — ${report.projectName}`,
        html
      })

      results.push({ memberId, memberName: personal.memberName, success: sent })
      if (sent) newlySentTo.add(memberId)
    }

    await AIProjectReport.findByIdAndUpdate(reportId, {
      sentTo: Array.from(newlySentTo)
    })

    return NextResponse.json({ success: true, data: results })
  } catch (error) {
    console.error('Send AI report emails error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
