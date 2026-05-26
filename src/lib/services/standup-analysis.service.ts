import mongoose from 'mongoose'
import Groq from 'groq-sdk'
import connectDB from '@/lib/db-config'
import { StandupSession } from '@/models/StandupSession'
import { StandupCommitment } from '@/models/StandupCommitment'
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'
import { IStandupAnalysis } from '@/models/StandupSession'
import {
  buildBriefingSnapshot,
  aggregateTimeLogs,
  detectNoMovement,
  computeHistoricalTrends,
} from './standup-briefing.service'

const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'

const SYSTEM_PROMPT = `You are a sprint health analyst for a software development team. You receive daily standup data and return a structured JSON analysis.

Rules:
- riskScore: integer 0 (no risk) to 100 (sprint will definitely fail). Base it on: task fulfillment rate, days remaining vs tasks done, recurring blockers, zero-movement tasks.
- riskLevel: "low" (0-30), "medium" (31-60), "high" (61-80), "critical" (81-100)
- nudges: max 3 items, only for tasks with zero movement or open blocker notes older than 1 day. Each nudge must be actionable.
- trends: max 3 items, only surface if a pattern appears in 3+ historical sessions. Empty array if insufficient history.
- prioritySuggestions: max 3 items, actionable and specific to the current sprint state.
- summary: 2-3 sentences, factual, specific to today's data.

Return only valid JSON matching this exact schema. No markdown fences, no explanation outside the JSON object:
{
  "riskScore": number,
  "riskLevel": "low"|"medium"|"high"|"critical",
  "summary": string,
  "nudges": [{ "userId": string, "taskId": string, "message": string }],
  "trends": [string],
  "prioritySuggestions": [string]
}`

interface GroqPayload {
  project: { name: string; id: string }
  sprint: {
    name: string
    startDate: string
    endDate: string
    daysRemaining: number
    totalTasks: number
    doneTasks: number
  } | null
  standupDate: string
  workingCircle: { from: string; to: string }
  teamPerformance: {
    userId: string
    name: string
    role: string
    committedCount: number
    fulfilledCount: number
    timeLoggedMinutes: number
    noMovementTasks: string[]
    zeroTimeTasks: string[]
    openTaskTitles: string[]
    openBlockerNote: string | null
  }[]
  openPMNotes: {
    person: string
    task: string
    note: string
    daysOpen: number
  }[]
  historicalTrends: {
    sessionsAnalyzed: number
    avgTeamFulfillmentRate: number
    recurringCarryOvers: { taskTitle: string; daysOpen: number }[]
    perMember: { name: string; fulfillmentRate: number }[]
  }
}

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY environment variable is not set')
  return new Groq({ apiKey })
}

