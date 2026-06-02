import Bull from 'bull'
import type { CronFrequency, CronJobType } from '@/models/StandupCronJob'

export interface StandupJobData {
  jobType: CronJobType
  projectId: string
  organizationId: string
  createdBy: string
}

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

let _queue: Bull.Queue<StandupJobData> | null = null

export function getStandupQueue(): Bull.Queue<StandupJobData> {
  if (!_queue) {
    _queue = new Bull<StandupJobData>('standup-automation', REDIS_URL, {
      defaultJobOptions: { removeOnComplete: 50, removeOnFail: 20 }
    })
  }
  return _queue
}

export function toCronExpression(frequency: CronFrequency, timeHHMM: string): string {
  const [h, m] = timeHHMM.split(':')
  switch (frequency) {
    case 'daily':    return `${m} ${h} * * *`
    case 'weekdays': return `${m} ${h} * * 1-5`
    case 'weekly':   return `${m} ${h} * * 1`
    default:         return `${m} ${h} * * *`
  }
}

// Unique key used to identify and remove/replace a repeatable job
export function jobRepeatKey(projectId: string, jobType: CronJobType): string {
  return `${projectId}__${jobType}`
}
