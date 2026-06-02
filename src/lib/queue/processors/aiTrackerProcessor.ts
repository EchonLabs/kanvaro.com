import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import '@/models/registry'
import { StandupSchedule } from '@/models/StandupSchedule'
import { StandupSummary } from '@/models/StandupSummary'
import { StandupCronJob } from '@/models/StandupCronJob'
import { Project } from '@/models/Project'
import { Task } from '@/models/Task'
import { Sprint } from '@/models/Sprint'
import { TimeEntry } from '@/models/TimeEntry'
import { AIProjectReport } from '@/models/AIProjectReport'
import { Notification } from '@/models/Notification'
import { User } from '@/models/User'
import Groq from 'groq-sdk'
import type { StandupJobData } from '../standupQueue'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

export async function processAITracker(data: StandupJobData) {
  await connectDB()

  await StandupCronJob.findOneAndUpdate(
    { projectId: data.projectId, jobType: 'ai_tracker' },
    { lastRunStatus: 'running' }
  )

  try {
    const standups = await StandupSchedule.find({
      project: data.projectId,
      organization: data.organizationId,
      status: 'completed',
      archived: false
    })
      .populate('participants', 'firstName lastName email')
      .sort({ scheduledDate: -1 })
      .limit(30)
      .lean() as any[]

    if (standups.length < 2) {
      await StandupCronJob.findOneAndUpdate(
        { projectId: data.projectId, jobType: 'ai_tracker' },
        { lastRunStatus: 'failed', lastRunAt: new Date(), lastRunError: 'Need at least 2 completed standups' }
      )
      return
    }

    const project = await Project.findById(data.projectId).select('name').lean() as any
    if (!project) throw new Error('Project not found')

    const [summaries, sprints, tasks, recentTimeEntries] = await Promise.all([
      StandupSummary.find({ standupScheduleId: { $in: standups.map((s: any) => s._id) } }).lean() as any,
      Sprint.find({ project: data.projectId, organization: data.organizationId, archived: false })
        .select('name status startDate endDate tasks').lean() as any[],
      Task.find({ project: data.projectId, organization: data.organizationId, archived: false })
        .select('_id title status estimatedHours actualHours dueDate completedAt').lean() as any[],
      TimeEntry.find({
        project: data.projectId,
        organization: data.organizationId,
        startTime: { $gte: new Date(standups[standups.length - 1].scheduledDate) }
      }).populate('user', 'firstName lastName email').select('user duration').lean() as any[]
    ])

    const summaryMap = new Map((summaries as any[]).map((s: any) => [s.standupScheduleId?.toString(), s.generatedSummary]))
    const currentSprint = (sprints as any[]).find((s: any) => s.status === 'active') || (sprints as any[])[0]
    const dateFrom = standups[standups.length - 1].scheduledDate
    const dateTo = standups[0].scheduledDate

    // Build member stats
    const memberStatsMap = new Map<string, { name: string; email: string; totalCommitments: number; completedOnTime: number; delayed: number; standupParticipation: number; totalLoggedHours: number; issueComments: any[] }>()

    for (const standup of standups) {
      for (const p of (standup.participants || []) as any[]) {
        const id = p._id?.toString()
        if (!id) continue
        if (!memberStatsMap.has(id)) {
          memberStatsMap.set(id, {
            name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email,
            email: p.email || '',
            totalCommitments: 0, completedOnTime: 0, delayed: 0, standupParticipation: 0,
            totalLoggedHours: 0, issueComments: []
          })
        }
        const stats = memberStatsMap.get(id)!
        stats.standupParticipation++
        for (const a of (standup.assignments || []) as any[]) {
          if (a.member?.toString() === id) {
            stats.totalCommitments++
            if (a.taskStatus === 'done' || a.taskStatus === 'completed') stats.completedOnTime++
          }
        }
        for (const c of (standup.comments || []) as any[]) {
          if (c.member?.toString() === id) {
            stats.delayed++
            stats.issueComments.push({ taskTitle: c.taskTitle || 'Unknown', reason: c.reason || '', date: new Date(c.createdAt).toLocaleDateString() })
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

    const standupHistoryText = standups.slice(0, 8).map((s: any, i: number) => {
      const summary = summaryMap.get(s._id?.toString()) || 'No summary'
      return `Standup ${i + 1} — ${new Date(s.scheduledDate).toLocaleDateString()} (${s.status})\nParticipants: ${(s.participants || []).map((p: any) => `${p.firstName} ${p.lastName}`).join(', ')}\nSummary: ${summary.substring(0, 400)}...`
    }).join('\n\n---\n\n')

    const taskText = (tasks as any[]).slice(0, 30).map((t: any) =>
      `${t.title} [${t.status}] est:${t.estimatedHours || 0}h actual:${t.actualHours || 0}h`
    ).join('\n')

    const projectPrompt = `You are an AI project tracking assistant. Analyze standup data for "${project.name}" and generate a project tracking report.

SPRINT: ${currentSprint ? `${currentSprint.name} (${currentSprint.status})` : 'No active sprint'}
STANDUPS: ${standups.length} completed (${new Date(dateFrom).toLocaleDateString()} to ${new Date(dateTo).toLocaleDateString()})

${standupHistoryText}

TASKS:
${taskText}

Generate a structured report with sections:
## Executive Summary
## Sprint Risk Assessment
## Ongoing Trends
## PM Follow-Up Items
## Sprint Catch-Up Recommendations
## Key Metrics

Be specific, professional, and actionable.`

    const projectResponse = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: projectPrompt }],
      max_tokens: 2000, temperature: 0.4
    })
    const projectTrackingReport = projectResponse.choices[0]?.message?.content || 'Unable to generate.'

    const personalReports: any[] = []
    for (const [memberId, stats] of memberStatsMap.entries()) {
      const completionRate = stats.totalCommitments > 0 ? Math.round((stats.completedOnTime / stats.totalCommitments) * 100) : 0
      const issuesText = stats.issueComments.length > 0
        ? stats.issueComments.map((i: any) => `  - ${i.date}: "${i.reason}" (Task: ${i.taskTitle})`).join('\n')
        : '  None'

      const res = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{
          role: 'user',
          content: `Generate a personal performance report for "${stats.name}" in project "${project.name}".
Data: ${stats.standupParticipation}/${standups.length} standups, ${stats.completedOnTime}/${stats.totalCommitments} tasks completed (${completionRate}%), ${stats.totalLoggedHours.toFixed(1)}h logged, ${stats.delayed} delays.
Issues:\n${issuesText}
Sections: ## Performance Summary / ## Strengths & Compliments / ## Areas of Concern / ## Recommendations`
        }],
        max_tokens: 700, temperature: 0.4
      })

      personalReports.push({
        memberId,
        memberName: stats.name,
        memberEmail: stats.email,
        report: res.choices[0]?.message?.content || 'Unable to generate.'
      })
    }

    const creatorUser = await User.findById(data.createdBy).select('firstName lastName email').lean() as any
    const generatedByName = creatorUser
      ? `${creatorUser.firstName || ''} ${creatorUser.lastName || ''}`.trim() || creatorUser.email
      : 'Scheduled Job'

    const savedReport = await AIProjectReport.create({
      projectId: data.projectId,
      organizationId: data.organizationId,
      generatedBy: data.createdBy,
      generatedByName: `${generatedByName} (auto)`,
      generatedAt: new Date(),
      standupDateRange: { from: dateFrom, to: dateTo },
      standupCount: standups.length,
      projectName: project.name,
      projectTrackingReport,
      personalReports,
      sentTo: []
    })

    await StandupCronJob.findOneAndUpdate(
      { projectId: data.projectId, jobType: 'ai_tracker' },
      { lastRunStatus: 'success', lastRunAt: new Date(), lastRunError: undefined }
    )

    await Notification.create({
      user: new mongoose.Types.ObjectId(data.createdBy),
      organization: new mongoose.Types.ObjectId(data.organizationId),
      type: 'project',
      title: `Scheduled AI Report Ready — ${project.name}`,
      message: `Your scheduled AI Project Tracking Report for ${project.name} has been generated automatically.`,
      data: {
        entityType: 'project',
        entityId: new mongoose.Types.ObjectId(data.projectId),
        action: 'updated',
        priority: 'medium',
        url: `/tasks/standup-dashboard/${data.projectId}`,
        metadata: { reportId: String(savedReport._id), projectName: project.name }
      },
      isRead: false,
      sentVia: { inApp: true, email: false, push: false }
    })
  } catch (err: any) {
    await StandupCronJob.findOneAndUpdate(
      { projectId: data.projectId, jobType: 'ai_tracker' },
      { lastRunStatus: 'failed', lastRunAt: new Date(), lastRunError: err?.message || 'Unknown error' }
    )
    throw err
  }
}
