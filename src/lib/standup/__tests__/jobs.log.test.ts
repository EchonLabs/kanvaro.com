import { emptyResult } from '@/lib/standup/jobs/registry'
import { buildJobLogLine, buildPrettyJobLogLine, logJobRun } from '@/lib/standup/jobs/log'

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

describe('buildPrettyJobLogLine', () => {
  it('shows one aligned line and hides zero created / repaired / error counts', () => {
    const result = { ...emptyResult('mark-missed'), scannedProjects: 1, skipped: 2 }

    const line = buildPrettyJobLogLine({ result, durationMs: 9, ok: true })

    expect(line).toMatch(/^\d{2}:\d{2}:\d{2} {2}✓ mark-missed {14}1 project {5}2 skipped {2}9 ms$/)
    expect(line).not.toMatch(/created|repaired|errors/)
  })

  it('surfaces non-zero counts and lists each error under the line', () => {
    const result = {
      ...emptyResult('promote-to-ready'),
      scannedProjects: 3,
      created: 1,
      repaired: 2,
      errors: [{ projectId: 'p1', message: 'boom' }]
    }

    const lines = buildPrettyJobLogLine({ result, durationMs: 10, ok: false }).split('\n')

    expect(lines[0]).toContain('✗ promote-to-ready')
    expect(lines[0]).toContain('3 projects')
    expect(lines[0]).toContain('1 created  2 repaired  1 errors')
    expect(lines[1]).toContain('p1: boom')
  })
})

describe('logJobRun', () => {
  const original = process.stdout.isTTY
  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: original, configurable: true })
    jest.restoreAllMocks()
  })

  const run = (isTTY: boolean) => {
    Object.defineProperty(process.stdout, 'isTTY', { value: isTTY, configurable: true })
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {})
    logJobRun({ result: emptyResult('mark-missed'), durationMs: 5, ok: true })
    return spy.mock.calls[0][0] as string
  }

  it('prints readable text on a terminal', () => {
    expect(run(true)).toContain('✓ mark-missed')
  })

  it('prints single-line JSON when stdout is not a terminal', () => {
    expect(JSON.parse(run(false)).event).toBe('standup.job.run')
  })
})
