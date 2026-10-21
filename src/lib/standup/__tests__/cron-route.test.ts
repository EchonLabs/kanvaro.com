import { handleCronJobRequest } from '@/lib/standup/jobs/http'
import { emptyResult, type JobResult, type StandupJobName } from '@/lib/standup/jobs/registry'

const headers = (token?: string) => ({
  get: (name: string) =>
    name.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null
})

describe('handleCronJobRequest', () => {
  const original = process.env.CRON_SECRET

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })

  /** Records which job was asked for, so we can assert it never ran. */
  const spyRun = (result: JobResult | null = null) => {
    const calls: StandupJobName[] = []
    const run = async (job: StandupJobName) => {
      calls.push(job)
      return result
    }
    return { calls, run }
  }

  it('rejects an unknown job name without running anything', async () => {
    delete process.env.CRON_SECRET
    const { calls, run } = spyRun()

    const response = await handleCronJobRequest(headers(), 'not-a-job', run)

    expect(response.status).toBe(404)
    expect(calls).toEqual([])
  })

  it('reports a skip when the job has no implementation', async () => {
    delete process.env.CRON_SECRET
    const { calls, run } = spyRun(null)

    const response = await handleCronJobRequest(headers(), 'mark-missed', run)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ job: 'mark-missed', ran: false })
    expect(calls).toEqual(['mark-missed'])
  })

  it('returns the job result when it ran', async () => {
    delete process.env.CRON_SECRET
    const result = { ...emptyResult('mark-missed'), scannedProjects: 3, repaired: 1 }
    const { run } = spyRun(result)

    const response = await handleCronJobRequest(headers(), 'mark-missed', run)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ job: 'mark-missed', ran: true, repaired: 1, skipped: 0 })
  })

  it('runs without a token when CRON_SECRET is unset (CRON-1)', async () => {
    delete process.env.CRON_SECRET
    const { calls, run } = spyRun()

    expect((await handleCronJobRequest(headers(), 'mark-missed', run)).status).toBe(200)
    expect(calls).toEqual(['mark-missed'])
  })

  it('returns 401 and runs nothing when CRON_SECRET is set and the token is wrong', async () => {
    process.env.CRON_SECRET = 'topsecret'
    const { calls, run } = spyRun()

    const response = await handleCronJobRequest(headers('wrong'), 'mark-missed', run)

    expect(response.status).toBe(401)
    expect(calls).toEqual([])
  })

  it('accepts the matching token when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'topsecret'
    const { calls, run } = spyRun()

    const response = await handleCronJobRequest(headers('topsecret'), 'mark-missed', run)

    expect(response.status).toBe(200)
    expect(calls).toEqual(['mark-missed'])
  })
})
