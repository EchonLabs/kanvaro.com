import { emptyResult } from '@/lib/standup/jobs/registry'
import { buildJobLogLine } from '@/lib/standup/jobs/log'

describe('buildJobLogLine', () => {
  it('reports counts, duration and outcome as one JSON object', () => {
    const result = { ...emptyResult('mark-missed'), scannedProjects: 4, repaired: 2 }

    const line = JSON.parse(buildJobLogLine({ result, durationMs: 1234, ok: true }))

    expect(line).toMatchObject({
      event: 'standup.job.run',
      job: 'mark-missed',
      ok: true,
      durationMs: 1234,
      scannedProjects: 4,
      created: 0,
      skipped: 0,
      repaired: 2,
      errorCount: 0
    })
    expect(typeof line.at).toBe('string')
  })

  it('summarises errors without letting one project hide the rest', () => {
    const result = {
      ...emptyResult('promote-to-ready'),
      scannedProjects: 3,
      errors: [
        { projectId: 'p1', message: 'boom' },
        { projectId: 'p2', message: 'bang' }
      ]
    }

    const line = JSON.parse(buildJobLogLine({ result, durationMs: 10, ok: false }))

    expect(line.ok).toBe(false)
    expect(line.errorCount).toBe(2)
    expect(line.errors).toEqual([
      { projectId: 'p1', message: 'boom' },
      { projectId: 'p2', message: 'bang' }
    ])
  })
})
