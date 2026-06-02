// Bull queue worker — run with: npm run worker
// Processes standup automation jobs (AI tracker + summary generator)
import { getStandupQueue } from './lib/queue/standupQueue'
import { processAITracker } from './lib/queue/processors/aiTrackerProcessor'
import { processSummaryGenerator } from './lib/queue/processors/summaryGeneratorProcessor'

const queue = getStandupQueue()

queue.process(async (job) => {
  const { jobType } = job.data
  console.log(`[worker] Processing job: ${jobType} for project ${job.data.projectId}`)

  if (jobType === 'ai_tracker') {
    await processAITracker(job.data)
  } else if (jobType === 'summary_generator') {
    await processSummaryGenerator(job.data)
  } else {
    throw new Error(`Unknown jobType: ${jobType}`)
  }

  console.log(`[worker] Completed: ${jobType} for project ${job.data.projectId}`)
})

queue.on('completed', (job) => {
  console.log(`[worker] Job ${job.id} (${job.data.jobType}) completed`)
})

queue.on('failed', (job, err) => {
  console.error(`[worker] Job ${job.id} (${job.data.jobType}) failed:`, err.message)
})

queue.on('error', (err) => {
  console.error('[worker] Queue error:', err.message)
})

console.log('[worker] Standup automation worker started — waiting for jobs...')
