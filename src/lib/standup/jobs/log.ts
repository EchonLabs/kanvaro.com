import type { JobResult } from './registry'

export interface JobLogInput {
  result: JobResult
  durationMs: number
  ok: boolean
}

/**
 * One line of NFR-16 structured log output.
 *
 * JSON on a single line so `docker logs` stays greppable and a log shipper can
 * parse it without a multiline rule.
 */
export function buildJobLogLine({ result, durationMs, ok }: JobLogInput): string {
  return JSON.stringify({
    event: 'standup.job.run',
    at: new Date().toISOString(),
    job: result.job,
    ok,
    durationMs,
    scannedProjects: result.scannedProjects,
    created: result.created,
    skipped: result.skipped,
    repaired: result.repaired,
    errorCount: result.errors.length,
    errors: result.errors
  })
}

export function logJobRun(input: JobLogInput): void {
  // eslint-disable-next-line no-console -- NFR-16: this IS the observability surface.
  console.log(buildJobLogLine(input))
}