async function buildGroqPayload(
  sessionId: mongoose.Types.ObjectId
): Promise<GroqPayload> {
  const session = await StandupSession.findById(sessionId)
    .populate('project', 'name')
    .populate('sprint')
    .lean() as any

  if (!session) throw new Error(`StandupSession ${sessionId} not found`)

  const project = session.project
  const sprint = session.sprint

  // Sprint stats
  let sprintPayload: GroqPayload['sprint'] = null
  if (sprint) {
    const sprintTasks = await Task.find({ sprint: sprint._id }).select('status').lean()
    const doneTasks = sprintTasks.filter((t) => t.status === 'done').length
    const now = new Date()
    const daysRemaining = Math.max(
      0,
      Math.ceil((new Date(sprint.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    )
    sprintPayload = {
      name: sprint.name,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      daysRemaining,
      totalTasks: sprintTasks.length,
      doneTasks,
    }
  }

  // Commitments for this session
  const commitments = await StandupCommitment.find({ standupSession: sessionId })
    .populate('user', 'firstName lastName role')
    .lean()

  // Collect all task IDs and user IDs
  const allTaskIds: mongoose.Types.ObjectId[] = []
  const allUserIds: mongoose.Types.ObjectId[] = []
  for (const c of commitments) {
    allUserIds.push(c.user as mongoose.Types.ObjectId)
    for (const t of c.tasks) {
      allTaskIds.push(t.task as mongoose.Types.ObjectId)
    }
  }

  const [movedIds, timeMap] = await Promise.all([
    detectNoMovement(allTaskIds, session.workingCircleStart, session.workingCircleEnd),
    aggregateTimeLogs(allUserIds, allTaskIds, session.workingCircleStart, session.workingCircleEnd),
  ])

  // Live task statuses
  const liveTasks = await Task.find({ _id: { $in: allTaskIds } }).select('_id status').lean()
  const liveStatusMap = new Map(liveTasks.map((t) => [(t._id as any).toString(), t.status]))

  const teamPerformance: GroqPayload['teamPerformance'] = []
  const openPMNotes: GroqPayload['openPMNotes'] = []

  for (const commitment of commitments) {
    const user = commitment.user as any
    const userId = (user._id ?? commitment.user).toString()
    const name = user.firstName ? `${user.firstName} ${user.lastName}` : 'Unknown'
    const role = user.role ?? 'team_member'

    let committedCount = 0
    let fulfilledCount = 0
    let totalTimeMinutes = 0
    const noMovementList: string[] = []
    const zeroTimeList: string[] = []
    const openTaskTitles: string[] = []

    for (const t of commitment.tasks) {
      const taskIdStr = t.task.toString()
      const currentStatus = liveStatusMap.get(taskIdStr) ?? t.statusAtCommitment
      const timeLogged = timeMap.get(`${userId}_${taskIdStr}`) ?? 0
      const moved = movedIds.has(taskIdStr)
      const isDone = currentStatus === 'done'

      committedCount++
      totalTimeMinutes += timeLogged

      if (isDone) {
        fulfilledCount++
      } else {
        openTaskTitles.push(t.taskTitle)
        if (!moved) noMovementList.push(t.taskTitle)
        if (timeLogged === 0) zeroTimeList.push(t.taskTitle)
      }
    }

    teamPerformance.push({
      userId,
      name,
      role,
      committedCount,
      fulfilledCount,
      timeLoggedMinutes: totalTimeMinutes,
      noMovementTasks: noMovementList,
      zeroTimeTasks: zeroTimeList,
      openTaskTitles,
      openBlockerNote: commitment.pmNote?.content ?? null,
    })

    if (commitment.pmNote && !commitment.pmNote.resolved) {
      const firstOpenTask = commitment.tasks.find((t: any) => !t.fulfilled)
      if (firstOpenTask) {
        const daysDiff = Math.floor(
          (new Date().getTime() - new Date(commitment.pmNote.createdAt).getTime()) /
            (1000 * 60 * 60 * 24)
        )
        openPMNotes.push({
          person: name,
          task: firstOpenTask.taskTitle,
          note: commitment.pmNote.content,
          daysOpen: daysDiff,
        })
      }
    }
  }

  // Historical trends
  const history = await computeHistoricalTrends(
    session.project as mongoose.Types.ObjectId,
    session.workingCircleStart,
    7
  )

  return {
    project: { name: project.name, id: project._id.toString() },
    sprint: sprintPayload,
    standupDate: session.date.toISOString().split('T')[0],
    workingCircle: {
      from: session.workingCircleStart.toISOString(),
      to: session.workingCircleEnd.toISOString(),
    },
    teamPerformance,
    openPMNotes,
    historicalTrends: {
      sessionsAnalyzed: history.sessionsAnalyzed,
      avgTeamFulfillmentRate: Math.round(history.avgTeamFulfillmentRate * 100) / 100,
      recurringCarryOvers: history.recurringCarryOvers.map((r) => ({
        taskTitle: r.taskTitle,
        daysOpen: r.daysOpen,
      })),
      perMember: history.perMember.map((m) => ({
        name: m.name,
        fulfillmentRate: Math.round(m.fulfillmentRate * 100) / 100,
      })),
    },
  }
}

async function callGroq(payload: GroqPayload): Promise<IStandupAnalysis> {
  const client = getGroqClient()

  const response = await client.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    temperature: 0.2,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  let parsed: any

  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Groq returned invalid JSON: ${raw.slice(0, 200)}`)
  }

  // Validate and normalise the response
  const riskScore = Math.min(100, Math.max(0, Number(parsed.riskScore) || 0))
  const riskLevels = ['low', 'medium', 'high', 'critical'] as const
  const riskLevel = riskLevels.includes(parsed.riskLevel) ? parsed.riskLevel : 'medium'

  return {
    riskScore,
    riskLevel,
    summary: String(parsed.summary ?? ''),
    nudges: Array.isArray(parsed.nudges)
      ? parsed.nudges.slice(0, 3).map((n: any) => ({
          userId: new mongoose.Types.ObjectId(n.userId),
          taskId: new mongoose.Types.ObjectId(n.taskId),
          message: String(n.message ?? ''),
        }))
      : [],
    trends: Array.isArray(parsed.trends) ? parsed.trends.slice(0, 3).map(String) : [],
    prioritySuggestions: Array.isArray(parsed.prioritySuggestions)
      ? parsed.prioritySuggestions.slice(0, 3).map(String)
      : [],
    generatedAt: new Date(),
  }
}

async function saveAnalysis(
  sessionId: mongoose.Types.ObjectId,
  analysis: IStandupAnalysis
): Promise<void> {
  await StandupSession.findByIdAndUpdate(sessionId, { $set: { analysis } })

  // Emit real-time event so the PM dashboard refreshes — best-effort, never blocks
  try {
    const session = await StandupSession.findById(sessionId).select('project organization').lean() as any
    if (session) {
      const { broadcastProjectUpdate } = await import('@/lib/realtime')
      await broadcastProjectUpdate(
        session.organization.toString(),
        session.project.toString(),
        { sessionId: sessionId.toString(), riskScore: analysis.riskScore, riskLevel: analysis.riskLevel },
        'system'
      )
    }
  } catch {
    // Real-time broadcast is best-effort
  }
}

/**
 * Main orchestrator: builds briefing → payload → Groq → saves.
 * Idempotent: skips if analysis already exists for this session.
 */
export async function runEodAnalysis(sessionId: string): Promise<IStandupAnalysis> {
  await connectDB()

  const id = new mongoose.Types.ObjectId(sessionId)
  const session = await StandupSession.findById(id).lean() as any

  if (!session) throw new Error(`StandupSession ${sessionId} not found`)

  // Idempotency: don't re-run if already done
  if (session.analysis?.generatedAt) {
    return session.analysis as IStandupAnalysis
  }

  // Build or refresh briefing snapshot if not done yet
  if (!session.briefingSnapshot) {
    const { StandupSession: SS } = await import('@/models/StandupSession')

    // Find previous session to carry over gaps
    const previousSession = await SS.findOne({
      project: session.project,
      date: { $lt: session.date },
    })
      .sort({ date: -1 })
      .select('_id')
      .lean() as any

    const snapshot = await buildBriefingSnapshot({
      projectId: session.project as mongoose.Types.ObjectId,
      sessionDate: session.date,
      workingCircleStart: session.workingCircleStart,
      workingCircleEnd: session.workingCircleEnd,
      previousSessionId: previousSession ? (previousSession._id as mongoose.Types.ObjectId) : null,
    })

    await SS.findByIdAndUpdate(id, { $set: { briefingSnapshot: snapshot } })
  }

  const payload = await buildGroqPayload(id)
  const analysis = await callGroq(payload)
  await saveAnalysis(id, analysis)

  return analysis
}

export { buildGroqPayload, callGroq, saveAnalysis }
