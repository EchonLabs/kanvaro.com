import Bull from 'bull'
import connectDB from '@/lib/db-config'
import { StandupSession } from '@/models/StandupSession'
import { Sprint } from '@/models/Sprint'
import { runEodAnalysis } from './standup-analysis.service'

const QUEUE_NAME = 'standup-eod-analysis'
const ANALYSIS_HOUR = parseInt(process.env.STANDUP_ANALYSIS_HOUR ?? '8', 10)
const WORKING_CIRCLE_START_HOUR = parseInt(
  process.env.STANDUP_WORKING_CIRCLE_START_HOUR ?? '9',
  10
)

let queue: Bull.Queue | null = null

function getQueue(): Bull.Queue {
  if (!queue) {
    const redisUrl = process.env.REDIS_URL
    if (!redisUrl) throw new Error('REDIS_URL environment variable is not set')
    queue = new Bull(QUEUE_NAME, redisUrl, {
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 20,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
      },
    })

    queue.process(async (job) => {
      const { sessionId } = job.data as { sessionId: string }
      await runEodAnalysis(sessionId)
    })

    queue.on('failed', (job, err) => {
      console.error(`[standup-scheduler] Job ${job.id} failed for session ${job.data.sessionId}:`, err.message)
    })
  }
  return queue
}

/**
 * Returns the Date for today's working circle start (e.g. 9 AM today).
 */
function getWorkingCircleStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(WORKING_CIRCLE_START_HOUR, 0, 0, 0)
  return d
}

/**
 * Returns the Date for the working circle end (e.g. 8 AM next day).
 */
function getWorkingCircleEnd(circleStart: Date): Date {
  const end = new Date(circleStart)
  end.setDate(end.getDate() + 1)
  end.setHours(ANALYSIS_HOUR, 0, 0, 0)
  return end
}

/**
 * Returns midnight of the given date (date boundary for the session).
 */
function getSessionDate(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Checks whether a StandupSession for this project+date already has analysis.
 * Used for idempotency — prevents re-running Groq if already done.
 */
export async function shouldRunAnalysis(
  projectId: string,
  date: Date
): Promise<{ run: boolean; sessionId: string | null }> {
  const sessionDate = getSessionDate(date)
  const nextDay = new Date(sessionDate)
  nextDay.setDate(nextDay.getDate() + 1)

  const session = await StandupSession.findOne({
    project: projectId,
    date: { $gte: sessionDate, $lt: nextDay },
  })
    .select('_id analysis')
    .lean() as any

  if (!session) return { run: false, sessionId: null }
  if (session.analysis?.generatedAt) return { run: false, sessionId: session._id.toString() }
  return { run: true, sessionId: session._id.toString() }
}

/**
 * Finds all projects with an active sprint and enqueues EOD analysis
 * for any session that hasn't been analyzed yet.
 *
 * Called once per day (by the cron-style scheduling below or an external cron).
 */
export async function scheduleEodAnalysis(): Promise<void> {
  await connectDB()

  const today = new Date()
  const sessionDate = getSessionDate(today)
  const circleStart = getWorkingCircleStart(today)
  const circleEnd = getWorkingCircleEnd(circleStart)

  // Find all active sprints — one per project
  const activeSprints = await Sprint.find({ status: 'active', archived: false })
    .select('project organization')
    .lean()

  const q = getQueue()

  for (const sprint of activeSprints) {
    const projectId = sprint.project.toString()

    // Ensure a StandupSession exists for today
    let session = await StandupSession.findOne({
      project: sprint.project,
      date: sessionDate,
    }).lean() as any

    if (!session) {
      // Auto-create a pending session so the analysis job has something to work against
      const { User } = await import('@/models/User')
      const { Project } = await import('@/models/Project')

      const project = await Project.findById(sprint.project).select('teamMembers').lean() as any
      const memberIds = project?.teamMembers ?? []

      const newSession = new (await import('@/models/StandupSession')).StandupSession({
        organization: sprint.organization,
        project: sprint.project,
        sprint: sprint._id,
        date: sessionDate,
        workingCircleStart: circleStart,
        workingCircleEnd: circleEnd,
        status: 'pending',
        createdBy: memberIds[0] ?? sprint.organization, // system-created
        members: memberIds,
      })

      try {
        await newSession.save()
        session = newSession.toObject()
      } catch (err: any) {
        // Unique constraint — another process already created it, fetch and proceed
        session = await StandupSession.findOne({
          project: sprint.project,
          date: sessionDate,
        }).lean() as any
        if (!session) continue
      }
    }

    // Skip if already analyzed
    if (session.analysis?.generatedAt) continue

    await q.add(
      { sessionId: (session as any)._id.toString() },
      {
        jobId: `eod-${projectId}-${sessionDate.toISOString().split('T')[0]}`,
        delay: 0,
      }
    )
  }
}

/**
 * Manually enqueues a single session for immediate analysis.
 * Used by the /api/standup/sessions/[id]/analyze route.
 */
export async function enqueueSessionAnalysis(sessionId: string): Promise<void> {
  const q = getQueue()
  await q.add(
    { sessionId },
    {
      jobId: `manual-${sessionId}-${Date.now()}`,
      delay: 0,
      priority: 1, // high priority for manual triggers
    }
  )
}

/**
 * Registers the daily cron-style repeat job.
 * Call once at application startup (e.g. in a custom server or Next.js instrumentation).
 * The job fires daily at ANALYSIS_HOUR (default 8 AM).
 */
export async function registerDailyStandupJob(): Promise<void> {
  const q = getQueue()

  // Remove any existing repeatable job to avoid duplicates on restart
  const repeatableJobs = await q.getRepeatableJobs()
  for (const job of repeatableJobs) {
    if (job.name === 'daily-standup-eod') {
      await q.removeRepeatableByKey(job.key)
    }
  }

  await q.add(
    'daily-standup-eod',
    {},
    {
      repeat: { cron: `0 ${ANALYSIS_HOUR} * * *` },
      jobId: 'daily-standup-eod',
    }
  )

  // Handle the repeatable job — it passes empty data so we schedule all projects
  queue!.process('daily-standup-eod', async () => {
    await scheduleEodAnalysis()
  })
}
