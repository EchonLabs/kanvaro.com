import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import '@/models/registry'
import { AIProjectReport } from '@/models/AIProjectReport'
import { User } from '@/models/User'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { emailService } from '@/lib/email/EmailService'

type ReportType = 'project' | 'personal' | 'both'

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
    const {
      reportId,
      memberIds,
      reportType = 'both',
      sendCopyToSender = false
    } = body as {
      reportId: string
      memberIds: string[]
      reportType: ReportType
      sendCopyToSender: boolean
    }

    if (!reportId || !Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json({ error: 'reportId and memberIds are required' }, { status: 400 })
    }

    const report = await AIProjectReport.findOne({
      _id: reportId,
      projectId: params.id,
      organizationId: user.organization
    }).lean() as any
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

    const senderUser = await User.findById(user.id).select('firstName lastName email').lean() as any
    const senderEmail = senderUser?.email || ''
    const senderName = `${senderUser?.firstName || ''} ${senderUser?.lastName || ''}`.trim() || senderEmail

    const results: { memberId: string; memberName: string; email: string; success: boolean }[] = []
    const newlySentTo = new Set<string>(report.sentTo || [])

    for (const memberId of memberIds) {
      const personal = report.personalReports.find((p: any) => p.memberId === memberId)
      if (!personal?.memberEmail) {
        results.push({ memberId, memberName: personal?.memberName || memberId, email: '', success: false })
        continue
      }

      let sent = false

      if (reportType === 'project' || reportType === 'both') {
        const html = emailService.generateAIProjectTrackingEmail(
          report.projectName,
          report.standupDateRange.from,
          report.standupDateRange.to,
          report.standupCount,
          report.projectTrackingReport
        )
        sent = await emailService.sendEmail({
          to: personal.memberEmail,
          subject: `AI Project Tracking Report — ${report.projectName}`,
          html
        })
      }

      if (reportType === 'personal' || reportType === 'both') {
        const html = emailService.generateAIPerformanceReportEmail(
          personal.memberName,
          report.projectName,
          report.standupDateRange.from,
          report.standupDateRange.to,
          report.standupCount,
          personal.report
        )
        const personalSent = await emailService.sendEmail({
          to: personal.memberEmail,
          subject: `Your Performance Report — ${report.projectName}`,
          html
        })
        sent = sent || personalSent
      }

      results.push({ memberId, memberName: personal.memberName, email: personal.memberEmail, success: sent })
      if (sent) newlySentTo.add(memberId)
    }

    // Send copy to sender if requested
    if (sendCopyToSender && senderEmail) {
      if (reportType === 'project' || reportType === 'both') {
        const html = emailService.generateAIProjectTrackingEmail(
          report.projectName,
          report.standupDateRange.from,
          report.standupDateRange.to,
          report.standupCount,
          report.projectTrackingReport
        )
        await emailService.sendEmail({
          to: senderEmail,
          subject: `[Copy] AI Project Tracking Report — ${report.projectName}`,
          html
        })
      }

      if (reportType === 'personal' || reportType === 'both') {
        // Send sender their own personal report if it exists, else skip
        const senderPersonal = report.personalReports.find((p: any) => p.memberEmail === senderEmail)
        if (senderPersonal) {
          const html = emailService.generateAIPerformanceReportEmail(
            senderPersonal.memberName,
            report.projectName,
            report.standupDateRange.from,
            report.standupDateRange.to,
            report.standupCount,
            senderPersonal.report
          )
          await emailService.sendEmail({
            to: senderEmail,
            subject: `[Copy] Your Performance Report — ${report.projectName}`,
            html
          })
        }
      }

      results.push({ memberId: 'sender', memberName: `${senderName} (you)`, email: senderEmail, success: true })
    }

    await AIProjectReport.findByIdAndUpdate(reportId, { sentTo: Array.from(newlySentTo) })

    return NextResponse.json({ success: true, data: results })
  } catch (error) {
    console.error('Send AI report emails error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
