import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import '@/models/registry'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
import { StandupSchedule } from '@/models/StandupSchedule'
import { StandupSummary } from '@/models/StandupSummary'
import { TimeEntry } from '@/models/TimeEntry'
import { Sprint } from '@/models/Sprint'
import { AIProjectReport } from '@/models/AIProjectReport'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

export async function GET(
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
    if (!canAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const reports = await AIProjectReport.find({
      projectId: params.id,
      organizationId: user.organization
    })
      .sort({ generatedAt: -1 })
      .select('projectName generatedByName generatedAt standupDateRange standupCount sentTo createdAt')
      .lean()

    return NextResponse.json({ success: true, data: reports })
  } catch (error) {
    console.error('List AI reports error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

    const project = await Project.findById(params.id).select('name organization teamMembers').lean() as any
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (project.organization?.toString() !== user.organization?.toString()) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const canAccess = await PermissionService.canAccessProject(user.id, params.id)
    if (!canAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const standups = await StandupSchedule.find({
      project: params.id,
      organization: user.organization,
      status: 'completed',
      archived: false
    })
      .populate('participants', 'firstName lastName email')
      .sort({ scheduledDate: -1 })
      .limit(30)
      .lean() as any[]

    if (standups.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 completed standups are required to generate an AI tracking report.' },
        { status: 400 }
      )
    }

    const standupIds = standups.map((s: any) => s._id)
    const summaries = await StandupSummary.find({ standupScheduleId: { $in: standupIds } }).lean() as any[]
    const summaryMap = new Map(summaries.map((s: any) => [s.standupScheduleId?.toString(), s.generatedSummary]))

    const sprints = await Sprint.find({
      project: params.id,
      organization: user.organization,
      archived: false
    }).select('name status startDate endDate tasks').lean() as any[]

    const currentSprint = sprints.find((s: any) => s.status === 'active') || sprints[0]

    const tasks = await Task.find({
      project: params.id,
      organization: user.organization,
      archived: false
    })
      .populate('assignedTo', 'firstName lastName email')
      .select('_id title status priority estimatedHours actualHours assignedTo dueDate completedAt sprint')
      .lean() as any[]

    const recentTimeEntries = await TimeEntry.find({
      project: params.id,
      organization: user.organization,
      startTime: {
        $gte: new Date(standups[standups.length - 1].scheduledDate),
        $lte: new Date()
      }
    })
      .populate('user', 'firstName lastName email')
      .select('user duration startTime endTime task')
      .lean() as any[]

    // Build member stats map
    const memberStatsMap = new Map<string, {
      name: string
      email: string
      totalCommitments: number
      completedOnTime: number
      delayed: number
      standupParticipation: number
      totalLoggedHours: number
      issueComments: { taskTitle: string; reason: string; date: string }[]
    }>()

    for (const standup of standups) {
      for (const participant of (standup.participants || []) as any[]) {
        const id = participant._id?.toString()
        if (!id) continue
        if (!memberStatsMap.has(id)) {
          memberStatsMap.set(id, {
            name: `${participant.firstName || ''} ${participant.lastName || ''}`.trim() || participant.email,
            email: participant.email || '',
            totalCommitments: 0,
            completedOnTime: 0,
            delayed: 0,
            standupParticipation: 0,
            totalLoggedHours: 0,
            issueComments: []
          })
        }
        const stats = memberStatsMap.get(id)!
        stats.standupParticipation++

        for (const assignment of (standup.assignments || []) as any[]) {
          if (assignment.member?.toString() === id) {
            stats.totalCommitments++
            if (assignment.taskStatus === 'done' || assignment.taskStatus === 'completed') {
              stats.completedOnTime++
            }
          }
        }

        for (const comment of (standup.comments || []) as any[]) {
          if (comment.member?.toString() === id) {
            stats.issueComments.push({
              taskTitle: comment.taskTitle || 'Unknown task',
              reason: comment.reason || '',
              date: new Date(comment.createdAt).toLocaleDateString()
            })
            stats.delayed++
          }
        }
      }
    }

    for (const entry of recentTimeEntries) {
      const userId = entry.user?._id?.toString() || entry.user?.toString()
      if (userId && memberStatsMap.has(userId)) {
        memberStatsMap.get(userId)!.totalLoggedHours += (entry.duration || 0) / 3600
      }
    }

    const dateFrom = standups[standups.length - 1].scheduledDate
    const dateTo = standups[0].scheduledDate

    // Build standup history text
    const standupHistoryText = standups.slice(0, 10).map((standup: any, index: number) => {
      const summaryText = summaryMap.get(standup._id?.toString()) || 'No summary generated'
      const commentsText = (standup.comments || []).map((c: any) =>
        `  - ${c.authorName || 'PM'}: "${c.reason}" (re: ${c.taskTitle || 'task'})`
      ).join('\n')
      return `Standup ${index + 1} — ${new Date(standup.scheduledDate).toLocaleDateString()} (${standup.status})
Participants: ${(standup.participants || []).map((p: any) => `${p.firstName} ${p.lastName}`).join(', ')}
PM/Issue Comments:\n${commentsText || '  None'}
Summary excerpt: ${summaryText.substring(0, 600)}...`
    }).join('\n\n---\n\n')

    const sprintText = currentSprint
      ? `Sprint: ${currentSprint.name} (${currentSprint.status}) | Tasks: ${(currentSprint.tasks || []).length} | ${currentSprint.startDate ? `${new Date(currentSprint.startDate).toLocaleDateString()} → ${currentSprint.endDate ? new Date(currentSprint.endDate).toLocaleDateString() : 'ongoing'}` : ''}`
      : 'No active sprint'

    const taskSummaryText = tasks.slice(0, 40).map((t: any) =>
      `${t.title} [${t.status}] est:${t.estimatedHours || 0}h actual:${t.actualHours || 0}h due:${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'none'}`
    ).join('\n')

    // --- Generate project tracking report ---
    const projectPrompt = `You are an AI project tracking assistant. Analyze the following standup meeting data for the project "${project.name}" and generate a comprehensive project tracking report.

SPRINT: ${sprintText}

STANDUP HISTORY (${standups.length} standups, ${new Date(dateFrom).toLocaleDateString()} to ${new Date(dateTo).toLocaleDateString()}):
${standupHistoryText}

TASK OVERVIEW:
${taskSummaryText}

Generate a structured project tracking report with these exact sections:

## Executive Summary
(2-3 sentences on overall project health and momentum)

## Sprint Risk Assessment
(Risk level: Low/Medium/High with explanation. List tasks at risk of missing sprint deadline.)

## Ongoing Trends
(Patterns observed across standups — recurring blockers, delayed tasks, team velocity)

## PM Follow-Up Items
(List specific items the PM should follow up on today based on past notes and unresolved issues)

## Sprint Catch-Up Recommendations
(If the team needs to hit 100% sprint completion, what tasks must be prioritized in upcoming standups)

## Key Metrics
- Total standups analyzed: ${standups.length}
- Date range: ${new Date(dateFrom).toLocaleDateString()} — ${new Date(dateTo).toLocaleDateString()}
- Sprint: ${currentSprint?.name || 'N/A'}
- Total tasks: ${tasks.length}
- Completed tasks: ${tasks.filter((t: any) => t.status === 'done' || t.status === 'completed').length}

Keep the tone professional and actionable. Be specific about task names and member names where relevant.`

    const projectReportResponse = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: projectPrompt }],
      max_tokens: 2000,
      temperature: 0.4
    })

    const projectTrackingReport = projectReportResponse.choices[0]?.message?.content || 'Unable to generate report.'

    // --- Generate personal reports per member ---
    const personalReports: { memberId: string; memberName: string; memberEmail: string; report: string }[] = []

    for (const [memberId, stats] of memberStatsMap.entries()) {
      const completionRate = stats.totalCommitments > 0
        ? Math.round((stats.completedOnTime / stats.totalCommitments) * 100)
        : 0

      const issuesText = stats.issueComments.length > 0
        ? stats.issueComments.map(i => `  - ${i.date}: "${i.reason}" (Task: ${i.taskTitle})`).join('\n')
        : '  None recorded'

      const personalPrompt = `Generate a personal performance report for team member "${stats.name}" for the project "${project.name}".

Performance Data (${new Date(dateFrom).toLocaleDateString()} — ${new Date(dateTo).toLocaleDateString()}):
- Standup participation: ${stats.standupParticipation} / ${standups.length} standups
- Total task commitments made: ${stats.totalCommitments}
- Completed on time: ${stats.completedOnTime} (${completionRate}%)
- Tasks with reported delays/issues: ${stats.delayed}
- Total logged hours: ${stats.totalLoggedHours.toFixed(1)}h
- PM issue notes about this member:
${issuesText}

Write a professional personal performance report with these sections:

## Performance Summary for ${stats.name}
(1-2 sentence overall assessment)

## Strengths & Compliments
(Specific positive observations based on the data — commitment rate, participation, consistency)

## Areas of Concern
(Issues flagged, delays, patterns that need attention — be constructive and factual)

## Recommendations
(2-3 specific, actionable suggestions for improvement or continued excellence)

Keep it professional, factual, and constructive. Use the actual numbers provided.`

      const personalResponse = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: personalPrompt }],
        max_tokens: 800,
        temperature: 0.4
      })

      personalReports.push({
        memberId,
        memberName: stats.name,
        memberEmail: stats.email,
        report: personalResponse.choices[0]?.message?.content || 'Unable to generate personal report.'
      })
    }

    const generatedByName = `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim() || (user as any).email || 'Unknown'

    const savedReport = await AIProjectReport.create({
      projectId: params.id,
      organizationId: user.organization,
      generatedBy: user.id,
      generatedByName,
      generatedAt: new Date(),
      standupDateRange: { from: dateFrom, to: dateTo },
      standupCount: standups.length,
      projectName: project.name,
      projectTrackingReport,
      personalReports,
      sentTo: []
    })

    return NextResponse.json({ success: true, data: savedReport })
  } catch (error: any) {
    console.error('Generate AI tracker report error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
